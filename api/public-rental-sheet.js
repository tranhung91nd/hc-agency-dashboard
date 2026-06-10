const { createDbClient } = require('./_lib/db');

function monthKey(value) {
  const raw = String(value || '').trim();
  if (/^\d{4}-\d{2}$/.test(raw)) return raw;
  return new Date().toISOString().substring(0, 7);
}

function metaNum(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function fmtDate(value) {
  const parts = String(value || '').split('-');
  if (parts.length !== 3) return value || '';
  return parts[2] + '/' + parts[1] + '/' + parts[0];
}

function csvEscape(value) {
  const s = value === null || value === undefined ? '' : String(value);
  return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

function toCsv(rows) {
  return rows.map(row => row.map(csvEscape).join(',')).join('\n') + '\n';
}

function getRentalFeePct(client) {
  const v = Number(client && client.rental_fee_pct);
  return v > 0 && v < 1 ? v : 0;
}

function buildAssignIndex(assignments) {
  const byAcc = {};
  (assignments || []).forEach(row => {
    if (!row || !row.ad_account_id) return;
    if (!byAcc[row.ad_account_id]) byAcc[row.ad_account_id] = [];
    byAcc[row.ad_account_id].push(row);
  });
  Object.keys(byAcc).forEach(key => {
    byAcc[key].sort((a, b) => String(b.start_date || '').localeCompare(String(a.start_date || '')));
  });
  return byAcc;
}

function getAssign(assignByAcc, adId, date) {
  const rows = assignByAcc[adId] || [];
  const active = rows.filter(row => row.start_date <= date && (!row.end_date || row.end_date >= date));
  if (active.length) return active;
  const past = rows.filter(row => row.start_date <= date);
  return past.length ? [past[0]] : [];
}

function getClientForAdDate(assignByAcc, adAccountsById, adId, date) {
  const asg = getAssign(assignByAcc, adId, date);
  if (asg.length) return asg[0].client_id || null;
  const hasAnyAssign = !!(assignByAcc[adId] && assignByAcc[adId].length);
  if (hasAnyAssign) return null;
  const ad = adAccountsById.get(adId);
  return (ad && ad.client_id) || null;
}

function getMonthSpend(data, month, opts) {
  const client = data.client || {};
  const clientId = client.id;
  const startDate = opts && opts.respectStartDate ? client.start_date : null;
  const assignByAcc = data.assignByAcc;
  const adAccountsById = data.adAccountsById;
  let total = 0;
  (data.daily_spend || []).forEach(row => {
    const reportDate = row && row.report_date;
    if (!reportDate || reportDate.substring(0, 7) !== month) return;
    if (startDate && reportDate < startDate) return;
    const rowClientId = row.matched_client_id || getClientForAdDate(assignByAcc, adAccountsById, row.ad_account_id, reportDate);
    if (rowClientId === clientId) total += metaNum(row.spend_amount);
  });
  return total;
}

function nextMonthKey(month) {
  const parts = String(month || '').split('-');
  let y = Number(parts[0]);
  let m = Number(parts[1]) + 1;
  if (m > 12) {
    y += 1;
    m = 1;
  }
  return y + '-' + String(m).padStart(2, '0');
}

function getDepositTotal(data, month) {
  return (data.deposits || [])
    .filter(row => String(row.deposit_date || '').substring(0, 7) === month)
    .reduce((sum, row) => sum + metaNum(row.amount), 0);
}

function getOpeningBalance(data, month) {
  const client = data.client || {};
  if (!client.start_date) return 0;
  const startMonth = client.start_date.substring(0, 7);
  if (month <= startMonth) return 0;
  let balance = 0;
  let iter = startMonth;
  let guard = 0;
  const pct = getRentalFeePct(client);
  while (iter < month && guard++ < 240) {
    const spend = getMonthSpend(data, iter, { respectStartDate: true });
    const fee = Math.round(spend * pct / 1000) * 1000;
    balance += getDepositTotal(data, iter) - spend - fee;
    iter = nextMonthKey(iter);
  }
  return balance;
}

function buildMatrix(data, month) {
  const client = data.client || {};
  const clientId = client.id;
  const year = Number(month.split('-')[0]);
  const mo = Number(month.split('-')[1]);
  const daysInMonth = new Date(year, mo, 0).getDate();
  const firstDay = month + '-01';
  const lastDay = month + '-' + String(daysInMonth).padStart(2, '0');
  const startDate = client.start_date || null;
  const accMap = new Map();
  const adAccountsById = data.adAccountsById;

  (data.assignments || []).forEach(row => {
    if (row.client_id !== clientId) return;
    if (row.start_date && row.start_date > lastDay) return;
    if (row.end_date && row.end_date < firstDay) return;
    const ad = adAccountsById.get(row.ad_account_id);
    if (!ad || accMap.has(row.ad_account_id)) return;
    accMap.set(row.ad_account_id, {
      id: row.ad_account_id,
      name: ad.account_name || ad.fb_account_id || row.ad_account_id,
      fb_account_id: ad.fb_account_id || '',
      daily: new Array(daysInMonth).fill(0)
    });
  });

  (data.ad_accounts || []).forEach(ad => {
    if (!ad || ad.client_id !== clientId || accMap.has(ad.id)) return;
    const hasAnyAssign = !!(data.assignByAcc[ad.id] && data.assignByAcc[ad.id].length);
    if (hasAnyAssign) return;
    accMap.set(ad.id, {
      id: ad.id,
      name: ad.account_name || ad.fb_account_id || ad.id,
      fb_account_id: ad.fb_account_id || '',
      daily: new Array(daysInMonth).fill(0)
    });
  });

  (data.daily_spend || []).forEach(row => {
    const reportDate = row && row.report_date;
    if (!reportDate || reportDate.substring(0, 7) !== month) return;
    if (startDate && reportDate < startDate) return;
    const rowClientId = row.matched_client_id || getClientForAdDate(data.assignByAcc, adAccountsById, row.ad_account_id, reportDate);
    if (rowClientId !== clientId) return;
    const spend = metaNum(row.spend_amount);
    if (!accMap.has(row.ad_account_id)) {
      if (spend <= 0) return;
      const ad = adAccountsById.get(row.ad_account_id) || {};
      accMap.set(row.ad_account_id, {
        id: row.ad_account_id,
        name: ad.account_name || ad.fb_account_id || ('TKQC #' + String(row.ad_account_id || '').substring(0, 6)),
        fb_account_id: ad.fb_account_id || '',
        daily: new Array(daysInMonth).fill(0)
      });
    }
    const day = Number(reportDate.substring(8, 10)) - 1;
    if (day >= 0 && day < daysInMonth) accMap.get(row.ad_account_id).daily[day] += spend;
  });

  const accounts = Array.from(accMap.values()).sort((a, b) => {
    const sa = a.daily.reduce((sum, v) => sum + v, 0);
    const sb = b.daily.reduce((sum, v) => sum + v, 0);
    return sb - sa || String(a.name || '').localeCompare(String(b.name || ''));
  });
  const dayTotals = new Array(daysInMonth).fill(0);
  let grandTotal = 0;
  accounts.forEach(account => {
    account.total = account.daily.reduce((sum, v, i) => {
      dayTotals[i] += v;
      return sum + v;
    }, 0);
    grandTotal += account.total;
  });
  return { accounts, dayTotals, grandTotal, daysInMonth };
}

function buildRows(payload, month, view) {
  const data = Object.assign({}, payload || {});
  data.ad_accounts = data.ad_accounts || [];
  data.assignments = data.assignments || [];
  data.daily_spend = data.daily_spend || [];
  data.deposits = data.deposits || [];
  data.assignByAcc = buildAssignIndex(data.assignments);
  data.adAccountsById = new Map(data.ad_accounts.map(row => [row.id, row]));

  const client = data.client || {};
  const matrix = buildMatrix(data, month);
  const pct = getRentalFeePct(client);
  const opening = getOpeningBalance(data, month);
  const deposit = getDepositTotal(data, month);
  const spend = matrix.grandTotal;
  const rentalFee = Math.round(spend * pct / 1000) * 1000;
  const balance = opening + deposit - spend - rentalFee;

  const summaryRows = [
      ['Chỉ số', 'Giá trị'],
      ['Khách hàng', client.name || ''],
      ['Kỳ', month],
      ['Số tài khoản', matrix.accounts.length],
      ['Phí thuê', pct ? (Math.round(pct * 1000) / 10) + '%' : ''],
      ['Số dư đầu kỳ', opening],
      ['Tiền nạp', deposit],
      ['Tiền chạy', spend],
      ['Phí thuê TKQC', rentalFee],
      ['Số dư cuối kỳ', balance],
      ['Cập nhật lúc', payload.fetched_at || new Date().toISOString()]
    ];

  const accountRows = [['TKQC', 'Facebook account ID', 'Tổng chi tiêu']];
  matrix.accounts.forEach(account => accountRows.push([account.name, account.fb_account_id, account.total || 0]));
  accountRows.push(['Tổng cộng', '', matrix.grandTotal]);

  const depositRows = [['Ngày nạp', 'Số tiền', 'Ghi chú']];
  data.deposits
    .filter(row => String(row.deposit_date || '').substring(0, 7) === month)
    .sort((a, b) => String(a.deposit_date || '').localeCompare(String(b.deposit_date || '')))
    .forEach(row => depositRows.push([fmtDate(row.deposit_date), metaNum(row.amount), row.note || '']));

  const matrixRows = [['TKQC']];
  for (let day = 1; day <= matrix.daysInMonth; day++) matrixRows[0].push(String(day));
  matrixRows[0].push('Tổng tháng');
  matrix.accounts.forEach(account => matrixRows.push([account.name, ...account.daily, account.total || 0]));
  matrixRows.push(['Tổng cộng', ...matrix.dayTotals, matrix.grandTotal]);

  if (view === 'summary') {
    return summaryRows;
  }

  if (view === 'deposits') {
    return depositRows;
  }

  if (view === 'accounts') {
    return accountRows;
  }

  if (view === 'month') {
    return [
      ['TỔNG QUAN ' + month],
      ...summaryRows,
      [],
      ['CHI TIÊU THEO TKQC x NGÀY'],
      ...matrixRows,
      [],
      ['CHI TIÊU THEO TÀI KHOẢN'],
      ...accountRows,
      [],
      ['LỊCH SỬ NẠP TIỀN'],
      ...depositRows
    ];
  }

  return matrixRows;
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const clientId = String(req.query.client_id || req.query.ledger || '').trim();
  const token = String(req.query.token || '').trim();
  const month = monthKey(req.query.month);
  const view = ['summary', 'matrix', 'deposits', 'accounts', 'month'].includes(req.query.view) ? req.query.view : 'matrix';
  const format = String(req.query.format || 'csv').toLowerCase();

  if (!clientId || !token) return res.status(400).json({ error: 'Missing client_id or token' });

  const sb = createDbClient();
  const r = await sb.rpc('get_public_rental_ledger', { p_client_id: clientId, p_token: token });
  if (r.error) return res.status(403).json({ error: r.error.message || String(r.error) });
  if (!r.data || !r.data.client) return res.status(404).json({ error: 'Client not found' });

  const rows = buildRows(r.data, month, view);
  if (format === 'json') return res.status(200).json({ ok: true, client_id: clientId, month, view, rows });

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'inline; filename="rental-' + clientId + '-' + month + '-' + view + '.csv"');
  return res.status(200).send('\ufeff' + toCsv(rows));
};
