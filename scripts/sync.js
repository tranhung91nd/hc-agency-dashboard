const { createClient } = require('@supabase/supabase-js');

const SB_URL = process.env.SUPABASE_URL;
const SB_KEY = process.env.SUPABASE_KEY;
const META_TOKEN = process.env.META_TOKEN;

if (!SB_URL || !SB_KEY || !META_TOKEN) {
  console.error('Missing env vars: SUPABASE_URL, SUPABASE_KEY, META_TOKEN');
  process.exit(1);
}

const sb = createClient(SB_URL, SB_KEY);

// Vietnamese timezone (UTC+7)
function vnDate(offset) {
  const d = new Date();
  const u = d.getTime() + d.getTimezoneOffset() * 60000 + 25200000 + (offset || 0);
  const v = new Date(u);
  return v.getFullYear() + '-' + ('0' + (v.getMonth() + 1)).slice(-2) + '-' + ('0' + v.getDate()).slice(-2);
}

const D0 = vnDate(0);
// Cron 15p mặc định chỉ quét D0 (hôm nay) để giữ tải nhẹ.
// Để backfill range rộng (vd T4-T5), chạy workflow_dispatch với input
// backfill_from=2026-04-01 (và tuỳ chọn backfill_to). Sẽ override D0.
const BACKFILL_FROM = process.env.BACKFILL_FROM || null;
const BACKFILL_TO = process.env.BACKFILL_TO || null;
const IS_BACKFILL = !!BACKFILL_FROM;
const MESS_SINCE = BACKFILL_FROM || D0;
const MESS_UNTIL = BACKFILL_TO || D0;
const CAMPAIGN_MESS_BATCH_SIZE = 8;
const AD_DAILY_POST_BATCH_SIZE = 12;
const META_BATCH_MAX_ATTEMPTS = 2;
const META_BATCH_RETRY_DELAY_MS = 2500;

// daily_spend cần list từng ngày để query insights from..until=same_day
function buildDailyDays(from, to) {
  if (!from) return [D0];
  const days = [], d = new Date(from + 'T00:00:00Z'), end = new Date(to + 'T00:00:00Z');
  while (d <= end) {
    days.push(d.toISOString().substring(0, 10));
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return days;
}
const DAILY_DAYS = buildDailyDays(BACKFILL_FROM, BACKFILL_TO || D0);

console.log(`[HC Sync] window = ${MESS_SINCE} → ${MESS_UNTIL}${IS_BACKFILL ? ' (BACKFILL mode, ' + DAILY_DAYS.length + ' ngày)' : ' (D0 only)'}`);

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function metaTimeRangeParam(since, until) {
  return encodeURIComponent(JSON.stringify({ since, until }));
}

function isRetryableMetaError(message, code) {
  const msg = (message || '').toLowerCase();
  return [4, 17, 32, 613, 80004].includes(Number(code)) ||
    msg.includes('request aborted') ||
    msg.includes('application request limit') ||
    msg.includes('temporarily unavailable') ||
    msg.includes('timeout') ||
    msg.includes('timed out');
}

async function fetchMetaBatch(batchReqs, label) {
  let lastError = null;
  for (let attempt = 1; attempt <= META_BATCH_MAX_ATTEMPTS; attempt++) {
    try {
      const resp = await fetch('https://graph.facebook.com/v25.0/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `batch=${encodeURIComponent(JSON.stringify(batchReqs))}&access_token=${META_TOKEN}&include_headers=false`
      });
      const data = await resp.json();
      if (Array.isArray(data)) return data;
      const err = data && data.error;
      lastError = new Error((err && err.message) || 'Batch API trả về không phải mảng');
      lastError.code = err && err.code;
      if (attempt < META_BATCH_MAX_ATTEMPTS && isRetryableMetaError(lastError.message, lastError.code)) {
        console.warn(`[${label}] retry batch attempt ${attempt + 1}/${META_BATCH_MAX_ATTEMPTS}:`, lastError.message);
        await sleep(META_BATCH_RETRY_DELAY_MS);
        continue;
      }
      return data;
    } catch (e) {
      lastError = e;
      if (attempt < META_BATCH_MAX_ATTEMPTS && isRetryableMetaError(e.message, e.code)) {
        console.warn(`[${label}] retry network attempt ${attempt + 1}/${META_BATCH_MAX_ATTEMPTS}:`, e.message);
        await sleep(META_BATCH_RETRY_DELAY_MS);
        continue;
      }
      throw e;
    }
  }
  throw lastError;
}

