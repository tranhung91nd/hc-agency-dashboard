const crypto = require('crypto');
const { createDbClient } = require('./db');

const PRODUCT = 'omni-ai-marketing';
const PRODUCT_NAME = 'OMNI AI MARKETING';
const DEFAULT_APP_ID = 'hc-zalo-agent';
const DEFAULT_PRICE = 1000000;
const DEFAULT_BANK = {
  bank: 'Techcombank',
  accountNo: '9188899999',
  accountNoDisplay: '9188 8999 99',
  accountName: 'TRAN TRUC HUNG',
};

function env(name, fallback) {
  const value = process.env[name];
  return value === undefined || value === '' ? fallback : value;
}

function sendJson(res, code, body) {
  res.status(code).setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.send(JSON.stringify(body));
}

function setCors(req, res, methods) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', methods || 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Admin-Token, X-SePay-Signature, X-SePay-Timestamp');
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return true;
  }
  return false;
}

function db() {
  return createDbClient();
}

function cleanPhone(value) {
  return String(value || '').replace(/\D/g, '');
}

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function validateLead(body) {
  const name = String(body.name || '').trim();
  const phone = String(body.phone || '').trim();
  const phoneClean = cleanPhone(phone);
  const email = normalizeEmail(body.email);
  if (!name) throw new Error('name_required');
  if (!/^0\d{9}$/.test(phoneClean)) throw new Error('phone_invalid');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('email_invalid');
  return {
    name,
    phone,
    phoneClean,
    email,
    source: String(body.source || 'landing-omni-ai').trim() || 'landing-omni-ai',
  };
}

function esc(value) {
  return String(value || '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[c]));
}

function formatMoney(value) {
  return new Intl.NumberFormat('vi-VN').format(Number(value || 0)) + 'đ';
}

function formatDate(value) {
  if (!value) return 'không giới hạn';
  return new Date(value).toLocaleDateString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });
}

function nowIso() {
  return new Date().toISOString();
}

function isFuture(value) {
  return value && new Date(value).getTime() > Date.now();
}

function randomSuffix(size) {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let out = '';
  for (let i = 0; i < size; i++) out += alphabet[crypto.randomInt(alphabet.length)];
  return out;
}

