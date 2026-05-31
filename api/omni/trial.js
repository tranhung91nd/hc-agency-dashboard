const { createTrial, sendJson, setCors } = require('../_lib/omni');

module.exports = async (req, res) => {
  if (setCors(req, res, 'POST, OPTIONS')) return;
  if (req.method !== 'POST') return sendJson(res, 405, { ok: false, error: 'method_not_allowed' });
  try {
    const result = await createTrial(req.body || {});
    return sendJson(res, 200, result);
  } catch (e) {
    console.error('[omni trial]', e);
    return sendJson(res, 500, { ok: false, error: e.message || String(e) });
  }
};