// ═══ Phân loại campaign theo optimization_goal + destination_type ═══
function classifyCampaign(optGoal, destType) {
  const g = (optGoal || '').toUpperCase();
  const d = (destType || '').toUpperCase();
  if (d === 'MESSENGER' || d === 'CTWA_LINK' || d === 'INSTAGRAM_DIRECT' || d === 'WHATSAPP') return 'mess';
  if (d === 'ON_AD') return 'form';
  if (g === 'CONVERSATIONS' || g === 'REPLIES') return 'mess';
  if (g === 'LEAD_GENERATION' || g === 'QUALITY_LEAD') return 'form';
  if (g === 'POST_ENGAGEMENT' || g === 'PAGE_LIKES' || g === 'LINK_CLICKS' || g === 'REACH' || g === 'IMPRESSIONS' || g === 'VIDEO_VIEWS' || g === 'THRUPLAY' || g === 'LANDING_PAGE_VIEWS') return 'engagement';
  return 'other';
}

// ═══ Parse insights → rows campaign_daily_mess ═══
function parseMessRows(a, campBody, insBody, adsetsBody) {
  const activeIds = new Set();
  (campBody.data || []).forEach(c => activeIds.add(c.id));
  const campMeta = {};
  ((adsetsBody && adsetsBody.data) || []).forEach(s => {
    const cid = s.campaign_id; if (!cid) return;
    const t = classifyCampaign(s.optimization_goal, s.destination_type);
    if (!campMeta[cid] || campMeta[cid].type === 'other') {
      campMeta[cid] = { optimization_goal: s.optimization_goal || null, destination_type: s.destination_type || null, type: t };
    }
  });
  return (insBody.data || []).map(r => {
    const spend = Math.round(parseFloat(r.spend || 0));
    let messCount = 0, leadCount = 0, commentCount = 0, checkoutCount = 0;
    if (r.actions) {
      r.actions.forEach(act => {
        const t = act.action_type || '';
        if (t.indexOf('messaging_conversation_started') >= 0 || t === 'onsite_conversion.messaging_conversation_started_7d') messCount += parseInt(act.value) || 0;
        if (t === 'lead' || t === 'leadgen_grouped') leadCount += parseInt(act.value) || 0;
        if (t === 'comment') commentCount += parseInt(act.value) || 0;
        if (t === 'offsite_conversion.fb_pixel_initiate_checkout' || t === 'onsite_conversion.initiate_checkout' || t === 'initiate_checkout') checkoutCount += parseInt(act.value) || 0;
      });
    }
    const meta = campMeta[r.campaign_id] || { optimization_goal: null, destination_type: null, type: null };
    return {
      ad_account_id: a.id, campaign_id: r.campaign_id, campaign_name: r.campaign_name,
      report_date: r.date_start, spend: spend,
      mess_count: messCount, lead_count: leadCount, comment_count: commentCount, checkout_count: checkoutCount,
      campaign_status: activeIds.has(r.campaign_id) ? 'ACTIVE' : 'PAUSED',
      campaign_type: meta.type, optimization_goal: meta.optimization_goal, destination_type: meta.destination_type
    };
  });
}