function paymentCodeFromOrderCode(orderCode) {
  return String(orderCode || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function orderCodeFromPaymentCode(paymentCode) {
  const code = paymentCodeFromOrderCode(paymentCode);
  if (!code.startsWith('OMNI') || code.length <= 4) return '';
  return 'OMNI-' + code.slice(4);
}

function extractPaymentCode(value) {
  const raw = String(value || '').toUpperCase();
  const match = raw.match(/OMNI[-\s]?([A-Z0-9]{6,12})/);
  if (!match) return null;
  const paymentCode = 'OMNI' + match[1];
  return { paymentCode, orderCode: orderCodeFromPaymentCode(paymentCode) };
}

async function makeOrderCodes(sb) {
  for (let i = 0; i < 20; i++) {
    const orderCode = 'OMNI-' + randomSuffix(6);
    const paymentCode = paymentCodeFromOrderCode(orderCode);
    const { data, error } = await sb
      .from('omni_license_orders')
      .select('id')
      .or('order_code.eq.' + orderCode + ',payment_code.eq.' + paymentCode)
      .maybeSingle();
    if (error) throw new Error('Local DB check order code: ' + error.message);
    if (!data) return { orderCode, paymentCode };
  }
  throw new Error('Không tạo được mã đơn duy nhất');
}

async function findOrderByLead(sb, lead) {
  const phoneResult = await sb
    .from('omni_license_orders')
    .select('*')
    .eq('product', PRODUCT)
    .eq('phone_clean', lead.phoneClean)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (phoneResult.error) throw new Error('Local DB select order by phone: ' + phoneResult.error.message);
  if (phoneResult.data) return phoneResult.data;

  const emailResult = await sb
    .from('omni_license_orders')
    .select('*')
    .eq('product', PRODUCT)
    .eq('email', lead.email)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (emailResult.error) throw new Error('Local DB select order by email: ' + emailResult.error.message);
  return emailResult.data || null;
}

async function getOrderByCode(sb, rawCode) {
  const extracted = extractPaymentCode(rawCode) || {
    paymentCode: paymentCodeFromOrderCode(rawCode),
    orderCode: String(rawCode || '').trim().toUpperCase(),
  };
  const { data, error } = await sb
    .from('omni_license_orders')
    .select('*')
    .eq('product', PRODUCT)
    .or('order_code.eq.' + extracted.orderCode + ',payment_code.eq.' + extracted.paymentCode)
    .maybeSingle();
  if (error) throw new Error('Local DB select order: ' + error.message);
  return data || null;
}

async function updateOrder(sb, id, patch) {
  const { data, error } = await sb
    .from('omni_license_orders')
    .update(Object.assign({}, patch, { updated_at: nowIso() }))
    .eq('id', id)
    .select('*')
    .single();
  if (error) throw new Error('Local DB update order: ' + error.message);
  return data;
}

function licenseApiBase() {
  return String(env('OMNI_LICENSE_API_BASE', 'https://ai.hc-agency.online/license-api')).replace(/\/+$/, '');
}

async function createLicense(input) {
  const token = env('OMNI_LICENSE_ADMIN_TOKEN', env('LICENSE_ADMIN_TOKEN', ''));
  if (!token) throw new Error('Thiếu OMNI_LICENSE_ADMIN_TOKEN hoặc LICENSE_ADMIN_TOKEN');
  const body = {
    customer: input.customer,
    plan: input.plan || 'standard',
    maxMachines: input.maxMachines || 1,
    appId: input.appId || env('OMNI_LICENSE_APP_ID', DEFAULT_APP_ID),
    durationValue: input.durationValue,
    durationUnit: input.durationUnit || 'days',
  };
  const resp = await fetch(licenseApiBase() + '/api/admin/licenses', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Admin-Token': token,
    },
    body: JSON.stringify(body),
  });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok || data.ok === false) throw new Error(data.error || ('License API HTTP ' + resp.status));
  if (!data.licenseKey) throw new Error('License API không trả licenseKey');
  return data;
}

async function loadDownloadLinks() {
  const url = env('OMNI_DOWNLOADS_URL', 'https://ai.hc-agency.online/api/downloads/latest');
  const resp = await fetch(url, { cache: 'no-store' });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok || data.ok === false) throw new Error(data.error || ('Download API HTTP ' + resp.status));
  return data.platforms || {};
}

function downloadUrl(downloads, platform) {
  return downloads && downloads[platform] && downloads[platform].url ? downloads[platform].url : '';
}

function paymentInfo(order) {
  const bank = {
    bank: env('OMNI_PAYMENT_BANK', DEFAULT_BANK.bank),
    accountNo: env('OMNI_PAYMENT_ACCOUNT_NO', DEFAULT_BANK.accountNo),
    accountNoDisplay: env('OMNI_PAYMENT_ACCOUNT_DISPLAY', DEFAULT_BANK.accountNoDisplay),
    accountName: env('OMNI_PAYMENT_ACCOUNT_NAME', DEFAULT_BANK.accountName),
  };
  return {
    bank,
    amount: Number(order.amount_due || DEFAULT_PRICE),
    content: order.payment_code || paymentCodeFromOrderCode(order.order_code),
  };
}

