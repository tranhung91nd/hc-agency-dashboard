// HC Agency Dashboard — TikTok Marketing API proxy
// API handler tại /api/tiktok, được mount bởi server.js.
//
// ENV cần trên server sau khi TikTok duyệt app:
//   TIKTOK_APP_ID
//   TIKTOK_APP_SECRET
//   TIKTOK_ACCESS_TOKEN          — long-term token sau OAuth

const { verifyBearerUser } = require('./_lib/db');

const TIKTOK_APP_ID = process.env.TIKTOK_APP_ID || '';
const TIKTOK_APP_SECRET = process.env.TIKTOK_APP_SECRET || '';
const TIKTOK_ACCESS_TOKEN = process.env.TIKTOK_ACCESS_TOKEN || '';
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

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'method_not_allowed' });
    return;
  }

  if (!TIKTOK_ACCESS_TOKEN) {
    res.status(503).json({ error: 'tiktok_not_configured', message: 'TIKTOK_ACCESS_TOKEN chưa set trên server. App TikTok còn đang chờ duyệt.' });
    return;
  }

  const user = await verifyBearerUser(req);
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
