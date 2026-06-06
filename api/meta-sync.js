// HC Agency Dashboard — server-side Meta sync job API
// UI calls this endpoint to start/poll sync without doing heavy Meta fanout in browser.

const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');
const { createSupabase, runMetaSync, vnDate, dateAdd } = require('./_lib/meta-sync');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const MEMORY_JOBS = global.__hcMetaSyncJobs || new Map();
global.__hcMetaSyncJobs = MEMORY_JOBS;

function jsonNoStore(res) {
  res.setHeader('Cache-Control', 'no-store');
}

function uuid() {
  return crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + '-' + Math.random().toString(36).slice(2);
}

function isIsoDate(s) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(s || ''));
}

function safeScope(scope) {
  const s = String(scope || 'auto').toLowerCase();
  if (['auto', 'today', 'range', 'campaign_mess', 'ad_posts', 'cron', 'full'].includes(s)) return s;
  return 'auto';
}

function publicJob(row) {
  if (!row) return null;
  return {
    id: row.id,
    scope: row.scope,
    status: row.status,
    date_from: row.date_from,
    date_to: row.date_to,
    started_at: row.started_at,
    finished_at: row.finished_at,
    total_accounts: row.total_accounts || 0,
    ok_accounts: row.ok_accounts || 0,
    error_accounts: row.error_accounts || 0,
    saved_rows: row.saved_rows || 0,
    error_rows: row.error_rows || 0,
    details: row.details || {},
    error_samples: row.error_samples || [],
    error_message: row.error_message || null,
    source: row.source || null
  };
}

async function verifyAuth(req) {
  const auth = req.headers && (req.headers.authorization || req.headers.Authorization) || '';
  const token = String(auth).replace(/^Bearer\s+/i, '').trim();
  if (!token) return null;
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) return null;
  try {
    const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, { auth: { persistSession: false } });
    const { data, error } = await sb.auth.getUser(token);
    if (error || !data || !data.user) return null;
    return data.user;
  } catch (e) {
    console.error('[meta-sync] verifyAuth:', e.message);
    return null;
  }
}

function memoryInsert(row) {
  MEMORY_JOBS.set(row.id, row);
  return row;
}

function memoryUpdate(id, patch) {
  const cur = MEMORY_JOBS.get(id) || { id };
  const next = Object.assign({}, cur, patch);
  MEMORY_JOBS.set(id, next);
  return next;
}

async function dbInsertJob(sb, row) {
  const r = await sb.from('meta_sync_jobs').insert(row).select('*').single();
  if (r.error) throw r.error;
  return r.data;
}

async function dbUpdateJob(sb, id, patch) {
  const r = await sb.from('meta_sync_jobs').update(patch).eq('id', id).select('*').single();
  if (r.error) throw r.error;
  return r.data;
}

async function getJob(sb, id) {
  if (!id) return null;
  try {
    const r = await sb.from('meta_sync_jobs').select('*').eq('id', id).maybeSingle();
    if (!r.error && r.data) return r.data;
  } catch (e) {}
  return MEMORY_JOBS.get(id) || null;
}

async function latestJob(sb, scope) {
  try {
    let q = sb.from('meta_sync_jobs').select('*').order('started_at', { ascending: false }).limit(1);
    if (scope) q = q.eq('scope', safeScope(scope));
    const r = await q;
    if (!r.error && r.data && r.data.length) return r.data[0];
  } catch (e) {}
  let latest = null;
  MEMORY_JOBS.forEach(row => {
    if (scope && row.scope !== safeScope(scope)) return;
    if (!latest || String(row.started_at || '') > String(latest.started_at || '')) latest = row;
  });
  return latest;
}

async function findReusableJob(sb, scope, dateFrom, dateTo) {
  const nowIso = new Date().toISOString();
  try {
    const running = await sb.from('meta_sync_jobs')
      .select('*')
      .eq('scope', scope)
      .eq('date_from', dateFrom)
      .eq('date_to', dateTo)
      .in('status', ['queued', 'running'])
      .gte('locked_until', nowIso)
      .order('started_at', { ascending: false })
      .limit(1);
    if (!running.error && running.data && running.data.length) return running.data[0];

    const freshMinutes = scope === 'auto' || scope === 'today' ? 5 : 0;
    if (freshMinutes) {
      const since = new Date(Date.now() - freshMinutes * 60000).toISOString();
      const fresh = await sb.from('meta_sync_jobs')
        .select('*')
        .eq('scope', scope)
        .eq('date_from', dateFrom)
        .eq('date_to', dateTo)
        .in('status', ['success', 'partial_error'])
        .gte('finished_at', since)
        .order('finished_at', { ascending: false })
        .limit(1);
      if (!fresh.error && fresh.data && fresh.data.length) return fresh.data[0];
    }
  } catch (e) {}

  let mem = null;
  MEMORY_JOBS.forEach(row => {
    if (row.scope === scope && row.date_from === dateFrom && row.date_to === dateTo &&
      ['queued', 'running'].includes(row.status) && String(row.locked_until || '') >= nowIso) {
      mem = row;
    }
  });
  return mem;
}

