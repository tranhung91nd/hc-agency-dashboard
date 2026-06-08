const DEFAULT_CLIENT_NAMES = '1 Tabb,01 Tabb';
const DEFAULT_RENTAL_BALANCE_THRESHOLD = 2100000;

function envList(name, fallback) {
  return String(process.env[name] || fallback || '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);
}

function normalizeClientKey(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '')
    .replace(/^0+(?=\d)/, '');
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function fm(n) {
  return Math.round(Number(n) || 0).toLocaleString('vi-VN') + 'đ';
}

function shortMoney(n) {
  n = Number(n) || 0;
  if (Math.abs(n) >= 1000000) return (n / 1000000).toFixed(1).replace(/\.0$/, '') + 'tr';
  if (Math.abs(n) >= 1000) return Math.round(n / 1000) + 'K';
  return String(Math.round(n));
}

function monthKey(dateStr) {
  return String(dateStr || new Date().toISOString()).substring(0, 7);
}

function nextMonthKey(ms) {
  const parts = String(ms || '').split('-');
  let y = Number(parts[0]);
  let m = Number(parts[1]) + 1;
  if (m > 12) {
    y += 1;
    m = 1;
  }
  return y + '-' + String(m).padStart(2, '0');
}

function hasRentalService(client) {
  const services = Array.isArray(client && client.services) ? client.services : [];
  return services.includes('tkqc_rental');
}

function getRentalFeePct(client) {
  const v = Number(client && client.rental_fee_pct);
  return v > 0 && v < 1 ? v : 0;
}

function getRentalFeeAmount(client, spend) {
  if (!hasRentalService(client)) return 0;
  const pct = getRentalFeePct(client);
  if (!pct || !spend) return 0;
  return Math.round((Number(spend) || 0) * pct / 1000) * 1000;
}

function shortDateTime(value) {
  if (!value) return '';
  try {
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return String(value).substring(0, 16);
    return d.toLocaleString('vi-VN', {
      timeZone: 'Asia/Ho_Chi_Minh',
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });
  } catch (e) {
    return String(value).substring(0, 16);
  }
}

function adsManagerAdUrl(fbAccountId, adId) {
  const act = String(fbAccountId || '').replace(/^act_/, '');
  if (!act || !adId) return '';
  return 'https://adsmanager.facebook.com/adsmanager/manage/ads?act=' +
    encodeURIComponent(act) + '&selected_ad_ids=' + encodeURIComponent(adId);
}

function buildMessage(alert) {
  const url = alert.ads_manager_url || adsManagerAdUrl(alert.fb_account_id, alert.ad_id);
  const title = alert.ad_name || ('Ad ' + alert.ad_id);
  const statuses = [
    alert.effective_status,
    alert.configured_status,
    alert.meta_status
  ].filter(Boolean).join(' / ');
  const lines = [
    '<b>Canh bao bai vi pham Meta</b>',
    '',
    '<b>Khach:</b> ' + escapeHtml(alert.client_name || '1 Tabb'),
    '<b>TKQC:</b> ' + escapeHtml(alert.account_name || alert.fb_account_id || ''),
    '<b>Quang cao:</b> ' + escapeHtml(title),
    '<b>ID bai:</b> <code>' + escapeHtml(alert.ad_id || '') + '</code>'
  ];
  if (alert.campaign_name) lines.push('<b>Campaign:</b> ' + escapeHtml(alert.campaign_name));
  if (alert.adset_name) lines.push('<b>Nhom QC:</b> ' + escapeHtml(alert.adset_name));
  if (statuses) lines.push('<b>Trang thai:</b> <code>' + escapeHtml(statuses) + '</code>');
  if (alert.last_seen_at) lines.push('<b>Phat hien:</b> ' + escapeHtml(shortDateTime(alert.last_seen_at)));
  if (url) lines.push('<a href="' + escapeHtml(url) + '">Mo dung bai trong Meta Ads Manager</a>');
  return lines.join('\n');
}

async function sendTelegramMessage(token, chatId, text) {
  const resp = await fetch('https://api.telegram.org/bot' + token + '/sendMessage', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: 'HTML',
      disable_web_page_preview: true
    })
  });
  if (!resp.ok) {
    const body = await resp.text();
    throw new Error('Telegram ' + resp.status + ': ' + body.substring(0, 300));
  }
}

