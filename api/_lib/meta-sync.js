try {
  if (!global.WebSocket) global.WebSocket = require('ws');
} catch (e) {}

const { createClient } = require('@supabase/supabase-js');

const GRAPH_BASE = 'https://graph.facebook.com/v25.0/';
const DEFAULT_CAMPAIGN_MESS_BATCH_SIZE = Number(process.env.CAMPAIGN_MESS_BATCH_SIZE || 8);
const DEFAULT_AD_DAILY_POST_BATCH_SIZE = Number(process.env.AD_DAILY_POST_BATCH_SIZE || 12);
const META_BATCH_MAX_ATTEMPTS = Number(process.env.META_BATCH_MAX_ATTEMPTS || 2);
const META_BATCH_RETRY_DELAY_MS = Number(process.env.META_BATCH_RETRY_DELAY_MS || 2500);

function getEnv() {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;
  const metaToken = process.env.META_TOKEN;
  if (!supabaseUrl || !supabaseKey || !metaToken) {
    throw new Error('Missing env vars: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY/SUPABASE_KEY, META_TOKEN');
  }
  return { supabaseUrl, supabaseKey, metaToken };
}

function createSupabase() {
  const env = getEnv();
  return createClient(env.supabaseUrl, env.supabaseKey, { auth: { persistSession: false } });
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function vnDate(offsetMs) {
  const d = new Date();
  const u = d.getTime() + d.getTimezoneOffset() * 60000 + 25200000 + (offsetMs || 0);
  const v = new Date(u);
  return v.getFullYear() + '-' + ('0' + (v.getMonth() + 1)).slice(-2) + '-' + ('0' + v.getDate()).slice(-2);
}

function dateAdd(dateStr, days) {
  const d = new Date(dateStr + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().substring(0, 10);
}

function buildDailyDays(from, to) {
  const start = from || vnDate(0);
  const end = to || start;
  const days = [];
  const d = new Date(start + 'T00:00:00Z');
  const endDate = new Date(end + 'T00:00:00Z');
  while (d <= endDate) {
    days.push(d.toISOString().substring(0, 10));
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return days;
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

function makeErrorTracker() {
  const samples = [];
  const errorAccountIds = new Set();
  let errors = 0;
  function push(accId, phase, msg, code) {
    errors += 1;
    if (accId) errorAccountIds.add(String(accId));
    if (samples.length < 20) {
      samples.push({
        accId: accId || null,
        phase: phase || null,
        msg: String(msg || '').substring(0, 500),
        code: code || null
      });
    }
  }
  return {
    push,
    get errors() { return errors; },
    get samples() { return samples; },
    get errorAccountIds() { return errorAccountIds; }
  };
}

async function fetchMetaPath(path, label) {
  const { metaToken } = getEnv();
  const p = String(path || '').replace(/^\/+/, '');
  const sep = p.indexOf('?') >= 0 ? '&' : '?';
  const resp = await fetch(GRAPH_BASE + p + sep + 'access_token=' + encodeURIComponent(metaToken));
  const data = await resp.json();
  if (data && data.error) {
    const err = new Error(data.error.message || (label || 'Meta API error'));
    err.code = data.error.code;
    throw err;
  }
  return data;
}

async function fetchMetaBatch(batchReqs, label) {
  const { metaToken } = getEnv();
  let lastError = null;
  for (let attempt = 1; attempt <= META_BATCH_MAX_ATTEMPTS; attempt++) {
    try {
      const resp = await fetch(GRAPH_BASE, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: 'batch=' + encodeURIComponent(JSON.stringify(batchReqs)) +
          '&access_token=' + encodeURIComponent(metaToken) + '&include_headers=false'
      });
      const data = await resp.json();
      if (Array.isArray(data)) return data;
      const err = data && data.error;
      lastError = new Error((err && err.message) || 'Batch API tra ve khong phai mang');
      lastError.code = err && err.code;
      if (attempt < META_BATCH_MAX_ATTEMPTS && isRetryableMetaError(lastError.message, lastError.code)) {
        console.warn('[' + label + '] retry batch attempt ' + (attempt + 1) + '/' + META_BATCH_MAX_ATTEMPTS + ':', lastError.message);
        await sleep(META_BATCH_RETRY_DELAY_MS);
        continue;
      }
      return data;
    } catch (e) {
      lastError = e;
      if (attempt < META_BATCH_MAX_ATTEMPTS && isRetryableMetaError(e.message, e.code)) {
        console.warn('[' + label + '] retry network attempt ' + (attempt + 1) + '/' + META_BATCH_MAX_ATTEMPTS + ':', e.message);
        await sleep(META_BATCH_RETRY_DELAY_MS);
        continue;
      }
      throw e;
    }
  }
  throw lastError;
}

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

function parseActionCounts(actions) {
  let messCount = 0;
  let leadCount = 0;
  let commentCount = 0;
  let checkoutCount = 0;
  (actions || []).forEach(act => {
    const t = act.action_type || '';
    if (t.indexOf('messaging_conversation_started') >= 0 || t === 'onsite_conversion.messaging_conversation_started_7d') messCount += parseInt(act.value, 10) || 0;
    if (t === 'lead' || t === 'leadgen_grouped') leadCount += parseInt(act.value, 10) || 0;
    if (t === 'comment') commentCount += parseInt(act.value, 10) || 0;
    if (t === 'offsite_conversion.fb_pixel_initiate_checkout' || t === 'onsite_conversion.initiate_checkout' || t === 'initiate_checkout') checkoutCount += parseInt(act.value, 10) || 0;
  });
  return { messCount, leadCount, commentCount, checkoutCount };
}

function parseMessRows(a, campBody, insBody, adsetsBody) {
  const activeIds = new Set();
  (campBody.data || []).forEach(c => activeIds.add(c.id));
  const campMeta = {};
  ((adsetsBody && adsetsBody.data) || []).forEach(s => {
    const cid = s.campaign_id;
    if (!cid) return;
    const t = classifyCampaign(s.optimization_goal, s.destination_type);
    if (!campMeta[cid] || campMeta[cid].type === 'other') {
      campMeta[cid] = {
        optimization_goal: s.optimization_goal || null,
        destination_type: s.destination_type || null,
        type: t
      };
    }
  });
  return (insBody.data || []).map(r => {
    const spend = Math.round(parseFloat(r.spend || 0));
    const counts = parseActionCounts(r.actions);
    const meta = campMeta[r.campaign_id] || { optimization_goal: null, destination_type: null, type: null };
    return {
      ad_account_id: a.id,
      campaign_id: r.campaign_id,
      campaign_name: r.campaign_name,
      report_date: r.date_start,
      spend,
      mess_count: counts.messCount,
      lead_count: counts.leadCount,
      comment_count: counts.commentCount,
      checkout_count: counts.checkoutCount,
      campaign_status: activeIds.has(r.campaign_id) ? 'ACTIVE' : 'PAUSED',
      campaign_type: meta.type,
      optimization_goal: meta.optimization_goal,
      destination_type: meta.destination_type
    };
  });
}

async function runLimited(items, limit, worker) {
  let idx = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (idx < items.length) {
      const item = items[idx++];
      await worker(item);
    }
  });
  await Promise.all(runners);
}

async function loadSyncData(sb, filters) {
  filters = filters || {};
  const [staffRes, clientRes, adRes] = await Promise.all([
    sb.from('staff').select('*'),
    sb.from('client').select('*'),
    sb.from('ad_account').select('*').not('fb_account_id', 'is', null)
  ]);
  if (staffRes.error || clientRes.error || adRes.error) {
    throw new Error('DB error: ' + ((staffRes.error || clientRes.error || adRes.error).message));
  }
  let adAccounts = adRes.data || [];
  if (filters.clientId) {
    const assignRes = await sb.from('assignment').select('ad_account_id').eq('client_id', filters.clientId);
    const assignedIds = new Set((assignRes.data || []).map(x => x.ad_account_id));
    adAccounts = adAccounts.filter(a => a.client_id === filters.clientId || assignedIds.has(a.id));
  }
  if (Array.isArray(filters.adAccountIds) && filters.adAccountIds.length) {
    const wanted = new Set(filters.adAccountIds);
    adAccounts = adAccounts.filter(a => wanted.has(a.id));
  }
  return {
    staff: staffRes.data || [],
    clients: clientRes.data || [],
    adAccounts,
    normal: adAccounts.filter(a => !a.is_shared),
    shared: adAccounts.filter(a => a.is_shared)
  };
}

function metaNum(v) {
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : 0;
}

async function syncMetaAccountDirectory(sb, tracker) {
  let path = 'me/adaccounts?fields=id,name,account_status&limit=100';
  const all = [];
  while (path) {
    const data = await fetchMetaPath(path, 'me/adaccounts');
    all.push(...(data.data || []));
    const nextCursor = data.paging && data.paging.next && data.paging.cursors && data.paging.cursors.after;
    path = nextCursor ? 'me/adaccounts?fields=id,name,account_status&limit=100&after=' + encodeURIComponent(nextCursor) : null;
  }

  const detailed = [];
  for (let b = 0; b < all.length; b += 50) {
    const chunk = all.slice(b, b + 50);
    const batchReqs = chunk.map(a => ({
      method: 'GET',
      relative_url: a.id + '?fields=id,name,account_status,spend_cap,amount_spent'
    }));
    try {
      const results = await fetchMetaBatch(batchReqs, 'ad_account_directory');
      if (!Array.isArray(results)) {
        chunk.forEach(a => tracker.push(a.id, 'account-directory', 'Batch API tra ve khong phai mang', 0));
        detailed.push(...chunk);
        continue;
      }
      for (let j = 0; j < chunk.length; j++) {
        try {
          const body = JSON.parse((results[j] && results[j].body) || '{}');
          if (body.error) {
            tracker.push(chunk[j].id, 'account-detail', body.error.message, body.error.code);
            detailed.push(chunk[j]);
          } else {
            detailed.push(Object.assign({}, chunk[j], body));
          }
        } catch (e) {
          tracker.push(chunk[j].id, 'account-detail-parse', e.message, 0);
          detailed.push(chunk[j]);
        }
      }
    } catch (e) {
      chunk.forEach(a => tracker.push(a.id, 'account-directory-network', e.message, e.code || 0));
      detailed.push(...chunk);
    }
  }

  const seen = new Set();
  const uniqueMeta = detailed.filter(m => {
    if (!m || !m.id || seen.has(m.id)) return false;
    seen.add(m.id);
    return true;
  });

  const adRes = await sb.from('ad_account').select('id,fb_account_id');
  if (adRes.error) throw new Error('ad_account: ' + adRes.error.message);
  const existingFb = new Set((adRes.data || []).map(a => a.fb_account_id).filter(Boolean));

  let placeholderId = null;
  const ph = await sb.from('client').select('id').eq('name', 'Chua phan loai').maybeSingle();
  if (ph.data && ph.data.id) {
    placeholderId = ph.data.id;
  } else {
    const ph2 = await sb.from('client').select('id').eq('name', 'Chưa phân loại').maybeSingle();
    if (ph2.data && ph2.data.id) placeholderId = ph2.data.id;
  }
  if (!placeholderId) {
    const ins = await sb.from('client').insert({ name: 'Chưa phân loại', status: 'active' }).select('id').single();
    if (ins.error) throw new Error('client placeholder: ' + ins.error.message);
    placeholderId = ins.data.id;
  }

  const newRows = uniqueMeta.filter(m => !existingFb.has(m.id)).map(m => ({
    client_id: placeholderId,
    account_name: m.name,
    fb_account_id: m.id,
    account_status: m.account_status || 1
  }));
  let imported = 0;
  for (let i = 0; i < newRows.length; i += 200) {
    const r = await sb.from('ad_account').insert(newRows.slice(i, i + 200));
    if (r.error) tracker.push(null, 'account-import', r.error.message, r.error.code);
    else imported += newRows.slice(i, i + 200).length;
  }

  await runLimited(uniqueMeta, 12, async m => {
    const r = await sb.from('ad_account').update({
      account_name: m.name || null,
      account_status: m.account_status || 1,
      spend_cap: metaNum(m.spend_cap),
      amount_spent: metaNum(m.amount_spent)
    }).eq('fb_account_id', m.id);
    if (r.error) tracker.push(m.id, 'account-update', r.error.message, r.error.code);
  });

  return { metaAccounts: uniqueMeta.length, imported };
}

async function upsertDailyRows(sb, rows, tracker, phase) {
  let saved = 0;
  for (let i = 0; i < rows.length; i += 200) {
    const batch = rows.slice(i, i + 200);
    const dbRows = batch.map(r => ({
      ad_account_id: r.ad_account_id,
      report_date: r.report_date,
      spend_amount: r.spend_amount,
      staff_id: r.staff_id || null,
      matched_client_id: r.matched_client_id || null
    }));
    const ur = await sb.from('daily_spend').upsert(dbRows, { onConflict: 'ad_account_id,report_date,staff_id,matched_client_id' });
    if (ur.error) {
      batch.forEach(r => tracker.push(r._accId || r.ad_account_id, phase || 'daily-upsert', ur.error.message, ur.error.code));
    } else {
      saved += batch.length;
    }
  }
  return saved;
}

async function syncDailySpendForDate(sb, syncDate, normal, shared, staff, clients, tracker) {
  let saved = 0;
  const dayRange = metaTimeRangeParam(syncDate, syncDate);
  const normalRows = [];

  for (let b = 0; b < normal.length; b += 50) {
    const chunk = normal.slice(b, b + 50);
    const batchReqs = chunk.map(a => ({
      method: 'GET',
      relative_url: a.fb_account_id + '/insights?fields=spend&time_range=' + dayRange
    }));
    try {
      const results = await fetchMetaBatch(batchReqs, 'daily_spend_' + syncDate);
      if (!Array.isArray(results)) {
        const em = results && results.error && results.error.message || 'Batch API tra ve khong phai mang';
        const ec = results && results.error && results.error.code || 0;
        chunk.forEach(a => tracker.push(a.fb_account_id, 'daily-batch', em, ec));
        continue;
      }
      for (let j = 0; j < results.length; j++) {
        const accId = chunk[j].fb_account_id;
        try {
          const body = JSON.parse((results[j] && results[j].body) || '{}');
          if (body.error) {
            tracker.push(accId, 'daily-insights', body.error.message, body.error.code);
            continue;
          }
          let spend = 0;
          if (body.data && body.data.length) spend = Math.round(parseFloat(body.data[0].spend || 0));
          normalRows.push({
            ad_account_id: chunk[j].id,
            report_date: syncDate,
            spend_amount: spend,
            staff_id: null,
            matched_client_id: null,
            _accId: accId
          });
        } catch (e) {
          tracker.push(accId, 'daily-parse', e.message, 0);
        }
      }
    } catch (e) {
      chunk.forEach(a => tracker.push(a.fb_account_id, 'daily-network', e.message, e.code || 0));
    }
  }

  saved += await upsertDailyRows(sb, normalRows, tracker, 'daily-normal-upsert');

  const sharedFns = shared.map(a => async () => {
    try {
      const data = await fetchMetaPath(a.fb_account_id + '/insights?level=campaign&fields=campaign_name,spend&time_range=' + dayRange + '&limit=500', 'daily_shared');
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
        ad_account_id: a.id,
        report_date: syncDate,
        spend_amount: cb.spend,
        staff_id: cb.sid,
        matched_client_id: cb.cid,
        _accId: a.fb_account_id
      }));

      const validKeys = new Set(rows.map(r => r.staff_id + '|' + (r.matched_client_id || '')));
      const existing = await sb.from('daily_spend')
        .select('id,staff_id,matched_client_id')
        .eq('ad_account_id', a.id)
        .eq('report_date', syncDate)
        .not('staff_id', 'is', null);
      if (existing.error) {
        tracker.push(a.fb_account_id, 'shared-existing', existing.error.message, existing.error.code);
      } else if (existing.data) {
        const orphanIds = existing.data
          .filter(x => !validKeys.has(x.staff_id + '|' + (x.matched_client_id || '')))
          .map(x => x.id);
        if (orphanIds.length) {
          const del = await sb.from('daily_spend').delete().in('id', orphanIds);
          if (del.error) tracker.push(a.fb_account_id, 'shared-delete-orphan', del.error.message, del.error.code);
        }
      }
      saved += await upsertDailyRows(sb, rows, tracker, 'daily-shared-upsert');
    } catch (e) {
      tracker.push(a.fb_account_id, 'daily-shared', e.message, e.code || 0);
    }
  });

  for (let s = 0; s < sharedFns.length; s += 5) {
    await Promise.all(sharedFns.slice(s, s + 5).map(fn => fn()));
  }

  console.log('[daily_spend ' + syncDate + '] saved=' + saved + ' errors=' + tracker.errors);
  return { saved };
}

