const { createDbClient, deleteMetaPath, fetchMetaPath } = require('./meta-sync');
const { notifyPolicyAlertTelegram, notifyRentalBalanceTelegram } = require('./policy-alert-telegram');

const DEFAULT_POLICY_SCAN_BATCH_SIZE = Number(process.env.POLICY_ALERT_SCAN_BATCH_SIZE || 6);
const AUTO_DELETE_DISAPPROVED_ADS = process.env.POLICY_ALERT_AUTO_DELETE_DISAPPROVED_ADS === '1';

function nowIso() {
  return new Date().toISOString();
}

function normalizeFbAccountId(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  return raw.startsWith('act_') ? raw : 'act_' + raw.replace(/^act_/, '');
}

function adsManagerAdUrl(fbAccountId, adId) {
  const act = String(fbAccountId || '').replace(/^act_/, '');
  if (!act || !adId) return '';
  return 'https://adsmanager.facebook.com/adsmanager/manage/ads?act=' +
    encodeURIComponent(act) + '&selected_ad_ids=' + encodeURIComponent(adId);
}

function rejectedAdsPath(fbAccountId, after) {
  const fields = 'id,name,effective_status,configured_status,status,campaign_id,campaign{name},adset_id,adset{name},updated_time';
  const filtering = encodeURIComponent(JSON.stringify([
    { field: 'effective_status', operator: 'IN', value: ['DISAPPROVED'] }
  ]));
  let path = normalizeFbAccountId(fbAccountId) + '/ads?fields=' + fields +
    '&filtering=' + filtering + '&limit=500';
  if (after) path += '&after=' + encodeURIComponent(after);
  return path;
}

function adToAlertRow(account, ad, scanTime) {
  const campaign = ad.campaign || {};
  const adset = ad.adset || {};
  return {
    ad_account_id: account.id,
    fb_account_id: normalizeFbAccountId(account.fb_account_id),
    ad_id: String(ad.id || ''),
    ad_name: ad.name || null,
    campaign_id: ad.campaign_id || campaign.id || null,
    campaign_name: campaign.name || null,
    adset_id: ad.adset_id || adset.id || null,
    adset_name: adset.name || null,
    effective_status: ad.effective_status || null,
    configured_status: ad.configured_status || null,
    meta_status: ad.status || null,
    status: 'open',
    last_seen_at: scanTime,
    resolved_at: null,
    ignored_at: null,
    raw: Object.assign({}, ad, {
      ads_manager_url: adsManagerAdUrl(account.fb_account_id, ad.id)
    })
  };
}

async function fetchRejectedAdsForAccount(account) {
  const rows = [];
  let after = null;
  let guard = 0;
  do {
    const data = await fetchMetaPath(rejectedAdsPath(account.fb_account_id, after), 'policy_rejected_ads');
    rows.push(...((data && data.data) || []));
    after = data && data.paging && data.paging.cursors && data.paging.cursors.after;
    guard += 1;
  } while (after && guard < 20);
  return rows;
}

async function deleteRejectedAd(row) {
  if (!row || !row.ad_id) throw new Error('Missing ad_id for policy auto delete');
  return deleteMetaPath(String(row.ad_id), 'policy_rejected_ad_delete');
}

async function autoDeleteRejectedAds(rows, result, scanTime) {
  result.auto_delete_ads.enabled = AUTO_DELETE_DISAPPROVED_ADS;
  if (!AUTO_DELETE_DISAPPROVED_ADS || !rows.length) return;
  for (const row of rows) {
    result.auto_delete_ads.attempted += 1;
    try {
      const data = await deleteRejectedAd(row);
      result.auto_delete_ads.deleted += 1;
      row.raw = Object.assign({}, row.raw || {}, {
        auto_delete: {
          action: 'delete_ad',
          success: true,
          at: scanTime,
          response: data || null
        }
      });
    } catch (e) {
      result.auto_delete_ads.errors += 1;
      row.raw = Object.assign({}, row.raw || {}, {
        auto_delete: {
          action: 'delete_ad',
          success: false,
          at: scanTime,
          error: e.message || String(e),
          code: e.code || null
        }
      });
      if (result.errors.length < 20) {
        result.errors.push({
          account: row.account_name || row.fb_account_id,
          fb_account_id: row.fb_account_id,
          ad_id: row.ad_id,
          phase: 'policy-auto-delete-ad',
          message: e.message || String(e),
          code: e.code || null
        });
      }
    }
  }
}

async function resolveMissingAlerts(sb, accountIds, seenKeys, scanTime) {
  if (!accountIds.length) return 0;
  const current = await sb.from('ad_policy_alert')
    .select('id,ad_account_id,ad_id')
    .in('ad_account_id', accountIds)
    .eq('status', 'open');
  if (current.error) throw current.error;
  const stale = (current.data || []).filter(row => !seenKeys.has(row.ad_account_id + '|' + row.ad_id));
  if (!stale.length) return 0;
  const ids = stale.map(row => row.id);
  const up = await sb.from('ad_policy_alert')
    .update({ status: 'resolved', resolved_at: scanTime, updated_at: scanTime })
    .in('id', ids);
  if (up.error) throw up.error;
  return ids.length;
}