function buildEmail(kind, order) {
  const appUrl = env('OMNI_APP_URL', 'https://ai.hc-agency.online/chat.html');
  const downloads = order.download_links || {};
  const windowsUrl = downloadUrl(downloads, 'windows');
  const macUrl = downloadUrl(downloads, 'mac');
  const pay = paymentInfo(order);
  const subjectMap = {
    trial: PRODUCT_NAME + ' - License dùng thử 3 ngày của bạn',
    reminder: PRODUCT_NAME + ' - License dùng thử còn gần 24 giờ',
    renewal: PRODUCT_NAME + ' - Gia hạn 1 năm',
    paid: PRODUCT_NAME + ' - License 1 năm của bạn',
  };
  const subject = subjectMap[kind] || subjectMap.trial;
  const headline = kind === 'paid'
    ? 'License 1 năm đã sẵn sàng'
    : kind === 'reminder'
      ? 'License dùng thử của bạn sắp hết hạn'
      : kind === 'renewal'
        ? 'Gia hạn OMNI AI MARKETING 1 năm'
        : 'License dùng thử 3 ngày của bạn';
  const licenseKey = kind === 'paid' ? order.paid_license_key : order.trial_license_key;
  const expiresAt = kind === 'paid' ? order.paid_license_expires_at : order.trial_license_expires_at;
  const showPayment = kind !== 'paid';
  const linkRows = [
    windowsUrl ? '<li><a href="' + esc(windowsUrl) + '">Tải bản Windows</a></li>' : '',
    macUrl ? '<li><a href="' + esc(macUrl) + '">Tải bản Mac OS</a></li>' : '',
    '<li><a href="' + esc(appUrl) + '">Mở OMNI AI MARKETING</a></li>',
  ].filter(Boolean).join('');
  const html = [
    '<div style="font-family:Arial,sans-serif;line-height:1.6;color:#111827;max-width:640px">',
    '<h2 style="margin:0 0 12px;color:#e84a1c">' + esc(headline) + '</h2>',
    '<p>Chào ' + esc(order.name) + ',</p>',
    '<p>Thông tin kích hoạt ' + PRODUCT_NAME + ' của bạn:</p>',
    '<div style="background:#fff7ed;border:1px solid #fed7aa;border-radius:10px;padding:16px;margin:16px 0">',
    '<div style="font-size:13px;color:#6b7280">License key</div>',
    '<div style="font-size:24px;font-weight:800;letter-spacing:.5px;word-break:break-all">' + esc(licenseKey || 'Đang chờ cấp') + '</div>',
    '<div style="margin-top:8px;color:#374151">Hạn dùng: <b>' + esc(formatDate(expiresAt)) + '</b></div>',
    '<div>Mã đơn: <b>' + esc(order.order_code) + '</b></div>',
    '</div>',
    '<h3>Link tải và kích hoạt</h3>',
    '<ol>',
    linkRows,
    '<li>Mở phần mềm, nhập license key ở màn hình kích hoạt.</li>',
    '</ol>',
    showPayment ? [
      '<h3>Gia hạn 1 năm</h3>',
      '<p>Giá gia hạn: <b>' + esc(formatMoney(pay.amount)) + ' / 1 sản phẩm / 1 năm</b>.</p>',
      '<div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:10px;padding:14px">',
      '<div>Ngân hàng: <b>' + esc(pay.bank.bank) + '</b></div>',
      '<div>Số tài khoản: <b>' + esc(pay.bank.accountNoDisplay) + '</b></div>',
      '<div>Chủ tài khoản: <b>' + esc(pay.bank.accountName) + '</b></div>',
      '<div>Nội dung chuyển khoản: <b>' + esc(pay.content) + '</b></div>',
      '</div>',
      '<p style="color:#6b7280">Sau khi hệ thống nhận đúng nội dung chuyển khoản, license 1 năm sẽ được gửi tự động vào email này.</p>',
    ].join('') : '<p>Cảm ơn bạn đã gia hạn. Key 1 năm có hiệu lực theo hạn dùng ở trên.</p>',
    '<p>Cần hỗ trợ nhanh: gọi/Zalo <b>0968.91.5555</b>.</p>',
    '</div>',
  ].join('');
  const text = [
    headline,
    'Khach hang: ' + order.name,
    'License key: ' + (licenseKey || 'Dang cho cap'),
    'Han dung: ' + formatDate(expiresAt),
    'Ma don: ' + order.order_code,
    windowsUrl ? 'Windows: ' + windowsUrl : '',
    macUrl ? 'Mac OS: ' + macUrl : '',
    'App: ' + appUrl,
    showPayment ? 'Gia han: ' + formatMoney(pay.amount) + ' - CK ' + pay.bank.bank + ' ' + pay.bank.accountNoDisplay + ' - ' + pay.bank.accountName + ' - Noi dung: ' + pay.content : '',
  ].filter(Boolean).join('\n');
  return { subject, html, text };
}