async function syncCampaignMess(sb, adAccounts, from, to, tracker) {
  const mapped = adAccounts.filter(a => a.fb_account_id);
  if (!mapped.length) return { saved: 0 };

  let saved = 0;
  const allRows = [];
  const messRange = metaTimeRangeParam(from, to);
  const activeFilter = encodeURIComponent(JSON.stringify([{ field: 'effective_status', operator: 'IN', value: ['ACTIVE'] }]));

  for (let b = 0; b < mapped.length; b += DEFAULT_CAMPAIGN_MESS_BATCH_SIZE) {
    const chunk = mapped.slice(b, b + DEFAULT_CAMPAIGN_MESS_BATCH_SIZE);
    const batchReqs = [];
    chunk.forEach(a => {
      batchReqs.push({ method: 'GET', relative_url: a.fb_account_id + '/campaigns?fields=id,effective_status&filtering=' + activeFilter + '&limit=500' });
      batchReqs.push({ method: 'GET', relative_url: a.fb_account_id + '/insights?level=campaign&fields=campaign_id,campaign_name,spend,actions&time_range=' + messRange + '&time_increment=1&limit=500' });
      batchReqs.push({ method: 'GET', relative_url: a.fb_account_id + '/adsets?fields=campaign_id,optimization_goal,destination_type&limit=500' });
    });
    try {
      const bResults = await fetchMetaBatch(batchReqs, 'campaign_daily_mess');
      if (!Array.isArray(bResults)) {
        const em = bResults && bResults.error && bResults.error.message || 'Batch API tra ve khong phai mang';
        const ec = bResults && bResults.error && bResults.error.code || 0;
        chunk.forEach(a => tracker.push(a.fb_account_id, 'campaign-mess-batch', em, ec));
        continue;
      }
      for (let j = 0; j < chunk.length; j++) {
        const accId = chunk[j].fb_account_id;
        try {
          const campBody = JSON.parse((bResults[j * 3] && bResults[j * 3].body) || '{}');
          const insBody = JSON.parse((bResults[j * 3 + 1] && bResults[j * 3 + 1].body) || '{}');
          const adsetsBody = JSON.parse((bResults[j * 3 + 2] && bResults[j * 3 + 2].body) || '{}');
          if (campBody.error) {
            tracker.push(accId, 'campaigns', campBody.error.message, campBody.error.code);
            continue;
          }
          if (insBody.error) {
            tracker.push(accId, 'campaign-insights', insBody.error.message, insBody.error.code);
            continue;
          }
          if (adsetsBody.error) tracker.push(accId, 'adsets-nonfatal', adsetsBody.error.message, adsetsBody.error.code);
          allRows.push(...parseMessRows(chunk[j], campBody, insBody, adsetsBody));
        } catch (e) {
          tracker.push(accId, 'campaign-parse', e.message, 0);
        }
      }
    } catch (e) {
      chunk.forEach(a => tracker.push(a.fb_account_id, 'campaign-network', e.message, e.code || 0));
    }
  }

  for (let i = 0; i < allRows.length; i += 500) {
    const batch = allRows.slice(i, i + 500);
    const r = await sb.from('campaign_daily_mess').upsert(batch, { onConflict: 'ad_account_id,campaign_id,report_date' });
    if (r.error) {
      batch.forEach(row => tracker.push(row.ad_account_id, 'campaign-upsert', r.error.message, r.error.code));
    } else {
      saved += batch.length;
    }
  }

  console.log('[campaign_daily_mess] saved=' + saved + ' errors=' + tracker.errors);
  return { saved };
}

