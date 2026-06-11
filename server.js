const express = require('express');
global.WebSocket = global.WebSocket || require('ws');

const app = express();
const PORT = Number(process.env.PORT || 8788);

const jsonParser = express.json({ limit: '20mb' });
const rawJsonParser = express.raw({ type: '*/*', limit: '20mb' });

function wrap(handler) {
  return async function route(req, res, next) {
    try {
      await handler(req, res);
    } catch (err) {
      next(err);
    }
  };
}

function withQuery(params, handler) {
  return function route(req, res, next) {
    req.query = Object.assign({}, req.query || {}, params(req));
    return wrap(handler)(req, res, next);
  };
}

function edgeRequestFromExpress(req) {
  return {
    method: req.method,
    headers: new Headers(req.headers),
    json: async () => req.body || {},
  };
}

async function sendWebResponse(res, webResponse) {
  res.status(webResponse.status || 200);
  webResponse.headers.forEach((value, key) => res.setHeader(key, value));
  const text = await webResponse.text();
  res.send(text);
}

const meta = require('./api/meta');
const metaSync = require('./api/meta-sync');
const policyAlertSync = require('./api/policy-alert-sync');
const { scanRejectedAds } = require('./api/_lib/policy-alert-sync');
const publicRentalSheet = require('./api/public-rental-sheet');
const autoAdsCreate = require('./api/auto-ads-create');
const chatgptAuth = require('./api/chatgpt-auth');
const telegram = require('./api/telegram');
const tiktok = require('./api/tiktok');
const trial = require('./api/trial');
const omniTrial = require('./api/omni/trial');
const omniPaymentWebhook = require('./api/omni/payment-webhook');
const omniCron = require('./api/omni/cron');
const omniAdminResend = require('./api/omni/admin/resend');
const omniOrder = require('./api/omni/order/[order_code]');
const localDb = require('./api/_lib/local-db');

const ZALO_AGENT_BASE_URL = (process.env.ZALO_AGENT_BASE_URL || 'http://127.0.0.1:3333').replace(/\/+$/, '');

let chatgptChat;
async function loadChatgptChat() {
  if (!chatgptChat) chatgptChat = require('./api/chatgpt-chat');
  return chatgptChat;
}

app.options('/api/*', (req, res) => res.status(200).end());
app.use('/db', localDb);

async function zaloAgentProxy(req, res) {
  const tail = String(req.params[0] || '').replace(/^\/+/, '');
  const queryIndex = req.url.indexOf('?');
  const query = queryIndex >= 0 ? req.url.slice(queryIndex) : '';
  const targetUrl = `${ZALO_AGENT_BASE_URL}/${tail}${query}`;
  const headers = {
    accept: req.headers.accept || 'application/json',
    'x-forwarded-host': req.headers.host || '',
    'x-forwarded-proto': req.headers['x-forwarded-proto'] || req.protocol || 'http',
  };
  if (req.headers.authorization) headers.authorization = req.headers.authorization;
  let body;
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    headers['content-type'] = req.headers['content-type'] || 'application/json';
    if (req.body !== undefined) body = typeof req.body === 'string' ? req.body : JSON.stringify(req.body || {});
  }
  let upstream;
  try {
    upstream = await fetch(targetUrl, { method: req.method, headers, body });
  } catch (err) {
    res.status(502).json({
      ok: false,
      error: `Không kết nối được Zalo Agent tại ${ZALO_AGENT_BASE_URL}. Kiểm tra service Zalo hoặc biến ZALO_AGENT_BASE_URL.`,
      detail: err.message || String(err),
    });
    return;
  }
  const contentType = upstream.headers.get('content-type');
  if (contentType) res.setHeader('content-type', contentType);
  res.status(upstream.status);
  const buf = Buffer.from(await upstream.arrayBuffer());
  res.send(buf);
}

app.all('/api/zalo-agent/*', jsonParser, wrap(zaloAgentProxy));
app.all('/api/meta', jsonParser, wrap(meta));
app.all('/api/meta-sync', jsonParser, wrap(metaSync));
app.all('/api/policy-alert-sync', jsonParser, wrap(policyAlertSync));
app.all('/api/public-rental-sheet', wrap(publicRentalSheet));
app.all('/api/auto-ads-create', jsonParser, wrap(autoAdsCreate));
app.all('/api/chatgpt-auth', jsonParser, wrap(chatgptAuth));
app.all('/api/telegram', jsonParser, wrap(telegram));
app.all('/api/tiktok', jsonParser, wrap(tiktok));
app.all('/api/trial', jsonParser, wrap(trial));

app.all('/api/chatgpt-chat', jsonParser, async (req, res, next) => {
  try {
    const handler = await loadChatgptChat();
    const response = await handler(edgeRequestFromExpress(req));
    await sendWebResponse(res, response);
  } catch (err) {
    next(err);
  }
});

app.all('/api/omni/trial', jsonParser, wrap(omniTrial));
app.all('/api/omni/payment-webhook', rawJsonParser, (req, _res, next) => {
  req.rawBody = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : '';
  next();
}, wrap(omniPaymentWebhook));
app.all('/api/omni/cron', jsonParser, wrap(omniCron));
app.all('/api/omni/admin/resend', jsonParser, wrap(omniAdminResend));
app.all('/api/omni/order/:order_code', jsonParser, withQuery(req => ({ order_code: req.params.order_code }), omniOrder));

app.get('/healthz', (_req, res) => {
  res.json({ ok: true, service: 'hc-agency-dashboard-api' });
});

app.use((err, _req, res, _next) => {
  console.error('[server]', err);
  res.status(500).json({ error: err.message || String(err) });
});

app.listen(PORT, '127.0.0.1', () => {
  console.log(`HC Agency Dashboard API listening on 127.0.0.1:${PORT}`);
});

const POLICY_ALERT_SCAN_INTERVAL_MS = Number(process.env.POLICY_ALERT_SCAN_INTERVAL_MS || 3 * 60 * 1000);
let policyAlertScanRunning = false;

async function runPolicyAlertScanTick(source) {
  if (process.env.POLICY_ALERT_SCAN_DISABLED === '1') return;
  if (policyAlertScanRunning) return;
  policyAlertScanRunning = true;
  try {
    const result = await scanRejectedAds({ source: source || 'cron' });
    console.log('[policy-alert-scan]', JSON.stringify({
      status: result.status,
      watched_accounts: result.watched_accounts,
      rejected_ads: result.rejected_ads,
      saved_alerts: result.saved_alerts,
      resolved_alerts: result.resolved_alerts,
      auto_delete_ads: result.auto_delete_ads,
      policy_telegram_sent: result.telegram_notifications && result.telegram_notifications.sent || 0,
      rental_balance_sent: result.rental_balance_notifications && result.rental_balance_notifications.sent || 0,
      error_accounts: result.error_accounts,
      duration_ms: result.duration_ms
    }));
  } catch (e) {
    console.error('[policy-alert-scan]', e.message || e);
  } finally {
    policyAlertScanRunning = false;
  }
}

if (POLICY_ALERT_SCAN_INTERVAL_MS > 0 && process.env.POLICY_ALERT_SCAN_DISABLED !== '1') {
  setTimeout(() => runPolicyAlertScanTick('startup'), 15000);
  setInterval(() => runPolicyAlertScanTick('cron'), POLICY_ALERT_SCAN_INTERVAL_MS);
}
