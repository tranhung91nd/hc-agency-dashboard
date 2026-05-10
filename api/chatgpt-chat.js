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

// Pin về Singapore — IP Asia datacenter ít bị Cloudflare WAF của ChatGPT flag hơn
// IAD/SFO mặc định. Nếu vẫn lỗi, fallback proxy local qua ngrok.
export const config = { runtime: 'edge', regions: ['sin1'] };

const OPENAI_TOKEN_URL = 'https://auth.openai.com/oauth/token';
const OPENAI_CLIENT_ID = 'app_EMoamEEZ73f0CkXaXp7hrann';
const CODEX_API_BASE = 'https://chatgpt.com/backend-api';
const PROVIDER_KEY = 'openai-codex';
const REFRESH_MARGIN_MS = 5 * 60 * 1000; // refresh nếu còn dưới 5 phút

// Nếu set CHATGPT_PROXY_URL (e.g. https://abc.ngrok.io), forward qua proxy local
// thay vì gọi chatgpt.com trực tiếp — bypass Cloudflare WAF chặn IP datacenter Vercel.
// Xem scripts/chatgpt-proxy.js.
const PROXY_URL = (process.env.CHATGPT_PROXY_URL || '').replace(/\/+$/, '');
const PROXY_SECRET = process.env.HC_PROXY_SECRET || '';

// Header khớp Codex CLI để pass Cloudflare WAF + cho phép dùng các model mới.
// Bump version để ChatGPT không reject model gpt-5.4 vì "outdated CLI".
const CODEX_CLI_VERSION = '0.91.0';
const CODEX_USER_AGENT = 'codex_cli_rs/' + CODEX_CLI_VERSION + ' (Linux 6.0.0; x86_64) Terminal';

// UUID v4 đơn giản — Edge runtime có crypto.randomUUID()
function newSessionID() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  // Fallback nếu runtime cũ
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

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

async function getValidTokenAndAccount() {
  const row = await sbSelect();
  if (!row) throw new Error('Chưa kết nối ChatGPT — vào Admin → Cài đặt API Key để kết nối.');

  const expiresAt = row.expires_at ? new Date(row.expires_at).getTime() : 0;
  if (expiresAt - Date.now() > REFRESH_MARGIN_MS) {
    return { token: row.access_token, accountID: row.account_id };
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
  return { token: newToken.access_token, accountID: row.account_id };
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

  let token, accountID;
  try {
    const tk = await getValidTokenAndAccount();
    token = tk.token; accountID = tk.accountID;
  }
  catch (e) { return jsonResp(401, { error: e.message || String(e) }); }

  const codexBody = buildCodexBody(messages, body.model, true);
  const headers = {
    'Content-Type': 'application/json',
    Authorization: 'Bearer ' + token,
    'OpenAI-Beta': 'responses=v1',
    Accept: 'text/event-stream',
    'User-Agent': CODEX_USER_AGENT,
    originator: 'codex_cli_rs',
    version: CODEX_CLI_VERSION,
    session_id: newSessionID()
  };
  if (accountID) headers['chatgpt-account-id'] = accountID;

  // Endpoint: proxy local nếu có set (bypass CF), ngược lại gọi chatgpt.com trực tiếp
  const endpoint = PROXY_URL
    ? PROXY_URL + '/codex/responses'
    : CODEX_API_BASE + '/codex/responses';
  if (PROXY_URL && PROXY_SECRET) {
    headers['X-HC-Proxy-Secret'] = PROXY_SECRET;
  }

  let upstream;
  try {
    upstream = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify(codexBody)
    });
  } catch (e) {
    return jsonResp(502, { error: 'Lỗi kết nối ChatGPT: ' + (e.message || e) });
  }

  // Detect HTML response (Cloudflare challenge / abuse page / login redirect / etc).
  const ct = (upstream.headers.get('content-type') || '').toLowerCase();
  const cfRay = upstream.headers.get('cf-ray') || '';
  const isHTML = ct.includes('text/html') || ct.includes('application/xhtml');
  if (isHTML) {
    const fullText = await upstream.text();
    const lower = fullText.toLowerCase();
    const isCF = lower.includes('cdn-cgi') || lower.includes('cloudflare') ||
                 lower.includes('challenge-platform') || lower.includes('cf-error') ||
                 lower.includes('error 1020') || lower.includes('attention required') ||
                 !!cfRay;
    const snippet = fullText.slice(0, 400).replace(/\s+/g, ' ').trim();
    return jsonResp(upstream.status || 403, {
      error: isCF
        ? ('Cloudflare WAF chặn request từ Vercel (status ' + upstream.status + ', cf-ray ' + (cfRay || 'n/a') +
           '). IP datacenter bị flag — thử đổi Vercel region (sin1/hkg1), hoặc chạy proxy local.')
        : ('ChatGPT trả HTML status ' + upstream.status + ' (cf-ray ' + (cfRay || 'n/a') + '). Snippet: ' + snippet),
      debug: { status: upstream.status, content_type: ct, cf_ray: cfRay, snippet }
    });
  }

  if (!upstream.ok) {
    const errText = (await upstream.text()).slice(0, 800);
    return jsonResp(upstream.status, { error: 'ChatGPT HTTP ' + upstream.status + ': ' + errText });
  }

  try {
    const { content, usage } = await consumeCodexStream(upstream.body);
    return jsonResp(200, { content, usage });
  } catch (e) {
    return jsonResp(500, { error: 'Stream parse: ' + (e.message || e) });
  }
}
