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
// Cron 15p chỉ quét D0 (hôm nay) để giữ tải nhẹ. Khi sang ngày mới, D0 cũ
// đã được sync đầy đủ trước nửa đêm. Cảnh báo D-3..D-1 vẫn dùng data lịch sử
// trong DB; user bấm "Quét giá Messenger" thủ công nếu cần làm tươi cảnh báo.
const DAILY_DAYS = [D0];
const MESS_SINCE = D0, MESS_UNTIL = D0;

console.log(`[HC Sync] window = ${D0} (D0 only, mỗi 15p)`);

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

// ═══ Sync daily_spend cho 1 ngày ═══
async function syncDailySpendForDate(syncDate, normal, shared, staff, clients) {
  let saved = 0, errors = 0;
  // Normal accounts
  for (let b = 0; b < normal.length; b += 50) {
    const chunk = normal.slice(b, b + 50);
    const batchReqs = chunk.map(a => ({
      method: 'GET',
      relative_url: `${a.fb_account_id}/insights?fields=spend&time_range={"since":"${syncDate}","until":"${syncDate}"}`
    }));
    try {
      const resp = await fetch('https://graph.facebook.com/v25.0/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `batch=${encodeURIComponent(JSON.stringify(batchReqs))}&access_token=${META_TOKEN}&include_headers=false`
      });
      const results = await resp.json();
      const tasks = [];
      for (let j = 0; j < results.length; j++) {
        const a = chunk[j];
        tasks.push((async () => {
          try {
            const body = JSON.parse(results[j].body || '{}');
            let spend = 0;
            if (body.data && body.data.length) spend = Math.round(parseFloat(body.data[0].spend));
            await sb.from('daily_spend').delete().eq('ad_account_id', a.id).eq('report_date', syncDate).is('staff_id', null);
            const r = await sb.from('daily_spend').insert({ ad_account_id: a.id, report_date: syncDate, spend_amount: spend });
            if (!r.error) saved++; else errors++;
          } catch (e) { errors++; }
        })());
        if (tasks.length >= 10 || j === results.length - 1) { await Promise.all(tasks); tasks.length = 0; }
      }
    } catch (e) { console.error(`[daily_spend ${syncDate}] batch error:`, e.message); errors += chunk.length; }
  }
  // Shared accounts (TK dùng chung)
  const sharedFns = shared.map(a => async () => {
    try {
      const url = `https://graph.facebook.com/v25.0/${a.fb_account_id}/insights?level=campaign&fields=campaign_name,spend&time_range={"since":"${syncDate}","until":"${syncDate}"}&limit=500&access_token=${META_TOKEN}`;
      const resp = await fetch(url);
      const data = await resp.json();
      if (data.error) { errors++; return; }
      await sb.from('daily_spend').delete().eq('ad_account_id', a.id).eq('report_date', syncDate).not('staff_id', 'is', null);
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
      for (const k of Object.keys(combo)) {
        const cb = combo[k];
        const r = await sb.from('daily_spend').insert({
          ad_account_id: a.id, report_date: syncDate,
          spend_amount: cb.spend, staff_id: cb.sid, matched_client_id: cb.cid
        });
        if (!r.error) saved++; else errors++;
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
  // Chỉ sync TKQC nào đã đặt ngưỡng giá Mess hoặc Form (giống logic app.js syncCampaignMess)
  const mapped = adAccounts.filter(a => a.fb_account_id && (a.max_mess_cost || a.max_lead_cost));
  if (!mapped.length) {
    console.log(`[campaign_daily_mess] Không có TK nào đặt ngưỡng — bỏ qua`);
    return { saved: 0, errors: 0 };
  }
  console.log(`[campaign_daily_mess] ${mapped.length} TK có ngưỡng`);
  let saved = 0, errors = 0;
  const allRows = [];
  // 3 requests/account → chunk 16 để <50 requests/batch
  for (let b = 0; b < mapped.length; b += 16) {
    const chunk = mapped.slice(b, b + 16);
    const batchReqs = [];
    chunk.forEach(a => {
      batchReqs.push({ method: 'GET', relative_url: `${a.fb_account_id}/campaigns?fields=id,effective_status&filtering=[{"field":"effective_status","operator":"IN","value":["ACTIVE"]}]&limit=500` });
      batchReqs.push({ method: 'GET', relative_url: `${a.fb_account_id}/insights?level=campaign&fields=campaign_id,campaign_name,spend,actions&time_range={"since":"${MESS_SINCE}","until":"${MESS_UNTIL}"}&time_increment=1&limit=500` });
      batchReqs.push({ method: 'GET', relative_url: `${a.fb_account_id}/adsets?fields=campaign_id,optimization_goal,destination_type&limit=500` });
    });
    try {
      const resp = await fetch('https://graph.facebook.com/v25.0/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `batch=${encodeURIComponent(JSON.stringify(batchReqs))}&access_token=${META_TOKEN}&include_headers=false`
      });
      const bResults = await resp.json();
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

  console.log(`[HC Sync] Done! ${totalSaved} saved, ${totalErrors} errors`);
  if (totalErrors > 0 && totalSaved === 0) process.exit(1);
}

main().catch(e => { console.error(e); process.exit(1); });