async function syncAdDailyPost(sb, adAccounts, from, to, tracker) {
  const mapped = adAccounts.filter(a => a.fb_account_id);
  if (!mapped.length) return { saved: 0 };

  let saved = 0;
  const allRows = [];
  const postRange = metaTimeRangeParam(from, to);

  for (let b = 0; b < mapped.length; b += DEFAULT_AD_DAILY_POST_BATCH_SIZE) {
    const chunk = mapped.slice(b, b + DEFAULT_AD_DAILY_POST_BATCH_SIZE);
    const batchReqs = [];
    chunk.forEach(a => {
      batchReqs.push({ method: 'GET', relative_url: a.fb_account_id + '/insights?level=ad&fields=ad_id,ad_name,campaign_id,campaign_name,spend,actions&time_range=' + postRange + '&time_increment=1&limit=500' });
      batchReqs.push({ method: 'GET', relative_url: a.fb_account_id + '/ads?fields=id,name,status,creative{effective_object_story_id,thumbnail_url}&limit=500' });
    });
    try {
      const bResults = await fetchMetaBatch(batchReqs, 'ad_daily_post');
      if (!Array.isArray(bResults)) {
        const em = bResults && bResults.error && bResults.error.message || 'Batch API tra ve khong phai mang';
        const ec = bResults && bResults.error && bResults.error.code || 0;
        chunk.forEach(a => tracker.push(a.fb_account_id, 'ad-post-batch', em, ec));
        continue;
      }
      for (let j = 0; j < chunk.length; j++) {
        const accId = chunk[j].fb_account_id;
        try {
          const insBody = JSON.parse((bResults[j * 2] && bResults[j * 2].body) || '{}');
          const adsBody = JSON.parse((bResults[j * 2 + 1] && bResults[j * 2 + 1].body) || '{}');
          if (insBody.error) {
            tracker.push(accId, 'ad-post-insights', insBody.error.message, insBody.error.code);
            continue;
          }
          if (adsBody.error) tracker.push(accId, 'ads-nonfatal', adsBody.error.message, adsBody.error.code);
          const adsMeta = {};
          ((adsBody && adsBody.data) || []).forEach(ad => {
            const c = ad.creative || {};
            const posid = c.effective_object_story_id || null;
            let purl = null;
            if (posid && posid.indexOf('_') > 0) {
              const parts = posid.split('_');
              purl = 'https://www.facebook.com/' + parts[0] + '/posts/' + parts[1];
            }
            adsMeta[ad.id] = {
              status: ad.status || null,
              post_id: posid,
              post_url: purl,
              thumbnail_url: c.thumbnail_url || null
            };
          });
          (insBody.data || []).forEach(r => {
            const spend = Math.round(parseFloat(r.spend || 0));
            const counts = parseActionCounts(r.actions);
            const meta = adsMeta[r.ad_id] || {};
            allRows.push({
              ad_account_id: chunk[j].id,
              ad_id: r.ad_id,
              report_date: r.date_start,
              ad_name: r.ad_name || null,
              campaign_id: r.campaign_id || null,
              campaign_name: r.campaign_name || null,
              post_id: meta.post_id || null,
              post_url: meta.post_url || null,
              thumbnail_url: meta.thumbnail_url || null,
              spend,
              mess_count: counts.messCount,
              comment_count: counts.commentCount,
              lead_count: counts.leadCount,
              checkout_count: counts.checkoutCount,
              ad_status: meta.status || null
            });
          });
        } catch (e) {
          tracker.push(accId, 'ad-post-parse', e.message, 0);
        }
      }
    } catch (e) {
      chunk.forEach(a => tracker.push(a.fb_account_id, 'ad-post-network', e.message, e.code || 0));
    }
  }

  for (let i = 0; i < allRows.length; i += 500) {
    const batch = allRows.slice(i, i + 500);
    const r = await sb.from('ad_daily_post').upsert(batch, { onConflict: 'ad_account_id,ad_id,report_date' });
    if (r.error) {
      batch.forEach(row => tracker.push(row.ad_account_id, 'ad-post-upsert', r.error.message, r.error.code));
    } else {
      saved += batch.length;
    }
  }

  console.log('[ad_daily_post] saved=' + saved + ' errors=' + tracker.errors);
  return { saved };
}

