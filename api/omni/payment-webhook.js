const {
  processPaymentWebhook,
  readRawBody,
  sendJson,
  setCors,
  verifySepay,
} = require('../_lib/omni');

async function handler(req, res) {
  if (setCors(req, res, 'POST, OPTIONS')) return;
  if (req.method !== 'POST') return sendJson(res, 405, { success: false, error: 'method_not_allowed' });

  let rawBody = '';
  try {
    rawBody = await readRawBody(req);
    const verified = verifySepay(req, rawBody);
    if (!verified.ok) return sendJson(res, 401, { success: false, error: verified.error });

    const payload = rawBody ? JSON.parse(rawBody) : {};
    await processPaymentWebhook(payload, rawBody, verified.status);
    return sendJson(res, 200, { success: true });
  } catch (e) {
    console.error('[omni payment webhook]', e);
    return sendJson(res, 500, { success: false, error: e.message || String(e) });
  }
}

module.exports = handler;
module.exports.config = { api: { bodyParser: false } };