function getTelegramConfig() {
  return {
    token: process.env.POLICY_ALERT_TELEGRAM_BOT_TOKEN || '',
    chatIds: envList('POLICY_ALERT_TELEGRAM_CHAT_IDS', process.env.POLICY_ALERT_TELEGRAM_CHAT_ID || ''),
    targetClientIds: new Set(envList('POLICY_ALERT_TELEGRAM_CLIENT_IDS', '').map(String)),
    targetClientNames: new Set(envList('POLICY_ALERT_TELEGRAM_CLIENT_NAMES', DEFAULT_CLIENT_NAMES).map(normalizeClientKey))
  };
}

function isTargetClient(client, cfg) {
  if (!client) return false;
  if (cfg.targetClientIds.size && cfg.targetClientIds.has(String(client.id || ''))) return true;
  return cfg.targetClientNames.has(normalizeClientKey(client.name));
}

function resolveAssignmentForDate(assignments, adAccountId, date) {
  const rows = assignments
    .filter(a => a.ad_account_id === adAccountId && a.start_date <= date && (!a.end_date || a.end_date >= date))
    .sort((a, b) => String(b.start_date || '').localeCompare(String(a.start_date || '')));
  return rows[0] || null;
}

async function enrichAlerts(sb, alerts, scanDate) {
  const accountIds = Array.from(new Set(alerts.map(a => a.ad_account_id).filter(Boolean)));
  if (!accountIds.length) return [];

  const [accountsRes, assignmentsRes, clientsRes] = await Promise.all([
    sb.from('ad_account').select('id,fb_account_id,account_name,client_id,policy_reject_watch').in('id', accountIds),
    sb.from('assignment').select('ad_account_id,client_id,staff_id,start_date,end_date').in('ad_account_id', accountIds),
    sb.from('client').select('id,name')
  ]);
  if (accountsRes.error) throw accountsRes.error;
  if (assignmentsRes.error) throw assignmentsRes.error;
  if (clientsRes.error) throw clientsRes.error;

  const accountsById = new Map((accountsRes.data || []).map(a => [a.id, a]));
  const clientsById = new Map((clientsRes.data || []).map(c => [c.id, c]));
  const assignments = assignmentsRes.data || [];

  return alerts.map(alert => {
    const acc = accountsById.get(alert.ad_account_id) || {};
    const asg = resolveAssignmentForDate(assignments, alert.ad_account_id, scanDate);
    const clientId = (asg && asg.client_id) || acc.client_id || null;
    const client = clientId ? clientsById.get(clientId) : null;
    const raw = alert.raw || {};
    return Object.assign({}, alert, {
      account_name: acc.account_name || alert.account_name || alert.fb_account_id || acc.fb_account_id || '',
      fb_account_id: alert.fb_account_id || acc.fb_account_id || '',
      client_id: clientId || '',
      client_name: client ? client.name : '',
      policy_reject_watch: !!acc.policy_reject_watch,
      ads_manager_url: raw.ads_manager_url || adsManagerAdUrl(alert.fb_account_id || acc.fb_account_id, alert.ad_id)
    });
  });
}

async function notifyPolicyAlertTelegram(sb, alerts, options) {
  const cfg = getTelegramConfig();
  const result = { enabled: false, candidates: alerts.length, matched: 0, sent: 0, errors: [] };

  if (!cfg.token || !cfg.chatIds.length || !alerts.length) return result;
  result.enabled = true;

  const scanDate = String((options && options.scanDate) || new Date().toISOString().substring(0, 10));
  const enriched = await enrichAlerts(sb, alerts, scanDate);
  const matched = enriched.filter(alert => {
    if (!alert.policy_reject_watch) return false;
    return isTargetClient({ id: alert.client_id, name: alert.client_name }, cfg);
  });
  result.matched = matched.length;

  const sentIds = [];
  for (const alert of matched) {
    const text = buildMessage(alert);
    let ok = false;
    for (const chatId of cfg.chatIds) {
      try {
        await sendTelegramMessage(cfg.token, chatId, text);
        result.sent += 1;
        ok = true;
      } catch (e) {
        if (result.errors.length < 10) {
          result.errors.push({
            chat_id: chatId,
            alert_id: alert.id || null,
            message: e.message || String(e)
          });
        }
      }
    }
    if (ok && alert.id) sentIds.push(alert.id);
  }

  if (sentIds.length) {
    const up = await sb.from('ad_policy_alert')
      .update({ telegram_notified_at: new Date().toISOString() })
      .in('id', sentIds);
    if (up.error && result.errors.length < 10) {
      result.errors.push({ message: up.error.message || String(up.error) });
    }
  }

  return result;
}

