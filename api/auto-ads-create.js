// HC Agency — Auto Ads create endpoint (cho UI web)
// Vercel Serverless Function tại /api/auto-ads-create
//
// Body: { acc_id (act_xxx), preset_name, post_input, budget }
// Auth: Supabase JWT (Bearer token).
//
// Flow:
//   1. Verify JWT
//   2. Load preset từ DB
//   3. Parse post_input (numeric / pfbid token / URL)
//   4. Nếu pfbid → resolve qua HTML scrape (giống bot Telegram)
//   5. 4 step Meta API: campaign → adset → creative → ad
//   6. Log vào auto_ads_log (source='web')
//   7. Reply IDs hoặc lỗi

const { createClient } = require('@supabase/supabase-js');

const META_TOKEN = process.env.META_TOKEN || '';
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const GRAPH_BASE = 'https://graph.facebook.com/v25.0/';

const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, { auth: { persistSession: false } });

// ─── Meta API helper (form-urlencoded POST, chuẩn Meta) ───
async function metaApi(method, path, payload) {
  const url = GRAPH_BASE + String(path).replace(/^\/+/, '');
  const body = Object.assign({}, payload || {}, { access_token: META_TOKEN });
  const qs = new URLSearchParams();
  Object.keys(body).forEach(k => {
    const v = body[k];
    if (v === undefined || v === null) return;
    qs.append(k, typeof v === 'object' ? JSON.stringify(v) : String(v));
  });
  if (method === 'GET') {
    const r = await fetch(url + (url.indexOf('?') >= 0 ? '&' : '?') + qs.toString());
    return await r.json();
  }
  const r = await fetch(url, {
    method: method,
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: qs.toString()
  });
  return await r.json();
}

function formatMetaError(err) {
  if (!err) return 'unknown';
  if (typeof err === 'string') return err;
  const parts = [err.message || 'Invalid'];
  if (err.code) parts.push('code=' + err.code);
  if (err.error_subcode) parts.push('sub=' + err.error_subcode);
  if (err.error_user_msg) parts.push('→ ' + err.error_user_msg);
  return parts.join(' · ');
}

// ─── Parse post_input → token (pfbid hoặc số hoặc page_post) ───
function parsePostId(input) {
  if (!input) return null;
  let s = String(input).trim();
  if (/^\d+$/.test(s)) return s;
  if (/^\d+_\d+$/.test(s)) return s;
  let m = s.match(/\/posts\/(pfbid[A-Za-z0-9]+)/);
  if (m) return m[1];
  m = s.match(/\/posts\/(\d+)/);
  if (m) return m[1];
  m = s.match(/[?&]story_fbid=(\d+)/);
  if (m) return m[1];
  if (/^pfbid[A-Za-z0-9]+$/.test(s)) return s;
  return null;
}

// ─── Resolve pfbid → numeric ID qua HTML scrape ───
async function resolvePfbid(postUrl) {
  const userAgents = [
    'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'
  ];
  const tryFetch = async (url, ua) => {
    try {
      const r = await fetch(url, {
        headers: {
          'User-Agent': ua,
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'vi-VN,vi;q=0.9,en-US;q=0.8'
        },
        redirect: 'follow'
      });
      if (!r.ok) return null;
      const html = await r.text();
      let m = html.match(/property="og:url"\s+content="[^"]*\/posts\/[^"\/]+\/(\d+)\/?"/);
      if (m) return m[1];
      m = html.match(/property="og:url"\s+content="[^"]*\/posts\/(\d+)/);
      if (m) return m[1];
      m = html.match(/[?&]story_fbid=(\d+)/);
      if (m) return m[1];
      return null;
    } catch (e) { return null; }
  };
  for (const ua of userAgents) {
    const id = await tryFetch(postUrl, ua);
    if (id) return id;
  }
  // Fallback mobile URL
  const mUrl = postUrl.replace(/^https?:\/\/(www\.)?facebook\.com/, 'https://m.facebook.com');
  if (mUrl !== postUrl) {
    for (const ua of userAgents) {
      const id = await tryFetch(mUrl, ua);
      if (id) return id;
    }
  }
  return null;
}