async function sendResendEmail(email) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) throw new Error('RESEND_API_KEY chưa cấu hình');
  const from = env('MAIL_FROM', 'HC Agency <no-reply@hc-agency.online>');
  const body = {
    from,
    to: email.to,
    subject: email.subject,
    html: email.html,
    text: email.text,
  };
  const replyTo = env('MAIL_REPLY_TO', '');
  if (replyTo) body.reply_to = replyTo;
  const resp = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + apiKey },
    body: JSON.stringify(body),
  });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) throw new Error(data.message || data.error || ('Resend HTTP ' + resp.status));
  return data;
}

function retryAt(attempt) {
  const minutes = [5, 15, 60, 360, 720][Math.min(Math.max(attempt - 1, 0), 4)];
  return new Date(Date.now() + minutes * 60 * 1000).toISOString();
}

async function logDelivery(sb, row) {
  const payload = Object.assign({
    channel: 'email',
    status: 'queued',
    attempt_count: 0,
    created_at: nowIso(),
    updated_at: nowIso(),
  }, row);
  const { error } = await sb.from('omni_delivery_log').insert(payload);
  if (error) console.error('[omni delivery log]', error.message);
}

async function sendOrderEmail(sb, order, kind) {
  const email = buildEmail(kind, order);
  try {
    const result = await sendResendEmail(Object.assign({ to: order.email }, email));
    await logDelivery(sb, {
      order_id: order.id,
      channel: 'email',
      kind,
      recipient: order.email,
      subject: email.subject,
      body_preview: email.text.slice(0, 500),
      status: 'sent',
      provider_id: result.id || null,
      sent_at: nowIso(),
      attempt_count: 1,
    });
    const patch = { last_error: null };
    if (kind === 'trial') patch.last_trial_email_sent_at = nowIso();
    if (kind === 'reminder') patch.reminder_24h_sent_at = nowIso();
    if (kind === 'renewal') patch.renewal_email_sent_at = nowIso();
    if (kind === 'paid') patch.paid_email_sent_at = nowIso();
    await updateOrder(sb, order.id, patch);
    return { sent: true };
  } catch (e) {
    await logDelivery(sb, {
      order_id: order.id,
      channel: 'email',
      kind,
      recipient: order.email,
      subject: email.subject,
      body_preview: email.text.slice(0, 500),
      status: 'failed',
      error: e.message,
      attempt_count: 1,
      next_retry_at: retryAt(1),
    });
    await updateOrder(sb, order.id, { last_error: e.message });
    return { sent: false, error: e.message };
  }
}

async function retryDeliveryLog(sb, log) {
  const { data: order, error } = await sb
    .from('omni_license_orders')
    .select('*')
    .eq('id', log.order_id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!order) {
    await sb.from('omni_delivery_log').update({ status: 'skipped', error: 'order_not_found', updated_at: nowIso() }).eq('id', log.id);
    return { skipped: true };
  }
  const attempt = Number(log.attempt_count || 0) + 1;
  const email = buildEmail(log.kind, order);
  try {
    const result = await sendResendEmail(Object.assign({ to: order.email }, email));
    await sb.from('omni_delivery_log').update({
      status: 'sent',
      provider_id: result.id || null,
      error: null,
      attempt_count: attempt,
      sent_at: nowIso(),
      updated_at: nowIso(),
    }).eq('id', log.id);
    return { sent: true };
  } catch (e) {
    await sb.from('omni_delivery_log').update({
      error: e.message,
      attempt_count: attempt,
      next_retry_at: retryAt(attempt),
      updated_at: nowIso(),
    }).eq('id', log.id);
    return { sent: false, error: e.message };
  }
}