function resolveSpendClientId(row, account, assignmentsByAccount) {
  if (row && row.matched_client_id) return row.matched_client_id;
  if (!account) return null;
  const assigns = assignmentsByAccount.get(row.ad_account_id) || [];
  const active = assigns
    .filter(a => a.start_date <= row.report_date && (!a.end_date || a.end_date >= row.report_date))
    .sort((a, b) => String(b.start_date || '').localeCompare(String(a.start_date || '')));
  if (active.length) return active[0].client_id || null;
  if (assigns.length) return null;
  return account.client_id || null;
}

function buildRentalBalanceMessage(summary, threshold) {
  const lines = [
    '<b>Canh bao so du rental thap</b>',
    '',
    '<b>Khach:</b> ' + escapeHtml(summary.client_name),
    '<b>Ky:</b> ' + escapeHtml(summary.month_label),
    '<b>So du cuoi ky:</b> <b>' + escapeHtml(fm(summary.balance)) + '</b>',
    '<b>Nguong canh bao:</b> ' + escapeHtml(fm(threshold)),
    '',
    'Dau ky: ' + escapeHtml(fm(summary.opening)),
    'Nap trong ky: ' + escapeHtml(fm(summary.deposit)),
    'Tien chay: ' + escapeHtml(fm(summary.spend)),
    'Phi thue ' + escapeHtml(summary.rental_pct_label) + ': ' + escapeHtml(fm(summary.rental_fee)),
    '',
    'Can nap them toi thieu: <b>' + escapeHtml(fm(Math.max(0, threshold - summary.balance))) + '</b> de vuot nguong ' + escapeHtml(shortMoney(threshold)) + '.'
  ];
  return lines.join('\n');
}

async function readAlertState(sb, key) {
  const r = await sb.from('telegram_alert_state').select('*').eq('key', key).maybeSingle();
  if (r.error && r.error.code !== 'PGRST116') throw r.error;
  return r.data || null;
}

async function writeAlertState(sb, key, status, payload) {
  const r = await sb.from('telegram_alert_state').upsert({
    key,
    status,
    payload: payload || {},
    last_checked_at: new Date().toISOString(),
    last_notified_at: status === 'alerting' ? new Date().toISOString() : null,
    updated_at: new Date().toISOString()
  }, { onConflict: 'key' });
  if (r.error) throw r.error;
}

