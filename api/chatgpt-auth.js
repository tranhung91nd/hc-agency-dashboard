// HC Agency Dashboard — ChatGPT OAuth (PKCE) auth endpoint
// Triển khai dưới dạng Vercel Serverless Function tại /api/chatgpt-auth
//
// Cơ chế: copy luồng OAuth của Codex CLI (xem goclaw/internal/oauth/openai.go).
// Vì client_id của Codex chỉ accept redirect_uri=http://localhost:1455/auth/callback,
// nên user phải scan login trên trình duyệt local, browser sẽ redirect về localhost:1455
// (hiện lỗi connection refused — không sao), user copy nguyên URL paste vào dashboard.
//
// Actions:
//   GET  ?action=start    → trả về { auth_url, state, code_verifier }
//   POST ?action=callback → body { redirect_url, state, code_verifier } → đổi code → lưu token
//   GET  ?action=status   → trả về { connected, plan_type, account_id, expires_at }
//   POST ?action=logout   → xoá token

const { createClient } = require('@supabase/supabase-js');
const crypto = require('crypto');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const OPENAI_AUTH_URL = 'https://auth.openai.com/oauth/authorize';
const OPENAI_TOKEN_URL = 'https://auth.openai.com/oauth/token';
const OPENAI_CLIENT_ID = 'app_EMoamEEZ73f0CkXaXp7hrann';
const OPENAI_REDIRECT_URI = 'http://localhost:1455/auth/callback';
const OPENAI_SCOPES = 'openid profile email offline_access api.connectors.read api.connectors.invoke';

const PROVIDER_KEY = 'openai-codex';

const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

function b64url(buf) {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function generatePKCE() {
  const verifier = b64url(crypto.randomBytes(64));
  const challenge = b64url(crypto.createHash('sha256').update(verifier).digest());
  return { verifier, challenge };
}

function generateState() {
  return b64url(crypto.randomBytes(16));
}

function buildAuthURL(challenge, state) {
  const params = new URLSearchParams({
    client_id: OPENAI_CLIENT_ID,
    redirect_uri: OPENAI_REDIRECT_URI,
    response_type: 'code',
    scope: OPENAI_SCOPES,
    code_challenge: challenge,
    code_challenge_method: 'S256',
    state: state,
    codex_cli_simplified_flow: 'true',
    id_token_add_organizations: 'true',
    originator: 'pi'
  });
  return OPENAI_AUTH_URL + '?' + params.toString();
}

// Parse JWT id_token / access_token để moi account_id + plan_type (best-effort, không verify chữ ký).
function parseJWTClaims(token) {
  try {
    const parts = String(token || '').split('.');
    if (parts.length < 2) return {};
    const payload = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = payload + '==='.slice((payload.length + 3) % 4);
    const json = Buffer.from(padded, 'base64').toString('utf8');
    return JSON.parse(json);
  } catch (_) {
    return {};
  }
}

function extractMetadata(tokenResp) {
  const claims = parseJWTClaims(tokenResp.id_token || tokenResp.access_token);
  const auth = claims['https://api.openai.com/auth'] || {};
  return {
    account_id: auth.chatgpt_account_id || claims.chatgpt_account_id || null,
    plan_type: auth.chatgpt_plan_type || claims.chatgpt_plan_type || null
  };
}

async function exchangeCode(code, verifier) {
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    client_id: OPENAI_CLIENT_ID,
    code: code,
    redirect_uri: OPENAI_REDIRECT_URI,
    code_verifier: verifier
  });
  const resp = await fetch(OPENAI_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString()
  });
  const text = await resp.text();
  if (!resp.ok) throw new Error('Token exchange HTTP ' + resp.status + ': ' + text);
  return JSON.parse(text);
}

async function saveToken(tokenResp) {
  const meta = extractMetadata(tokenResp);
  const expiresAt = new Date(Date.now() + (Number(tokenResp.expires_in) || 0) * 1000).toISOString();
  const row = {
    provider: PROVIDER_KEY,
    access_token: tokenResp.access_token,
    refresh_token: tokenResp.refresh_token,
    expires_at: expiresAt,
    account_id: meta.account_id,
    plan_type: meta.plan_type,
    scopes: tokenResp.scope || OPENAI_SCOPES,
    updated_at: new Date().toISOString()
  };
  const { error } = await sb.from('oauth_tokens').upsert(row, { onConflict: 'provider' });
  if (error) throw new Error('Supabase upsert: ' + error.message);
  return row;
}

async function getStatus() {
  const { data, error } = await sb
    .from('oauth_tokens')
    .select('provider,expires_at,account_id,plan_type,scopes,updated_at')
    .eq('provider', PROVIDER_KEY)
    .maybeSingle();
  if (error) throw new Error('Supabase select: ' + error.message);
  if (!data) return { connected: false };
  return {
    connected: true,
    expires_at: data.expires_at,
    account_id: data.account_id,
    plan_type: data.plan_type,
    scopes: data.scopes,
    updated_at: data.updated_at
  };
}

async function deleteToken() {
  const { error } = await sb.from('oauth_tokens').delete().eq('provider', PROVIDER_KEY);
  if (error) throw new Error('Supabase delete: ' + error.message);
}

function send(res, code, body) {
  res.status(code).setHeader('Content-Type', 'application/json');
  res.send(JSON.stringify(body));
}

module.exports = async (req, res) => {
  const action = (req.query && req.query.action) || '';
  try {
    if (req.method === 'GET' && action === 'start') {
      const { verifier, challenge } = generatePKCE();
      const state = generateState();
      const authURL = buildAuthURL(challenge, state);
      return send(res, 200, { auth_url: authURL, state, code_verifier: verifier });
    }

    if (req.method === 'POST' && action === 'callback') {
      const body = req.body || {};
      const { redirect_url, state, code_verifier } = body;
      if (!redirect_url || !state || !code_verifier) {
        return send(res, 400, { error: 'Thiếu redirect_url / state / code_verifier' });
      }
      let parsed;
      try { parsed = new URL(redirect_url); }
      catch (_) { return send(res, 400, { error: 'redirect_url không hợp lệ' }); }
      const code = parsed.searchParams.get('code');
      const returnedState = parsed.searchParams.get('state');
      const oauthErr = parsed.searchParams.get('error');
      if (oauthErr) return send(res, 400, { error: 'OAuth error: ' + oauthErr });
      if (!code) return send(res, 400, { error: 'URL không chứa code' });
      if (returnedState !== state) return send(res, 400, { error: 'state không khớp (CSRF)' });

      const tokenResp = await exchangeCode(code, code_verifier);
      const saved = await saveToken(tokenResp);
      return send(res, 200, {
        connected: true,
        plan_type: saved.plan_type,
        account_id: saved.account_id,
        expires_at: saved.expires_at
      });
    }

    if (req.method === 'GET' && action === 'status') {
      const s = await getStatus();
      return send(res, 200, s);
    }

    if (req.method === 'POST' && action === 'logout') {
      await deleteToken();
      return send(res, 200, { connected: false });
    }

    return send(res, 400, { error: 'Action không hợp lệ. Dùng ?action=start|callback|status|logout' });
  } catch (e) {
    console.error('[chatgpt-auth]', action, e);
    return send(res, 500, { error: e.message || String(e) });
  }
};