async function refreshViews(sb) {
  try {
    const t0 = Date.now();
    await sb.rpc('refresh_ad_account_month_spend');
    console.log('[meta-sync] refreshed ad_account_month_spend in ' + (Date.now() - t0) + 'ms');
  } catch (e) {
    console.warn('[meta-sync] skip refresh_ad_account_month_spend:', e.message);
  }
}

async function hasRecentJob(sb, scope, hours) {
  try {
    const since = new Date(Date.now() - hours * 3600 * 1000).toISOString();
    const r = await sb.from('meta_sync_jobs')
      .select('id,finished_at,status')
      .eq('scope', scope)
      .in('status', ['success', 'partial_error'])
      .gte('finished_at', since)
      .order('finished_at', { ascending: false })
      .limit(1);
    return !r.error && r.data && r.data.length;
  } catch (e) {
    return false;
  }
}

async function recordAccountAccessSamples(sb, adAccounts, samples, errorAccountIds) {
  const nowIso = new Date().toISOString();
  const okIds = (adAccounts || [])
    .filter(a => a.fb_account_id && !(errorAccountIds || new Set()).has(String(a.fb_account_id)))
    .map(a => a.fb_account_id);
  for (let i = 0; i < okIds.length; i += 100) {
    const r = await sb.from('ad_account').update({
      meta_access_status: 'ok',
      last_meta_error_code: null,
      last_meta_error_message: null,
      last_successful_sync_at: nowIso
    }).in('fb_account_id', okIds.slice(i, i + 100));
    if (r.error && /column .* does not exist|schema cache/i.test(r.error.message || '')) return;
  }

  const accessSamples = (samples || []).filter(s => Number(s.code) === 200 && s.accId);
  if (!accessSamples.length) return;
  for (const s of accessSamples.slice(0, 50)) {
    const r = await sb.from('ad_account').update({
      meta_access_status: 'permission_error',
      last_meta_error_code: Number(s.code) || null,
      last_meta_error_message: s.msg || null
    }).eq('fb_account_id', s.accId);
    if (r.error && /column .* does not exist|schema cache/i.test(r.error.message || '')) return;
  }
}