async function scanRejectedAds(options) {
  const opts = options || {};
  const sb = opts.sb || createDbClient();
  const scanTime = nowIso();
  const startedAt = Date.now();
  const result = {
    status: 'success',
    started_at: scanTime,
    finished_at: null,
    scanned_accounts: 0,
    watched_accounts: 0,
    rejected_ads: 0,
    saved_alerts: 0,
    resolved_alerts: 0,
    auto_delete_ads: { enabled: AUTO_DELETE_DISAPPROVED_ADS, attempted: 0, deleted: 0, errors: 0 },
    telegram_notifications: { enabled: false, candidates: 0, matched: 0, sent: 0, errors: [] },
    rental_balance_notifications: { enabled: false, threshold: 0, checked: 0, alerting: 0, sent: 0, errors: [] },
    error_accounts: 0,
    errors: []
  };

  const q = await sb.from('ad_account')
    .select('id,fb_account_id,account_name,policy_reject_watch')
    .eq('policy_reject_watch', true)
    .not('fb_account_id', 'is', null);
  if (q.error) throw q.error;

  const accounts = (q.data || []).filter(a => a.fb_account_id);
  result.watched_accounts = accounts.length;
  const accountIds = accounts.map(a => a.id);
  const seenKeys = new Set();
  const allRows = [];
  const existingByKey = new Map();

  if (accountIds.length) {
    const existing = await sb.from('ad_policy_alert')
      .select('id,ad_account_id,ad_id,status,telegram_notified_at')
      .in('ad_account_id', accountIds);
    if (existing.error) throw existing.error;
    (existing.data || []).forEach(row => {
      existingByKey.set(row.ad_account_id + '|' + row.ad_id, row);
    });
  }

  for (let i = 0; i < accounts.length; i += DEFAULT_POLICY_SCAN_BATCH_SIZE) {
    const chunk = accounts.slice(i, i + DEFAULT_POLICY_SCAN_BATCH_SIZE);
    await Promise.all(chunk.map(async account => {
      result.scanned_accounts += 1;
      try {
        const ads = await fetchRejectedAdsForAccount(account);
        ads.forEach(ad => {
          if (!ad || !ad.id) return;
          const row = adToAlertRow(account, ad, scanTime);
          const key = row.ad_account_id + '|' + row.ad_id;
          seenKeys.add(key);
          allRows.push(row);
        });
      } catch (e) {
        result.error_accounts += 1;
        if (result.errors.length < 20) {
          result.errors.push({
            account: account.account_name || account.fb_account_id,
            fb_account_id: account.fb_account_id,
            message: e.message || String(e),
            code: e.code || null
          });
        }
      }
    }));
  }

  result.rejected_ads = allRows.length;
  await autoDeleteRejectedAds(allRows, result, scanTime);

  for (let i = 0; i < allRows.length; i += 500) {
    const batch = allRows.slice(i, i + 500);
    const up = await sb.from('ad_policy_alert')
      .upsert(batch, { onConflict: 'ad_account_id,ad_id' })
      .select('*');
    if (up.error) throw up.error;
    result.saved_alerts += batch.length;
    // Nhắc lại mỗi vòng quét cho mọi bài vẫn còn DISAPPROVED.
    // Lớp Telegram notifier sẽ lọc tiếp theo client mục tiêu + TKQC đang bật policy_reject_watch.
    const notifyRows = up.data || [];
    if (notifyRows.length) {
      const nr = await notifyPolicyAlertTelegram(sb, notifyRows, {
        source: opts.source || 'scan',
        scanDate: scanTime.substring(0, 10)
      });
      result.telegram_notifications.enabled = result.telegram_notifications.enabled || nr.enabled;
      result.telegram_notifications.candidates += nr.candidates || 0;
      result.telegram_notifications.matched += nr.matched || 0;
      result.telegram_notifications.sent += nr.sent || 0;
      result.telegram_notifications.errors.push(...(nr.errors || []));
      if (result.telegram_notifications.errors.length > 20) {
        result.telegram_notifications.errors = result.telegram_notifications.errors.slice(0, 20);
      }
    }
  }

  result.resolved_alerts = await resolveMissingAlerts(sb, accountIds, seenKeys, scanTime);
  try {
    result.rental_balance_notifications = await notifyRentalBalanceTelegram(sb, {
      source: opts.source || 'scan',
      date: scanTime.substring(0, 10)
    });
  } catch (e) {
    result.rental_balance_notifications.errors = [{
      message: e.message || String(e)
    }];
  }
  result.finished_at = nowIso();
  result.duration_ms = Date.now() - startedAt;
  if (result.error_accounts || result.auto_delete_ads.errors) {
    result.status = result.saved_alerts || result.resolved_alerts || result.auto_delete_ads.deleted ? 'partial_error' : 'failed';
  }
  return result;
}

module.exports = {
  scanRejectedAds,
  adsManagerAdUrl
};