async function syncPublicLead(sb, lead) {
  try {
    const { error } = await sb.rpc('submit_public_lead', {
      p_data: {
        name: lead.name,
        phone: lead.phone,
        email: lead.email,
        services: ['zalo_marketing'],
        message: 'Đăng ký dùng thử ' + PRODUCT_NAME + ' 3 ngày',
        source: lead.source,
      },
    });
    if (error) console.warn('[omni lead sync]', error.message);
  } catch (e) {
    console.warn('[omni lead sync]', e.message || e);
  }
}

function zaloFollowup(order) {
  const pay = paymentInfo(order);
  return [
    'Chào ' + order.name + ', HC Agency gửi bạn license dùng thử ' + PRODUCT_NAME + ' 3 ngày:',
    order.trial_license_key,
    'Link tải đã gửi qua email ' + order.email + '.',
    'Nếu muốn gia hạn 1 năm: CK ' + formatMoney(pay.amount) + ' với nội dung ' + pay.content + '.',
  ].join('\n');
}

async function createTrial(body) {
  const lead = validateLead(body || {});
  const sb = db();
  const existing = await findOrderByLead(sb, lead);
  if (existing) {
    let kind = 'renewal';
    if (existing.paid_license_key && existing.status === 'paid_active') kind = 'paid';
    else if (existing.trial_license_key && isFuture(existing.trial_license_expires_at)) kind = 'trial';
    else await updateOrder(sb, existing.id, { status: 'trial_expired', trial_expired_at: existing.trial_expired_at || nowIso() });
    const delivery = await sendOrderEmail(sb, existing, kind);
    return { ok: true, duplicate: true, status: existing.status, order_code: existing.order_code, payment_code: existing.payment_code, delivery };
  }

  const { orderCode, paymentCode } = await makeOrderCodes(sb);
  const downloadLinks = await loadDownloadLinks().catch((e) => {
    console.warn('[omni downloads]', e.message);
    return {};
  });
  const insert = {
    product: PRODUCT,
    order_code: orderCode,
    payment_code: paymentCode,
    source: lead.source,
    name: lead.name,
    phone: lead.phone,
    phone_clean: lead.phoneClean,
    email: lead.email,
    status: 'trial_pending',
    amount_due: DEFAULT_PRICE,
    currency: 'VND',
    payment_bank: env('OMNI_PAYMENT_BANK', DEFAULT_BANK.bank),
    payment_account_no: env('OMNI_PAYMENT_ACCOUNT_NO', DEFAULT_BANK.accountNo),
    payment_account_name: env('OMNI_PAYMENT_ACCOUNT_NAME', DEFAULT_BANK.accountName),
    license_app_id: env('OMNI_LICENSE_APP_ID', DEFAULT_APP_ID),
    max_machines: 1,
    download_links: downloadLinks,
    zalo_followup_url: 'https://zalo.me/' + lead.phoneClean,
    created_at: nowIso(),
    updated_at: nowIso(),
  };
  const created = await sb.from('omni_license_orders').insert(insert).select('*').single();
  if (created.error) throw new Error('Local DB insert order: ' + created.error.message);
  let order = created.data;
  await syncPublicLead(sb, lead);

  try {
    const license = await createLicense({
      customer: lead.name + ' - ' + lead.phoneClean,
      plan: 'trial',
      maxMachines: 1,
      appId: order.license_app_id,
      durationValue: 3,
      durationUnit: 'days',
    });
    order = await updateOrder(sb, order.id, {
      status: 'trial_active',
      trial_license_key: license.licenseKey,
      trial_license_expires_at: license.license && license.license.expiresAt ? license.license.expiresAt : new Date(Date.now() + 3 * 86400000).toISOString(),
      metadata: Object.assign({}, order.metadata || {}, { trial_license_response: license.license || null }),
    });
  } catch (e) {
    await updateOrder(sb, order.id, { status: 'failed', last_error: e.message });
    throw e;
  }

  await logDelivery(sb, {
    order_id: order.id,
    channel: 'zalo',
    kind: 'followup',
    recipient: order.phone_clean,
    subject: 'Zalo follow-up ' + order.order_code,
    body_preview: zaloFollowup(order).slice(0, 500),
    status: 'queued',
    metadata: { zalo_url: order.zalo_followup_url },
  });
  const delivery = await sendOrderEmail(sb, order, 'trial');
  return { ok: true, duplicate: false, status: order.status, order_code: order.order_code, payment_code: order.payment_code, delivery };
}

