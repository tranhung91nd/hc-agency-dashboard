const {
  getOrderByCode,
  requireAdmin,
  sendJson,
  sendOrderEmail,
  setCors,
  db,
} = require('../../_lib/omni');

function resolveKind(order, requested) {
  if (['trial', 'reminder', 'renewal', 'paid'].includes(requested)) return requested;
  if (order.paid_license_key && order.status === 'paid_active') return 'paid';
  if (order.trial_license_key && order.status === 'trial_active') return 'trial';
  return 'renewal';
}

module.exports = async (req, res) => {
  if (setCors(req, res, 'POST, OPTIONS')) return;
  if (req.method !== 'POST') return sendJson(res, 405, { ok: false, error: 'method_not_allowed' });
  try {
    requireAdmin(req);
    const body = req.body || {};
    const sb = db();
    const order = await getOrderByCode(sb, body.order_code || body.payment_code);
    if (!order) return sendJson(res, 404, { ok: false, error: 'order_not_found' });
    const kind = resolveKind(order, body.kind);
    const delivery = await sendOrderEmail(sb, order, kind);
    return sendJson(res, 200, { ok: true, order_code: order.order_code, kind, delivery });
  } catch (e) {
    console.error('[omni admin resend]', e);
    return sendJson(res, /token/i.test(e.message || '') ? 401 : 500, { ok: false, error: e.message || String(e) });
  }
};
