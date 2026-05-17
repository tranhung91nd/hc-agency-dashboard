// HC Agency Dashboard — TikTok Marketing API proxy
// Vercel Serverless Function tại /api/tiktok
//
// ENV cần (Vercel project — điền sau khi TikTok duyệt app):
//   TIKTOK_APP_ID
//   TIKTOK_APP_SECRET
//   TIKTOK_ACCESS_TOKEN          — long-term token sau OAuth
//   SUPABASE_URL                 — đã có sẵn
//   SUPABASE_SERVICE_ROLE_KEY    — đã có sẵn

const { createClient } = require('@supabase/supabase-js');

const TIKTOK_APP_ID = process.env.TIKTOK_APP_ID || '';
const TIKTOK_APP_SECRET = process.env.TIKTOK_APP_SECRET || '';
const TIKTOK_ACCESS_TOKEN = process.env.TIKTOK_ACCESS_TOKEN || '';
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const API_BASE = 'https://business-api.tiktok.com/open_api/v1.3/';

// Whitelist path TikTok API được phép proxy
const PATH_WHITELIST = [
  /^advertiser\/info\/$/,           // info 1-n advertiser
  /^report\/integrated\/get\/$/,    // báo cáo spend daily
  /^campaign\/get\/$/,              // list campaigns
  /^adgroup\/get\/$/,               // list adgroups
  /^ad\/get\/$/,                    // list ads
];

function isPathAllowed(rawPath) {
  const path = String(rawPath || '').replace(/^\/+/, '');
  return PATH_WHITELIST.some(re => re.test(path));
}

async function verifyAuth(req) {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) return null;
  const auth = req.headers.authorization || req.headers.Authorization || '';
  const token = auth.replace(/^Bearer\s+/i, '').trim();
  if (!token) return null;
  const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
  const { data, error } = await sb.auth.getUser(token);
  if (error || !data || !data.user) return null;
  return data.user;
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'method_not_allowed' });
    return;
  }

  if (!TIKTOK_ACCESS_TOKEN) {
    res.status(503).json({ error: 'tiktok_not_configured', message: 'TIKTOK_ACCESS_TOKEN chưa set trong Vercel env. App TikTok còn đang chờ duyệt.' });
    return;
  }

  const user = await verifyAuth(req);
  if (!user) {
    res.status(401).json({ error: 'unauthorized' });
    return;
  }

  const body = req.body || {};
  const op = body.op || 'get';
  const path = body.path || '';
  const params = body.params || {};

  if (!isPathAllowed(path)) {
    res.status(403).json({ error: 'path_not_allowed', path: path });
    return;
  }

  try {
    let url = API_BASE + path.replace(/^\/+/, '');
    let init = {
      method: op === 'post' ? 'POST' : 'GET',
      headers: {
        'Access-Token': TIKTOK_ACCESS_TOKEN,
        'Content-Type': 'application/json',
      },
    };

    if (op === 'get' && Object.keys(params).length) {
      const qs = new URLSearchParams();
      Object.keys(params).forEach(k => {
        const v = params[k];
        qs.append(k, typeof v === 'object' ? JSON.stringify(v) : String(v));
      });
      url += '?' + qs.toString();
    } else if (op === 'post') {
      init.body = JSON.stringify(params);
    }

    const r = await fetch(url, init);
    const text = await r.text();
    let json;
    try { json = JSON.parse(text); } catch (e) { json = { raw: text }; }

    res.status(r.status).json(json);
  } catch (err) {
    res.status(500).json({ error: 'proxy_error', message: String(err && err.message || err) });
  }
};
