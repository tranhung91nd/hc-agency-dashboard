// HC Agency Dashboard — Meta Graph API proxy
// Triển khai dưới dạng Vercel Serverless Function tại /api/meta
//
// Mục đích: META_TOKEN không bao giờ rời server. Client gửi POST {op,path,...}
// kèm Supabase JWT, server verify auth → whitelist path → proxy đến Graph API.
//
// ENV cần (Vercel project):
//   META_TOKEN                    — Meta access token (system user, scope ads_*)
//   SUPABASE_URL                  — đã có sẵn cho /api/telegram
//   SUPABASE_SERVICE_ROLE_KEY     — đã có sẵn cho /api/telegram

const { createClient } = require('@supabase/supabase-js');

const META_TOKEN = process.env.META_TOKEN || '';
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const GRAPH_BASE = 'https://graph.facebook.com/v25.0/';

// ═══ Whitelist các path được phép gọi ═══
// Chống lạm dụng: có JWT user nhưng vẫn không thể đọc bừa data ngoài phạm vi
// dashboard cần (vd /me/businesses, /me/accounts...). Mỗi path mới phải thêm vào đây.
const PATH_WHITELIST = [
  /^me\/permissions$/,
  /^me\/adaccounts$/,
  /^debug_token$/,
  /^act_\d+$/,                                              // single account info / update (rename, spend_cap)
  /^act_\d+\/(transactions|insights|adsets|campaigns)$/,    // GET sub-resources
];

function isPathAllowed(rawPath) {
  if (typeof rawPath !== 'string') return false;
  // Tách query string khỏi path để match regex
  var bare = rawPath.split('?')[0].replace(/^\/+/, '');
  return PATH_WHITELIST.some(function(re){ return re.test(bare); });
}

// ═══ Verify Supabase JWT ═══
async function verifyAuth(req) {
  var auth = req.headers && (req.headers.authorization || req.headers.Authorization) || '';
  var token = String(auth).replace(/^Bearer\s+/i, '').trim();
  if (!token) return null;
  try {
    var sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, { auth: { persistSession: false } });
    var { data, error } = await sb.auth.getUser(token);
    if (error || !data || !data.user) return null;
    return data.user;
  } catch (e) {
    console.error('[meta proxy] verifyAuth error:', e.message);
    return null;
  }
}

// ═══ Build URL với access_token (và input_token cho debug_token) ═══
function buildUrl(path) {
  var p = String(path || '').replace(/^\/+/, '');
  var hasQuery = p.indexOf('?') >= 0;
  var url = GRAPH_BASE + p;
  // debug_token cần input_token — server tự inject = META_TOKEN (debug chính token đang dùng)
  if (/^debug_token(\?|$)/.test(p) && !/[?&]input_token=/.test(p)) {
    url += (hasQuery ? '&' : '?') + 'input_token=' + encodeURIComponent(META_TOKEN);
    hasQuery = true;
  }
  url += (hasQuery ? '&' : '?') + 'access_token=' + encodeURIComponent(META_TOKEN);
  return url;
}

// ═══ ENTRY ═══
module.exports = async (req, res) => {
  // CORS headers (cùng origin Vercel nên thường không cần, nhưng để chắc)
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  if (!META_TOKEN) return res.status(500).json({ error: { message: 'META_TOKEN chưa cấu hình ở Vercel env' } });
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) return res.status(500).json({ error: { message: 'Supabase env chưa đầy đủ' } });

  var user = await verifyAuth(req);
  if (!user) return res.status(401).json({ error: { message: 'Unauthorized — vui lòng đăng nhập lại' } });

  var body = req.body || {};
  var op = body.op;

  try {
    if (op === 'get' || op === 'post') {
      var path = body.path || '';
      if (!isPathAllowed(path)) {
        return res.status(403).json({ error: { message: 'Path không được phép: ' + path } });
      }
      var url = buildUrl(path);
      var r = await fetch(url, { method: op === 'get' ? 'GET' : 'POST' });
      var data = await r.json();
      return res.status(200).json(data);
    }

    if (op === 'batch') {
      var batch = Array.isArray(body.batch) ? body.batch : null;
      if (!batch || !batch.length) return res.status(400).json({ error: { message: 'Batch rỗng' } });
      // Validate từng relative_url trong batch
      for (var i = 0; i < batch.length; i++) {
        var ru = (batch[i] && batch[i].relative_url) || '';
        if (!isPathAllowed(ru)) {
          return res.status(403).json({ error: { message: 'Batch path không được phép: ' + ru } });
        }
      }
      var resp = await fetch(GRAPH_BASE, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: 'batch=' + encodeURIComponent(JSON.stringify(batch)) + '&access_token=' + encodeURIComponent(META_TOKEN) + '&include_headers=false'
      });
      var bData = await resp.json();
      return res.status(200).json(bData);
    }

    return res.status(400).json({ error: { message: 'Unknown op: ' + op } });
  } catch (e) {
    console.error('[meta proxy]', e);
    return res.status(500).json({ error: { message: e.message || 'Lỗi proxy Meta' } });
  }
};