async function readRawBody(req) {
  if (typeof req.rawBody === 'string') return req.rawBody;
  if (Buffer.isBuffer(req.body)) return req.body.toString('utf8');
  if (typeof req.body === 'string') return req.body;
  if (req.body && typeof req.body === 'object') return JSON.stringify(req.body);
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function safeEqualString(a, b) {
  const left = Buffer.from(String(a || ''));
  const right = Buffer.from(String(b || ''));
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

function verifySepay(req, rawBody) {
  const secret = process.env.SEPAY_WEBHOOK_SECRET;
  const apiKey = process.env.SEPAY_API_KEY;
  if (secret) {
    const signature = String(req.headers['x-sepay-signature'] || '');
    const timestamp = String(req.headers['x-sepay-timestamp'] || '');
    if (!signature || !timestamp) return { ok: false, status: 'missing_hmac', error: 'missing_hmac_headers' };
    const ts = Number(timestamp);
    const tolerance = Number(env('SEPAY_SIGNATURE_TOLERANCE_SEC', '900'));
    if (!Number.isFinite(ts) || Math.abs(Date.now() / 1000 - ts) > tolerance) {
      return { ok: false, status: 'stale_hmac', error: 'stale_hmac_timestamp' };
    }
    const digest = crypto.createHmac('sha256', secret).update(timestamp + '.' + rawBody).digest('hex');
    const expected = 'sha256=' + digest;
    const normalized = signature.startsWith('sha256=') ? signature : 'sha256=' + signature;
    if (!safeEqualString(normalized, expected)) return { ok: false, status: 'bad_hmac', error: 'bad_hmac_signature' };
    return { ok: true, status: 'hmac_ok' };
  }
  if (apiKey) {
    const auth = String(req.headers.authorization || '');
    if (!auth.toLowerCase().startsWith('apikey ') || !safeEqualString(auth.slice(7).trim(), apiKey)) {
      return { ok: false, status: 'bad_api_key', error: 'bad_api_key' };
    }
    return { ok: true, status: 'api_key_ok' };
  }
  return { ok: true, status: 'unchecked' };
}

function eventIdFromPayload(payload, rawBody) {
  return String(payload.id || payload.referenceCode || payload.reference_code || crypto.createHash('sha256').update(rawBody).digest('hex')).slice(0, 160);
}

function numberAmount(payload) {
  const value = payload.transferAmount ?? payload.amount ?? payload.transaction_amount;
  const n = Number(value);
  return Number.isFinite(n) ? Math.round(n) : 0;
}

function transferType(payload) {
  return String(payload.transferType || payload.transfer_type || '').toLowerCase();
}

async function upsertPaymentEvent(sb, payload, rawBody, signatureStatus) {
  const providerEventId = eventIdFromPayload(payload, rawBody);
  const { data: existing, error: existingErr } = await sb
    .from('omni_payment_events')
    .select('*')
    .eq('provider', 'sepay')
    .eq('provider_event_id', providerEventId)
    .maybeSingle();
  if (existingErr) throw new Error('Local DB select payment event: ' + existingErr.message);
  if (existing) return { event: existing, isNew: false };

  const amount = numberAmount(payload);
  const row = {
    provider: 'sepay',
    provider_event_id: providerEventId,
    reference_code: String(payload.referenceCode || payload.reference_code || ''),
    transfer_type: transferType(payload),
    amount,
    content: String(payload.content || ''),
    account_number: String(payload.accountNumber || payload.account_number || ''),
    gateway: String(payload.gateway || ''),
    transaction_date_text: String(payload.transactionDate || payload.transaction_date || ''),
    raw_payload: payload,
    signature_status: signatureStatus,
    processing_status: 'received',
    created_at: nowIso(),
    updated_at: nowIso(),
  };
  const { data, error } = await sb.from('omni_payment_events').insert(row).select('*').single();
  if (error) throw new Error('Local DB insert payment event: ' + error.message);
  return { event: data, isNew: true };
}

async function updatePaymentEvent(sb, id, patch) {
  const { error } = await sb
    .from('omni_payment_events')
    .update(Object.assign({}, patch, { updated_at: nowIso() }))
    .eq('id', id);
  if (error) throw new Error('Local DB update payment event: ' + error.message);
}

async function processPaymentWebhook(payload, rawBody, signatureStatus) {
  const sb = db();
  const { event } = await upsertPaymentEvent(sb, payload, rawBody, signatureStatus);
  if (!['received', 'license_failed', 'email_failed'].includes(event.processing_status)) {
    return { ok: true, duplicate: true, status: event.processing_status };
  }

  const tType = transferType(payload);
  if (tType && !['in', 'credit'].includes(tType)) {
    await updatePaymentEvent(sb, event.id, { processing_status: 'ignored', error: 'not_incoming_transfer' });
    return { ok: true, ignored: true };
  }

  const expectedAccount = cleanPhone(env('OMNI_PAYMENT_ACCOUNT_NO', DEFAULT_BANK.accountNo));
  const receivedAccount = cleanPhone(payload.accountNumber || payload.account_number || '');
  if (receivedAccount && expectedAccount && receivedAccount !== expectedAccount) {
    await updatePaymentEvent(sb, event.id, { processing_status: 'ignored', error: 'account_number_mismatch' });
    return { ok: true, ignored: true };
  }

  const code = extractPaymentCode(payload.code) || extractPaymentCode(payload.content) || extractPaymentCode(payload.description);
  if (!code) {
    await updatePaymentEvent(sb, event.id, { processing_status: 'unmatched', error: 'payment_code_not_found' });
    return { ok: true, unmatched: true };
  }

  const order = await getOrderByCode(sb, code.orderCode);
  if (!order) {
    await updatePaymentEvent(sb, event.id, { processing_status: 'unmatched', payment_code: code.paymentCode, order_code: code.orderCode, error: 'order_not_found' });
    return { ok: true, unmatched: true };
  }

  const amount = numberAmount(payload);
  if (amount < Number(order.amount_due || DEFAULT_PRICE)) {
    await updatePaymentEvent(sb, event.id, {
      processing_status: 'underpaid',
      order_id: order.id,
      payment_code: code.paymentCode,
      order_code: order.order_code,
      error: 'amount_under_expected',
    });
    await updateOrder(sb, order.id, { status: 'payment_pending', paid_amount: amount, last_payment_event_id: event.id });
    return { ok: true, underpaid: true };
  }

  if (order.paid_license_key && order.status === 'paid_active') {
    await updatePaymentEvent(sb, event.id, {
      processing_status: 'processed',
      order_id: order.id,
      payment_code: code.paymentCode,
      order_code: order.order_code,
      error: null,
    });
    return { ok: true, duplicate_paid: true };
  }

  let paidLicense;
  try {
    paidLicense = await createLicense({
      customer: order.name + ' - ' + order.phone_clean,
      plan: 'standard',
      maxMachines: order.max_machines || 1,
      appId: order.license_app_id || DEFAULT_APP_ID,
      durationValue: 365,
      durationUnit: 'days',
    });
  } catch (e) {
    await updatePaymentEvent(sb, event.id, {
      processing_status: 'license_failed',
      order_id: order.id,
      payment_code: code.paymentCode,
      order_code: order.order_code,
      error: e.message,
    });
    throw e;
  }

  const updatedOrder = await updateOrder(sb, order.id, {
    status: 'paid_active',
    paid_license_key: paidLicense.licenseKey,
    paid_license_expires_at: paidLicense.license && paidLicense.license.expiresAt ? paidLicense.license.expiresAt : new Date(Date.now() + 365 * 86400000).toISOString(),
    paid_amount: amount,
    paid_at: nowIso(),
    last_payment_event_id: event.id,
    last_error: null,
    metadata: Object.assign({}, order.metadata || {}, { paid_license_response: paidLicense.license || null }),
  });
  const delivery = await sendOrderEmail(sb, updatedOrder, 'paid');
  await updatePaymentEvent(sb, event.id, {
    processing_status: delivery.sent ? 'processed' : 'email_failed',
    order_id: updatedOrder.id,
    payment_code: code.paymentCode,
    order_code: updatedOrder.order_code,
    error: delivery.sent ? null : delivery.error,
  });
  return { ok: true, processed: true, delivery };
}

async function runCron() {
  const sb = db();
  const summary = { reminders: 0, expired: 0, retries: 0, errors: [] };
  const now = new Date();
  const soon = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

  const reminderResult = await sb
    .from('omni_license_orders')
    .select('*')
    .eq('product', PRODUCT)
    .eq('status', 'trial_active')
    .is('reminder_24h_sent_at', null)
    .gt('trial_license_expires_at', now.toISOString())
    .lte('trial_license_expires_at', soon)
    .limit(50);
  if (reminderResult.error) throw new Error('Local DB reminders: ' + reminderResult.error.message);
  for (const order of reminderResult.data || []) {
    const sent = await sendOrderEmail(sb, order, 'reminder');
    if (sent.sent) summary.reminders++;
    else summary.errors.push(order.order_code + ': ' + sent.error);
  }

  const expiredResult = await sb
    .from('omni_license_orders')
    .select('*')
    .eq('product', PRODUCT)
    .eq('status', 'trial_active')
    .lte('trial_license_expires_at', now.toISOString())
    .limit(100);
  if (expiredResult.error) throw new Error('Local DB expired: ' + expiredResult.error.message);
  for (const order of expiredResult.data || []) {
    const expiredOrder = await updateOrder(sb, order.id, { status: 'trial_expired', trial_expired_at: order.trial_expired_at || now.toISOString() });
    if (!expiredOrder.renewal_email_sent_at) await sendOrderEmail(sb, expiredOrder, 'renewal');
    summary.expired++;
  }

  const retryResult = await sb
    .from('omni_delivery_log')
    .select('*')
    .eq('channel', 'email')
    .eq('status', 'failed')
    .lt('attempt_count', 5)
    .lte('next_retry_at', now.toISOString())
    .limit(50);
  if (retryResult.error) throw new Error('Local DB delivery retry: ' + retryResult.error.message);
  for (const log of retryResult.data || []) {
    const result = await retryDeliveryLog(sb, log);
    if (result.sent) summary.retries++;
    else if (result.error) summary.errors.push('delivery ' + log.id + ': ' + result.error);
  }
  return summary;
}

function requireAdmin(req) {
  const token = env('OMNI_ADMIN_TOKEN', env('OMNI_LICENSE_ADMIN_TOKEN', env('LICENSE_ADMIN_TOKEN', '')));
  if (!token) throw new Error('Chưa cấu hình OMNI_ADMIN_TOKEN');
  const auth = String(req.headers.authorization || '');
  const supplied = auth.toLowerCase().startsWith('bearer ') ? auth.slice(7).trim() : String(req.headers['x-admin-token'] || '');
  if (!safeEqualString(supplied, token)) throw new Error('Token admin không đúng');
}

function requireCron(req) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return;
  const auth = String(req.headers.authorization || '');
  const supplied = auth.toLowerCase().startsWith('bearer ') ? auth.slice(7).trim() : String(req.headers['x-cron-secret'] || '');
  if (!safeEqualString(supplied, secret)) throw new Error('Cron secret không đúng');
}

module.exports = {
  PRODUCT,
  PRODUCT_NAME,
  createTrial,
  processPaymentWebhook,
  readRawBody,
  requireAdmin,
  requireCron,
  runCron,
  sendJson,
  setCors,
  sendOrderEmail,
  db,
  getOrderByCode,
  verifySepay,
};