async function verifyAuth(req) {
  const auth = req.headers && (req.headers.authorization || req.headers.Authorization) || '';
  const token = String(auth).replace(/^Bearer\s+/i, '').trim();
  if (!token) return null;
  try {
    const { data, error } = await sb.auth.getUser(token);
    if (error || !data || !data.user) return null;
    return data.user;
  } catch (e) { return null; }
}

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  if (!META_TOKEN) return res.status(500).json({ error: 'META_TOKEN chưa cấu hình' });
  const user = await verifyAuth(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized — đăng nhập lại' });

  const body = req.body || {};
  const accId = String(body.acc_id || '').trim();
  const presetName = String(body.preset_name || '').trim();
  const postInput = String(body.post_input || '').trim();
  const budget = parseInt(body.budget || 0, 10);
  const clientId = body.client_id || null;

  if (!accId || !accId.startsWith('act_')) return res.status(400).json({ error: 'acc_id phải bắt đầu act_' });
  if (!presetName) return res.status(400).json({ error: 'preset_name bắt buộc' });
  if (!postInput) return res.status(400).json({ error: 'post_input bắt buộc' });
  if (!budget || budget < 50000) return res.status(400).json({ error: 'budget tối thiểu 50.000đ' });

  // Load preset
  const presetRes = await sb.from('auto_ads_preset').select('*').eq('name', presetName).maybeSingle();
  if (presetRes.error || !presetRes.data) return res.status(404).json({ error: 'Preset không tồn tại: ' + presetName });
  const preset = presetRes.data;

  // Parse post
  let postId = parsePostId(postInput);
  if (!postId) return res.status(400).json({ error: 'Post không nhận diện được: ' + postInput });
  if (/^pfbid/i.test(postId)) {
    if (!/^https?:\/\//i.test(postInput)) return res.status(400).json({ error: 'pfbid cần URL Facebook đầy đủ' });
    const resolved = await resolvePfbid(postInput);
    if (!resolved) return res.status(400).json({ error: 'Không resolve được pfbid. Hãy copy URL từ Meta Business Suite có /posts/<số>/.' });
    postId = resolved;
  }

  // Build storyId
  const pageId = preset.page_id;
  const storyId = /^\d+_\d+$/.test(postId) ? postId : (pageId + '_' + postId);
  const dest = preset.destination_type || 'MESSENGER';
  const targeting = Object.assign({}, preset.targeting || {});
  if (!targeting.geo_locations || !Object.keys(targeting.geo_locations).length) targeting.geo_locations = { countries: ['VN'] };
  if (!targeting.age_min) targeting.age_min = 18;
  if (!targeting.age_max) targeting.age_max = 65;

  const log = {
    source: 'web',
    chat_id: user.id || null,
    preset_name: presetName,
    post_id: postId,
    post_url: /^https?:\/\//.test(postInput) ? postInput : null,
    budget: budget,
    ad_account_id: accId,
    status: 'pending'
  };

  try {
    const today = new Date().toISOString().substring(0, 10);
    const campName = '[' + presetName + '] ' + today;

    // 1. Campaign
    const campRes = await metaApi('POST', accId + '/campaigns', {
      name: campName,
      objective: 'OUTCOME_ENGAGEMENT',
      special_ad_categories: [],
      status: 'ACTIVE',
      buying_type: 'AUCTION',
      is_adset_budget_sharing_enabled: false
    });
    if (campRes.error) throw { step: 'campaign', msg: formatMetaError(campRes.error) };
    log.campaign_id = campRes.id;

    // 2. Adset
    const adsetRes = await metaApi('POST', accId + '/adsets', {
      name: campName + ' - Adset',
      campaign_id: campRes.id,
      daily_budget: budget,
      billing_event: 'IMPRESSIONS',
      optimization_goal: 'CONVERSATIONS',
      bid_strategy: 'LOWEST_COST_WITHOUT_CAP',
      destination_type: dest,
      promoted_object: { page_id: pageId },
      targeting: targeting,
      status: 'ACTIVE'
    });
    if (adsetRes.error) throw { step: 'adset', msg: formatMetaError(adsetRes.error) };
    log.adset_id = adsetRes.id;

    // 3. Creative
    const crRes = await metaApi('POST', accId + '/adcreatives', {
      name: campName + ' - Creative',
      object_story_id: storyId
    });
    if (crRes.error) throw { step: 'creative', msg: formatMetaError(crRes.error) };
    log.creative_id = crRes.id;

    // 4. Ad
    const adRes = await metaApi('POST', accId + '/ads', {
      name: campName + ' - Ad',
      adset_id: adsetRes.id,
      creative: { creative_id: crRes.id },
      status: 'ACTIVE'
    });
    if (adRes.error) throw { step: 'ad', msg: formatMetaError(adRes.error) };
    log.ad_id = adRes.id;

    log.status = 'success';
    await sb.from('auto_ads_log').insert(log);

    const actNum = accId.replace('act_', '');
    return res.status(200).json({
      ok: true,
      campaign_id: campRes.id,
      adset_id: adsetRes.id,
      creative_id: crRes.id,
      ad_id: adRes.id,
      manager_link: 'https://adsmanager.facebook.com/adsmanager/manage/campaigns?act=' + actNum + '&selected_campaign_ids=' + campRes.id
    });
  } catch (err) {
    log.status = 'failed';
    log.error_step = err.step || 'unknown';
    log.error_message = err.msg || err.message || String(err);
    try { await sb.from('auto_ads_log').insert(log); } catch (e) {}
    return res.status(500).json({ ok: false, step: log.error_step, error: log.error_message });
  }
};