// ═══ Sync daily_spend cho 1 ngày (UPSERT idempotent) ═══
// Yêu cầu: bảng daily_spend đã có UNIQUE constraint daily_spend_natural_uniq
// (xem migrations/2026-05-09_daily_spend_unique.sql).
// Với staff_id NULL, shared accounts trước khi upsert vẫn cần xóa orphan rows
// (combos staff/client đã không còn trong batch hiện tại).
async function syncDailySpendForDate(syncDate, normal, shared, staff, clients) {
  let saved = 0, errors = 0;
  const dayRange = metaTimeRangeParam(syncDate, syncDate);
  // ─── Normal accounts: 1 dòng/TK/ngày, staff_id=NULL, matched_client_id=NULL ───
  const normalRows = [];
  for (let b = 0; b < normal.length; b += 50) {
    const chunk = normal.slice(b, b + 50);
    const batchReqs = chunk.map(a => ({
      method: 'GET',
      relative_url: `${a.fb_account_id}/insights?fields=spend&time_range=${dayRange}`
    }));
    try {
      const resp = await fetch('https://graph.facebook.com/v25.0/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `batch=${encodeURIComponent(JSON.stringify(batchReqs))}&access_token=${META_TOKEN}&include_headers=false`
      });
      const results = await resp.json();
      for (let j = 0; j < results.length; j++) {
        try {
          const body = JSON.parse(results[j].body || '{}');
          let spend = 0;
          if (body.data && body.data.length) spend = Math.round(parseFloat(body.data[0].spend));
          normalRows.push({ ad_account_id: chunk[j].id, report_date: syncDate, spend_amount: spend, staff_id: null, matched_client_id: null });
        } catch (e) { errors++; }
      }
    } catch (e) { console.error(`[daily_spend ${syncDate}] batch error:`, e.message); errors += chunk.length; }
  }
  if (normalRows.length) {
    const r = await sb.from('daily_spend').upsert(normalRows, { onConflict: 'ad_account_id,report_date,staff_id,matched_client_id' });
    if (r.error) { console.error(`[daily_spend normal ${syncDate}] upsert:`, r.error.message); errors += normalRows.length; }
    else saved += normalRows.length;
  }
  // ─── Shared accounts: nhiều dòng/TK/ngày (1 cho mỗi cặp staff×client) ───
  // Pull insights theo campaign, parse keyword → list combos hiện tại, xóa orphan, upsert mới
  const sharedFns = shared.map(a => async () => {
    try {
      const url = `https://graph.facebook.com/v25.0/${a.fb_account_id}/insights?level=campaign&fields=campaign_name,spend&time_range=${dayRange}&limit=500&access_token=${META_TOKEN}`;
      const resp = await fetch(url);
      const data = await resp.json();
      if (data.error) { errors++; return; }
      const combo = {};
      (data.data || []).forEach(c => {
        const spend = Math.round(parseFloat(c.spend || 0));
        if (!spend) return;
        const parts = (c.campaign_name || '').split('_');
        const staffPart = (parts[0] || '').trim();
        const clientPart = (parts[2] || '').trim();
        const ms = staff.find(s => s.campaign_keyword && staffPart.toLowerCase() === s.campaign_keyword.toLowerCase());
        const mc = clients.find(cl => cl.campaign_keyword && clientPart.toLowerCase().indexOf(cl.campaign_keyword.toLowerCase()) >= 0);
        if (ms) {
          const key = ms.id + '|' + (mc ? mc.id : '');
          if (!combo[key]) combo[key] = { sid: ms.id, cid: mc ? mc.id : null, spend: 0 };
          combo[key].spend += spend;
        }
      });
      const rows = Object.values(combo).map(cb => ({
        ad_account_id: a.id, report_date: syncDate,
        spend_amount: cb.spend, staff_id: cb.sid, matched_client_id: cb.cid
      }));
      // Xóa orphan: dòng staff_id NOT NULL của TK này × ngày này, KHÔNG nằm trong combos hiện tại
      // (vd combo cũ đã bị xóa khỏi Meta hoặc đổi staff). Vẫn cần delete cho shared.
      const validKeys = new Set(rows.map(r => r.staff_id + '|' + (r.matched_client_id || '')));
      const existing = await sb.from('daily_spend').select('id,staff_id,matched_client_id').eq('ad_account_id', a.id).eq('report_date', syncDate).not('staff_id', 'is', null);
      if (existing.data) {
        const orphanIds = existing.data.filter(x => !validKeys.has(x.staff_id + '|' + (x.matched_client_id || ''))).map(x => x.id);
        if (orphanIds.length) await sb.from('daily_spend').delete().in('id', orphanIds);
      }
      if (rows.length) {
        const r = await sb.from('daily_spend').upsert(rows, { onConflict: 'ad_account_id,report_date,staff_id,matched_client_id' });
        if (r.error) { errors += rows.length; console.warn(`[daily_spend shared ${a.id}]:`, r.error.message); }
        else saved += rows.length;
      }
    } catch (e) { errors++; }
  });
  for (let s = 0; s < sharedFns.length; s += 5) {
    await Promise.all(sharedFns.slice(s, s + 5).map(fn => fn()));
  }
  console.log(`[daily_spend ${syncDate}] saved=${saved} errors=${errors}`);
  return { saved, errors };
}