function normalizeScope(scope) {
  const s = String(scope || 'auto').toLowerCase();
  if (['auto', 'today', 'range', 'campaign_mess', 'ad_posts', 'cron', 'full'].includes(s)) return s;
  return 'auto';
}

async function runMetaSync(options) {
  const opts = options || {};
  const sb = opts.sb || createSupabase();
  const scope = normalizeScope(opts.scope);
  const tracker = makeErrorTracker();
  const today = vnDate(0);
  const yesterday = vnDate(-86400000);
  const startedAt = Date.now();
  let dateFrom = opts.dateFrom || opts.date_from || today;
  let dateTo = opts.dateTo || opts.date_to || dateFrom;
  let saved = 0;
  const details = {
    scope,
    date_from: dateFrom,
    date_to: dateTo,
    imported_accounts: 0,
    account_directory_count: 0,
    daily_days: [],
    daily_saved: 0,
    campaign_mess_saved: 0,
    ad_daily_post_saved: 0
  };

  if (scope === 'auto') {
    dateFrom = today;
    dateTo = today;
    details.date_from = today;
    details.date_to = today;
  }

  if (opts.updateAccounts !== false && ['auto', 'cron', 'full'].includes(scope)) {
    const ar = await syncMetaAccountDirectory(sb, tracker);
    details.imported_accounts = ar.imported;
    details.account_directory_count = ar.metaAccounts;
  }

  const data = await loadSyncData(sb, {
    clientId: opts.clientId || opts.client_id || null,
    adAccountIds: opts.adAccountIds || opts.ad_account_ids || null
  });
  details.total_accounts = data.adAccounts.length;
  if (opts.clientId || opts.client_id) details.client_id = opts.clientId || opts.client_id;

  const shouldSyncDaily = ['auto', 'today', 'range', 'cron', 'full'].includes(scope);
  const shouldSyncCampaignMess = opts.includeCampaignMess === true ||
    scope === 'campaign_mess' || scope === 'cron' || scope === 'full';
  const shouldSyncAdPosts = opts.includeAdPosts === true || scope === 'ad_posts' || scope === 'cron' || scope === 'full';

  if (shouldSyncDaily) {
    const days = scope === 'auto' ? [today] : buildDailyDays(dateFrom, dateTo);
    if (scope === 'auto' && !(await hasRecentJob(sb, 'auto', 6))) days.push(yesterday);
    details.daily_days = days;
    for (const day of days) {
      const r = await syncDailySpendForDate(sb, day, data.normal, data.shared, data.staff, data.clients, tracker);
      saved += r.saved;
      details.daily_saved += r.saved;
    }
  }

  if (shouldSyncCampaignMess) {
    const messFrom = opts.messFrom || opts.mess_from || (scope === 'campaign_mess' ? dateFrom : dateAdd(today, -3));
    const messTo = opts.messTo || opts.mess_to || (scope === 'campaign_mess' ? dateTo : today);
    const r = await syncCampaignMess(sb, data.adAccounts, messFrom, messTo, tracker);
    saved += r.saved;
    details.campaign_mess_saved += r.saved;
    details.campaign_mess_from = messFrom;
    details.campaign_mess_to = messTo;
  }

  if (shouldSyncAdPosts) {
    const postFrom = opts.postFrom || opts.post_from || dateFrom;
    const postTo = opts.postTo || opts.post_to || dateTo;
    const r = await syncAdDailyPost(sb, data.adAccounts, postFrom, postTo, tracker);
    saved += r.saved;
    details.ad_daily_post_saved += r.saved;
    details.ad_post_from = postFrom;
    details.ad_post_to = postTo;
  }

  await refreshViews(sb);
  await recordAccountAccessSamples(sb, data.adAccounts, tracker.samples, tracker.errorAccountIds);

  const errorAccounts = tracker.errorAccountIds.size;
  const totalAccounts = data.adAccounts.length;
  const status = tracker.errors ? (saved ? 'partial_error' : 'failed') : 'success';
  const result = {
    status,
    scope,
    total_accounts: totalAccounts,
    ok_accounts: Math.max(totalAccounts - errorAccounts, 0),
    error_accounts: errorAccounts,
    saved_rows: saved,
    error_rows: tracker.errors,
    error_samples: tracker.samples,
    details,
    duration_ms: Date.now() - startedAt
  };
  console.log('[meta-sync] done', JSON.stringify({
    scope,
    status,
    saved_rows: result.saved_rows,
    error_rows: result.error_rows,
    duration_ms: result.duration_ms
  }));
  return result;
}

module.exports = {
  buildDailyDays,
  createSupabase,
  dateAdd,
  fetchMetaBatch,
  metaTimeRangeParam,
  runMetaSync,
  syncAdDailyPost,
  syncCampaignMess,
  syncDailySpendForDate,
  syncMetaAccountDirectory,
  vnDate
};