async function notifyRentalBalanceTelegram(sb, options) {
  const cfg = getTelegramConfig();
  const threshold = Number(process.env.POLICY_ALERT_RENTAL_BALANCE_THRESHOLD || DEFAULT_RENTAL_BALANCE_THRESHOLD);
  const today = String((options && options.date) || new Date().toISOString().substring(0, 10));
  const currentMonth = monthKey(today);
  const result = { enabled: false, threshold, checked: 0, alerting: 0, sent: 0, errors: [] };
  if (!cfg.token || !cfg.chatIds.length || threshold <= 0) return result;
  result.enabled = true;

  const clientsRes = await sb.from('client').select('id,name,status,services,rental_fee_pct,start_date');
  if (clientsRes.error) throw clientsRes.error;
  const clients = (clientsRes.data || []).filter(c => isTargetClient(c, cfg) && hasRentalService(c));
  result.checked = clients.length;
  if (!clients.length) return result;

  const minStart = clients.reduce((min, c) => {
    const s = c.start_date || currentMonth + '-01';
    return !min || s < min ? s : min;
  }, '');
  const [accountsRes, assignmentsRes, spendRes, depositsRes] = await Promise.all([
    sb.from('ad_account').select('id,client_id,account_name,fb_account_id'),
    sb.from('assignment').select('ad_account_id,client_id,staff_id,start_date,end_date'),
    sb.from('daily_spend').select('ad_account_id,report_date,spend_amount,matched_client_id').gte('report_date', minStart).lte('report_date', today),
    sb.from('client_deposit').select('client_id,deposit_date,amount').gte('deposit_date', minStart).lte('deposit_date', today)
  ]);
  if (accountsRes.error) throw accountsRes.error;
  if (assignmentsRes.error) throw assignmentsRes.error;
  if (spendRes.error) throw spendRes.error;
  if (depositsRes.error) throw depositsRes.error;

  const accountsById = new Map((accountsRes.data || []).map(a => [a.id, a]));
  const assignmentsByAccount = new Map();
  (assignmentsRes.data || []).forEach(a => {
    if (!assignmentsByAccount.has(a.ad_account_id)) assignmentsByAccount.set(a.ad_account_id, []);
    assignmentsByAccount.get(a.ad_account_id).push(a);
  });
  const spendByClientMonth = new Map();
  (spendRes.data || []).forEach(row => {
    const account = accountsById.get(row.ad_account_id);
    const cid = resolveSpendClientId(row, account, assignmentsByAccount);
    if (!cid) return;
    const key = cid + '|' + monthKey(row.report_date);
    spendByClientMonth.set(key, (spendByClientMonth.get(key) || 0) + (Number(row.spend_amount) || 0));
  });
  const depositByClientMonth = new Map();
  (depositsRes.data || []).forEach(row => {
    const key = row.client_id + '|' + monthKey(row.deposit_date);
    depositByClientMonth.set(key, (depositByClientMonth.get(key) || 0) + (Number(row.amount) || 0));
  });

  for (const client of clients) {
    const startMonth = monthKey(client.start_date || currentMonth + '-01');
    let iter = startMonth;
    let opening = 0;
    let guard = 0;
    let current = { deposit: 0, spend: 0, rental_fee: 0, balance: 0 };
    while (iter <= currentMonth && guard++ < 240) {
      const dep = depositByClientMonth.get(client.id + '|' + iter) || 0;
      const spend = spendByClientMonth.get(client.id + '|' + iter) || 0;
      const fee = getRentalFeeAmount(client, spend);
      if (iter === currentMonth) {
        current = {
          deposit: dep,
          spend,
          rental_fee: fee,
          balance: opening + dep - spend - fee
        };
      } else {
        opening = opening + dep - spend - fee;
      }
      iter = nextMonthKey(iter);
    }

    const stateKey = 'rental_balance:' + client.id;
    const previous = await readAlertState(sb, stateKey);
    const isLow = current.balance < threshold;
    if (!isLow) {
      if (!previous || previous.status !== 'ok') {
        await writeAlertState(sb, stateKey, 'ok', { balance: current.balance, threshold });
      }
      continue;
    }

    result.alerting += 1;
    if (previous && previous.status === 'alerting') continue;

    const monthParts = currentMonth.split('-');
    const summary = {
      client_name: client.name,
      month_label: 'T' + Number(monthParts[1]) + '/' + monthParts[0],
      opening,
      deposit: current.deposit,
      spend: current.spend,
      rental_fee: current.rental_fee,
      rental_pct_label: getRentalFeePct(client) ? (Math.round(getRentalFeePct(client) * 1000) / 10) + '%' : '?%',
      balance: current.balance
    };
    const text = buildRentalBalanceMessage(summary, threshold);
    let sent = false;
    for (const chatId of cfg.chatIds) {
      try {
        await sendTelegramMessage(cfg.token, chatId, text);
        result.sent += 1;
        sent = true;
      } catch (e) {
        if (result.errors.length < 10) result.errors.push({ chat_id: chatId, message: e.message || String(e) });
      }
    }
    if (sent) {
      await writeAlertState(sb, stateKey, 'alerting', Object.assign({}, summary, { threshold }));
    }
  }
  return result;
}

module.exports = {
  notifyPolicyAlertTelegram,
  notifyRentalBalanceTelegram
};