// ═══ Sync campaign_daily_mess cho range D3 → D0 ═══
async function syncCampaignMess(adAccounts) {
  // Sync mọi TKQC đã ghép Meta để báo cáo khách luôn có Mess/Bình luận.
  // Cảnh báo giá vẫn chỉ áp dụng cho TK có max_mess_cost/max_lead_cost ở app.js.
  const mapped = adAccounts.filter(a => a.fb_account_id);
  if (!mapped.length) {
    console.log(`[campaign_daily_mess] Không có TK nào ghép Meta — bỏ qua`);
    return { saved: 0, errors: 0 };
  }
  console.log(`[campaign_daily_mess] ${mapped.length} TK đã ghép Meta`);
  let saved = 0, errors = 0;
  const allRows = [];
  const messRange = metaTimeRangeParam(MESS_SINCE, MESS_UNTIL);
  const activeFilter = encodeURIComponent(JSON.stringify([{ field: 'effective_status', operator: 'IN', value: ['ACTIVE'] }]));
  // 3 requests/account; dùng batch nhỏ để hạn chế Meta timeout/rate-limit khi backfill nhiều TK.
  for (let b = 0; b < mapped.length; b += CAMPAIGN_MESS_BATCH_SIZE) {
    const chunk = mapped.slice(b, b + CAMPAIGN_MESS_BATCH_SIZE);
    const batchReqs = [];
    chunk.forEach(a => {
      batchReqs.push({ method: 'GET', relative_url: `${a.fb_account_id}/campaigns?fields=id,effective_status&filtering=${activeFilter}&limit=500` });
      batchReqs.push({ method: 'GET', relative_url: `${a.fb_account_id}/insights?level=campaign&fields=campaign_id,campaign_name,spend,actions&time_range=${messRange}&time_increment=1&limit=500` });
      batchReqs.push({ method: 'GET', relative_url: `${a.fb_account_id}/adsets?fields=campaign_id,optimization_goal,destination_type&limit=500` });
    });
    try {
      const bResults = await fetchMetaBatch(batchReqs, 'campaign_daily_mess');
      if (!Array.isArray(bResults)) {
        console.error(`[campaign_daily_mess] batch không trả mảng:`, bResults && bResults.error && bResults.error.message);
        errors += chunk.length; continue;
      }
      for (let j = 0; j < chunk.length; j++) {
        try {
          const campBody = JSON.parse((bResults[j * 3] && bResults[j * 3].body) || '{}');
          const insBody = JSON.parse((bResults[j * 3 + 1] && bResults[j * 3 + 1].body) || '{}');
          const adsetsBody = JSON.parse((bResults[j * 3 + 2] && bResults[j * 3 + 2].body) || '{}');
          if (campBody.error) { console.warn(`[mess] camp error acc=${chunk[j].fb_account_id}:`, campBody.error.message); errors++; continue; }
          if (insBody.error) { console.warn(`[mess] insights error acc=${chunk[j].fb_account_id}:`, insBody.error.message); errors++; continue; }
          allRows.push(...parseMessRows(chunk[j], campBody, insBody, adsetsBody));
        } catch (e) { console.warn(`[mess] parse error acc=${chunk[j].fb_account_id}:`, e.message); errors++; }
      }
    } catch (e) { console.error(`[mess] network error:`, e.message); errors += chunk.length; }
  }
  // Upsert in chunks of 500
  for (let i = 0; i < allRows.length; i += 500) {
    const batch = allRows.slice(i, i + 500);
    const r = await sb.from('campaign_daily_mess').upsert(batch, { onConflict: 'ad_account_id,campaign_id,report_date' });
    if (r.error) { console.error(`[mess] upsert error:`, r.error.message); errors += batch.length; }
    else saved += batch.length;
  }
  console.log(`[campaign_daily_mess] saved=${saved} errors=${errors}`);
  return { saved, errors };
}

