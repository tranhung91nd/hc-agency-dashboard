const { getOrderByCode, requireAdmin, sendJson, setCors, db } = require('../../_lib/omni');

module.exports = async (req, res) => {
  if (setCors(req, res, 'GET, OPTIONS')) return;
  if (req.method !== 'GET') return sendJson(res, 405, { ok: false, error: 'method_not_allowed' });
  try {
    requireAdmin(req);
    const orderCode = req.query && req.query.order_code;
    const order = await getOrderByCode(db(), orderCode);
    if (!order) return sendJson(res, 404, { ok: false, error: 'order_not_found' });
    return sendJson(res, 200, { ok: true, order });
  } catch (e) {
    console.error('[omni order]', e);
    return sendJson(res, /token/i.test(e.message || '') ? 401 : 500, { ok: false, error: e.message || String(e) });
  }
};