async function persistUpdate(sb, id, patch) {
  const mem = memoryUpdate(id, patch);
  try {
    return await dbUpdateJob(sb, id, patch);
  } catch (e) {
    if (!/relation.*does not exist|schema cache/i.test(e.message || '')) {
      console.warn('[meta-sync] DB update fallback:', e.message);
    }
    return mem;
  }
}

async function runJobInBackground(job, payload) {
  const sb = createSupabase();
  await persistUpdate(sb, job.id, {
    status: 'running',
    started_at: new Date().toISOString(),
    locked_until: new Date(Date.now() + 30 * 60000).toISOString()
  });

  try {
    const result = await runMetaSync({
      sb,
      scope: payload.scope,
      dateFrom: payload.date_from,
      dateTo: payload.date_to,
      clientId: payload.client_id,
      includeCampaignMess: payload.include_campaign_mess,
      includeAdPosts: payload.include_ad_posts,
      updateAccounts: payload.update_accounts !== false
    });
    await persistUpdate(sb, job.id, {
      status: result.status,
      finished_at: new Date().toISOString(),
      locked_until: new Date().toISOString(),
      total_accounts: result.total_accounts,
      ok_accounts: result.ok_accounts,
      error_accounts: result.error_accounts,
      saved_rows: result.saved_rows,
      error_rows: result.error_rows,
      details: result.details,
      error_samples: result.error_samples,
      error_message: result.status === 'failed' ? 'Meta sync failed' : null
    });
  } catch (e) {
    console.error('[meta-sync job]', e);
    await persistUpdate(sb, job.id, {
      status: 'failed',
      finished_at: new Date().toISOString(),
      locked_until: new Date().toISOString(),
      error_message: e.message || String(e)
    });
  }
}

function normalizeRequest(body) {
  const scope = safeScope(body.scope);
  const today = vnDate(0);
  let dateFrom = body.date_from || body.dateFrom || today;
  let dateTo = body.date_to || body.dateTo || dateFrom;

  if (scope === 'auto' || scope === 'today') {
    dateFrom = today;
    dateTo = today;
  }
  if (scope === 'campaign_mess' && (!body.date_from && !body.dateFrom)) {
    dateFrom = dateAdd(today, -3);
    dateTo = today;
  }
  if (!isIsoDate(dateFrom) || !isIsoDate(dateTo) || dateFrom > dateTo) {
    throw new Error('Khoang ngay khong hop le');
  }

  return {
    scope,
    date_from: dateFrom,
    date_to: dateTo,
    client_id: body.client_id || body.clientId || null,
    include_campaign_mess: body.include_campaign_mess === true || body.includeCampaignMess === true,
    include_ad_posts: body.include_ad_posts === true || body.includeAdPosts === true,
    update_accounts: body.update_accounts !== false && body.updateAccounts !== false
  };
}

module.exports = async (req, res) => {
  jsonNoStore(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (!['GET', 'POST'].includes(req.method)) return res.status(405).json({ error: 'Method not allowed' });
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) return res.status(500).json({ error: 'Supabase env chua day du' });

  const user = await verifyAuth(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized - vui long dang nhap lai' });

  const sb = createSupabase();

  if (req.method === 'GET') {
    const id = req.query && req.query.id;
    const scope = req.query && req.query.scope;
    const row = id ? await getJob(sb, id) : await latestJob(sb, scope);
    if (!row) return res.status(404).json({ error: 'Job not found' });
    return res.status(200).json({ job: publicJob(row) });
  }

  let payload;
  try {
    payload = normalizeRequest(req.body || {});
  } catch (e) {
    return res.status(400).json({ error: e.message });
  }

  const reusable = payload.client_id ? null : await findReusableJob(sb, payload.scope, payload.date_from, payload.date_to);
  if (reusable) {
    return res.status(200).json({ job: publicJob(reusable), reused: true });
  }

  const baseJob = {
    id: uuid(),
    scope: payload.scope,
    status: 'queued',
    date_from: payload.date_from,
    date_to: payload.date_to,
    started_at: new Date().toISOString(),
    finished_at: null,
    requested_by: user.id || null,
    requested_email: user.email || null,
    source: 'ui',
    total_accounts: 0,
    ok_accounts: 0,
    error_accounts: 0,
    saved_rows: 0,
    error_rows: 0,
    details: {},
    error_samples: [],
    locked_until: new Date(Date.now() + 30 * 60000).toISOString()
  };

  let job = memoryInsert(baseJob);
  try {
    job = await dbInsertJob(sb, baseJob);
    memoryUpdate(job.id, job);
  } catch (e) {
    if (!/relation.*does not exist|schema cache/i.test(e.message || '')) {
      console.warn('[meta-sync] DB insert fallback:', e.message);
    }
  }

  runJobInBackground(job, payload);
  return res.status(202).json({ job: publicJob(job), queued: true });
};