// ═══ Sync ad_daily_post cho range D0 (mỗi ad × ngày + post_id + creative) ═══
async function syncAdDailyPost(adAccounts) {
  const mapped = adAccounts.filter(a => a.fb_account_id);
  if (!mapped.length) {
    console.log(`[ad_daily_post] Không có TK nào ghép Meta — bỏ qua`);
    return { saved: 0, errors: 0 };
  }
  console.log(`[ad_daily_post] ${mapped.length} TK, range ${MESS_SINCE} → ${MESS_UNTIL}`);
  let saved = 0, errors = 0;
  const allRows = [];
  const postRange = metaTimeRangeParam(MESS_SINCE, MESS_UNTIL);
  // 2 reqs/account (insights/ad + ads metadata); batch nhỏ hơn giúp tránh Request aborted.
  for (let b = 0; b < mapped.length; b += AD_DAILY_POST_BATCH_SIZE) {
    const chunk = mapped.slice(b, b + AD_DAILY_POST_BATCH_SIZE);
    const batchReqs = [];
    chunk.forEach(a => {
      batchReqs.push({ method: 'GET', relative_url: `${a.fb_account_id}/insights?level=ad&fields=ad_id,ad_name,campaign_id,campaign_name,spend,actions&time_range=${postRange}&time_increment=1&limit=500` });
      batchReqs.push({ method: 'GET', relative_url: `${a.fb_account_id}/ads?fields=id,name,status,creative{effective_object_story_id,thumbnail_url}&limit=500` });
    });
    try {
      const bResults = await fetchMetaBatch(batchReqs, 'ad_daily_post');
      if (!Array.isArray(bResults)) {
        console.error(`[ad_daily_post] batch không trả mảng:`, bResults && bResults.error && bResults.error.message);
        errors += chunk.length; continue;
      }
      for (let j = 0; j < chunk.length; j++) {
        try {
          const insBody = JSON.parse((bResults[j * 2] && bResults[j * 2].body) || '{}');
          const adsBody = JSON.parse((bResults[j * 2 + 1] && bResults[j * 2 + 1].body) || '{}');
          if (insBody.error) { console.warn(`[ad_daily_post] insights acc=${chunk[j].fb_account_id}:`, insBody.error.message); errors++; continue; }
          // adsBody.error non-fatal — vẫn parse insights, chỉ thiếu post_id
          const adsMeta = {};
          ((adsBody && adsBody.data) || []).forEach(ad => {
            const c = ad.creative || {};
            const posid = c.effective_object_story_id || null;
            let purl = null;
            if (posid && posid.indexOf('_') > 0) {
              const parts = posid.split('_');
              purl = `https://www.facebook.com/${parts[0]}/posts/${parts[1]}`;
            }
            adsMeta[ad.id] = { status: ad.status || null, post_id: posid, post_url: purl, thumbnail_url: c.thumbnail_url || null };
          });
          (insBody.data || []).forEach(r => {
            const spend = Math.round(parseFloat(r.spend || 0));
            let messCount = 0, leadCount = 0, commentCount = 0, checkoutCount = 0;
            if (r.actions) {
              r.actions.forEach(act => {
                const t = act.action_type || '';
                if (t.indexOf('messaging_conversation_started') >= 0 || t === 'onsite_conversion.messaging_conversation_started_7d') messCount += parseInt(act.value) || 0;
                if (t === 'lead' || t === 'leadgen_grouped') leadCount += parseInt(act.value) || 0;
                if (t === 'comment') commentCount += parseInt(act.value) || 0;
                if (t === 'offsite_conversion.fb_pixel_initiate_checkout' || t === 'onsite_conversion.initiate_checkout' || t === 'initiate_checkout') checkoutCount += parseInt(act.value) || 0;
              });
            }
            const meta = adsMeta[r.ad_id] || {};
            allRows.push({
              ad_account_id: chunk[j].id, ad_id: r.ad_id, report_date: r.date_start,
              ad_name: r.ad_name || null, campaign_id: r.campaign_id || null, campaign_name: r.campaign_name || null,
              post_id: meta.post_id || null, post_url: meta.post_url || null, thumbnail_url: meta.thumbnail_url || null,
              spend: spend, mess_count: messCount, comment_count: commentCount, lead_count: leadCount, checkout_count: checkoutCount,
              ad_status: meta.status || null
            });
          });
        } catch (e) { console.warn(`[ad_daily_post] parse acc=${chunk[j].fb_account_id}:`, e.message); errors++; }
      }
    } catch (e) { console.error(`[ad_daily_post] network:`, e.message); errors += chunk.length; }
  }
  for (let i = 0; i < allRows.length; i += 500) {
    const batch = allRows.slice(i, i + 500);
    const r = await sb.from('ad_daily_post').upsert(batch, { onConflict: 'ad_account_id,ad_id,report_date' });
    if (r.error) { console.error(`[ad_daily_post] upsert:`, r.error.message); errors += batch.length; }
    else saved += batch.length;
  }
  console.log(`[ad_daily_post] saved=${saved} errors=${errors}`);
  return { saved, errors };
}

