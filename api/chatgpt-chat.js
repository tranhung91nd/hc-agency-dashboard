// HC Agency Dashboard — ChatGPT proxy chat (Edge runtime)
// Triển khai dưới dạng Vercel Edge Function tại /api/chatgpt-chat
//
// Nhận messages từ client, đọc OAuth token từ Supabase (auto-refresh nếu sắp hết hạn),
// POST lên https://chatgpt.com/backend-api/codex/responses (SSE stream),
// gom output_text deltas, trả lại 1 JSON { content, usage } để client hiển thị
// (giữ contract giống response của OpenAI/Anthropic chat hiện tại).
//
// Body request: { model?: string, messages: [{role, content}], max_tokens?: number }
//
// Endpoint Codex chỉ chấp nhận stream=true. Default model: gpt-5.4 (theo Codex CLI).

export const config = { runtime: 'edge' };

const OPENAI_TOKEN_URL = 'https://auth.openai.com/oauth/token';
const OPENAI_CLIENT_ID = 'app_EMoamEEZ73f0CkXaXp7hrann';
const CODEX_API_BASE = 'https://chatgpt.com/backend-api';
const PROVIDER_KEY = 'openai-codex';
const REFRESH_MARGIN_MS = 5 * 60 * 1000; // refresh nếu còn dưới 5 phút

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

function jsonResp(code, body) {
  return new Response(JSON.stringify(body), {
    status: code,
    headers: { 'Content-Type': 'application/json' }
  });
}

// ── Supabase REST helpers (không dùng SDK để giữ Edge bundle nhẹ) ──
async function sbSelect() {
  const url = SUPABASE_URL + '/rest/v1/oauth_tokens?provider=eq.' + PROVIDER_KEY + '&select=*';
  const resp = await fetch(url, {
    headers: {
      apikey: SUPABASE_SERVICE_KEY,
      Authorization: 'Bearer ' + SUPABASE_SERVICE_KEY,
      Accept: 'application/json'
    }
  });
  if (!resp.ok) throw new Error('Supabase select HTTP ' + resp.status + ': ' + await resp.text());
  const arr = await resp.json();
  return arr[0] || null;
}

async function sbUpdateTokens(patch) {
  const url = SUPABASE_URL + '/rest/v1/oauth_tokens?provider=eq.' + PROVIDER_KEY;
  const resp = await fetch(url, {
    method: 'PATCH',
    headers: {
      apikey: SUPABASE_SERVICE_KEY,
      Authorization: 'Bearer ' + SUPABASE_SERVICE_KEY,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal'
    },
    body: JSON.stringify({ ...patch, updated_at: new Date().toISOString() })
  });
  if (!resp.ok) throw new Error('Supabase patch HTTP ' + resp.status + ': ' + await resp.text());
}

// ── OAuth refresh ──
async function refreshAccessToken(refreshToken) {
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    client_id: OPENAI_CLIENT_ID,
    refresh_token: refreshToken
  });
  const resp = await fetch(OPENAI_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString()
  });
  const text = await resp.text();
  if (!resp.ok) throw new Error('Refresh HTTP ' + resp.status + ': ' + text);
  return JSON.parse(text);
}

async function getValidToken() {
  const row = await sbSelect();
  if (!row) throw new Error('Chưa kết nối ChatGPT — vào Admin → Cài đặt API Key để kết nối.');

  const expiresAt = row.expires_at ? new Date(row.expires_at).getTime() : 0;
  if (expiresAt - Date.now() > REFRESH_MARGIN_MS) {
    return row.access_token;
  }

  // Refresh
  const newToken = await refreshAccessToken(row.refresh_token);
  const newExpiresAt = new Date(Date.now() + (Number(newToken.expires_in) || 0) * 1000).toISOString();
  const patch = {
    access_token: newToken.access_token,
    expires_at: newExpiresAt
  };
  if (newToken.refresh_token) patch.refresh_token = newToken.refresh_token;
  await sbUpdateTokens(patch);
  return newToken.access_token;
}

// ── Build /codex/responses request body từ messages OpenAI-style ──
function buildCodexBody(messages, model, stream) {
  let instructions = '';
  const input = [];
  for (const m of messages || []) {
    if (m.role === 'system') {
      instructions = instructions ? instructions + '\n\n' + m.content : m.content;
    } else if (m.role === 'user') {
      input.push({ role: 'user', content: m.content });
    } else if (m.role === 'assistant') {
      if (m.content) {
        input.push({
          type: 'message',
          role: 'assistant',
          content: [{ type: 'output_text', text: m.content }]
        });
      }
    }
  }
  return {
    model: model || 'gpt-5.4',
    instructions: instructions || 'You are a helpful assistant.',
    input,
    stream: !!stream,
    store: false
  };
}

// ── Parse SSE stream từ /codex/responses, gom output_text ──
async function consumeCodexStream(stream) {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  let content = '';
  let usage = null;

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });

    // SSE frames cách nhau bởi blank line. Mỗi frame có thể nhiều dòng "data: ..."
    let nl;
    while ((nl = buf.indexOf('\n\n')) >= 0) {
      const frame = buf.slice(0, nl);
      buf = buf.slice(nl + 2);
      const lines = frame.split('\n');
      const dataLines = lines.filter(l => l.startsWith('data:')).map(l => l.slice(5).trim());
      if (!dataLines.length) continue;
      const data = dataLines.join('\n');
      if (data === '[DONE]' || !data) continue;

      let event;
      try { event = JSON.parse(data); } catch (_) { continue; }
      const type = event.type;

      if (type === 'response.output_text.delta') {
        if (typeof event.delta === 'string') content += event.delta;
      } else if (type === 'response.completed' || type === 'response.incomplete') {
        if (event.response && event.response.usage) {
          const u = event.response.usage;
          usage = {
            prompt_tokens: u.input_tokens || 0,
            completion_tokens: u.output_tokens || 0,
            total_tokens: u.total_tokens || 0
          };
        }
      } else if (type === 'response.failed') {
        const msg = (event.response && event.response.error && (event.response.error.message || event.response.error.code))
          || 'Codex response failed';
        throw new Error(msg);
      }
    }
  }
  return { content, usage };
}

export default async function handler(req) {
  if (req.method !== 'POST') return jsonResp(405, { error: 'Method not allowed' });

  let body;
  try { body = await req.json(); }
  catch (_) { return jsonResp(400, { error: 'Body không phải JSON' }); }

  const messages = Array.isArray(body.messages) ? body.messages : null;
  if (!messages || !messages.length) return jsonResp(400, { error: 'Thiếu messages' });

  let token;
  try { token = await getValidToken(); }
  catch (e) { return jsonResp(401, { error: e.message || String(e) }); }

  const codexBody = buildCodexBody(messages, body.model, true);

  let upstream;
  try {
    upstream = await fetch(CODEX_API_BASE + '/codex/responses', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer ' + token,
        'OpenAI-Beta': 'responses=v1'
      },
      body: JSON.stringify(codexBody)
    });
  } catch (e) {
    return jsonResp(502, { error: 'Lỗi kết nối ChatGPT: ' + (e.message || e) });
  }

  if (!upstream.ok) {
    const errText = await upstream.text();
    return jsonResp(upstream.status, { error: 'ChatGPT HTTP ' + upstream.status + ': ' + errText });
  }

  try {
    const { content, usage } = await consumeCodexStream(upstream.body);
    return jsonResp(200, { content, usage });
  } catch (e) {
    return jsonResp(500, { error: 'Stream parse: ' + (e.message || e) });
  }
}