async function main() {
  const [staffRes, clientRes, adRes] = await Promise.all([
    sb.from('staff').select('*'),
    sb.from('client').select('*'),
    sb.from('ad_account').select('*').not('fb_account_id', 'is', null)
  ]);
  if (staffRes.error || clientRes.error || adRes.error) {
    console.error('DB error:', staffRes.error || clientRes.error || adRes.error);
    process.exit(1);
  }
  const staff = staffRes.data;
  const clients = clientRes.data;
  const adAccounts = adRes.data;
  const normal = adAccounts.filter(a => !a.is_shared);
  const shared = adAccounts.filter(a => a.is_shared);
  console.log(`[HC Sync] ${adAccounts.length} TK (${normal.length} riêng + ${shared.length} chung)`);

  // ═══ Cập nhật spend_cap & amount_spent ═══
  for (let b = 0; b < adAccounts.length; b += 50) {
    const chunk = adAccounts.slice(b, b + 50);
    const batchReqs = chunk.map(a => ({ method: 'GET', relative_url: `${a.fb_account_id}?fields=spend_cap,amount_spent,account_status` }));
    try {
      const resp = await fetch('https://graph.facebook.com/v25.0/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `batch=${encodeURIComponent(JSON.stringify(batchReqs))}&access_token=${META_TOKEN}&include_headers=false`
      });
      const results = await resp.json();
      for (let j = 0; j < results.length; j++) {
        try {
          const body = JSON.parse(results[j].body || '{}');
          await sb.from('ad_account').update({
            spend_cap: parseInt(body.spend_cap) || 0,
            amount_spent: parseInt(body.amount_spent) || 0,
            account_status: body.account_status || 1
          }).eq('fb_account_id', chunk[j].fb_account_id);
        } catch (e) {}
      }
    } catch (e) { console.error('Batch account update error:', e.message); }
  }
  console.log(`[HC Sync] Đã cập nhật spend_cap/amount_spent`);

  // ═══ Sync daily_spend cho mỗi ngày trong window ═══
  let totalSaved = 0, totalErrors = 0;
  for (const day of DAILY_DAYS) {
    const r = await syncDailySpendForDate(day, normal, shared, staff, clients);
    totalSaved += r.saved; totalErrors += r.errors;
  }

  // ═══ Sync campaign_daily_mess cho range ═══
  const mr = await syncCampaignMess(adAccounts);
  totalSaved += mr.saved; totalErrors += mr.errors;

  // ═══ Sync ad_daily_post (chi tiết từng bài chạy) ═══
  const ar = await syncAdDailyPost(adAccounts);
  totalSaved += ar.saved; totalErrors += ar.errors;

  // ═══ Refresh materialized view (sau khi daily_spend đã insert/upsert xong) ═══
  // CONCURRENTLY không block read → user vẫn xem được data cũ trong lúc refresh
  // Nếu view chưa được tạo (migration chưa chạy) → skip không throw
  try {
    const t0 = Date.now();
    await sb.rpc('refresh_ad_account_month_spend');
    console.log(`[HC Sync] Refreshed ad_account_month_spend in ${Date.now() - t0}ms`);
  } catch (e) {
    console.warn('[HC Sync] Skip refresh view (chưa có RPC refresh_ad_account_month_spend?):', e.message);
  }

  console.log(`[HC Sync] Done! ${totalSaved} saved, ${totalErrors} errors`);
  if (totalErrors > 0 && totalSaved === 0) process.exit(1);
}

main().catch(e => { console.error(e); process.exit(1); });
