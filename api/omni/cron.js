const { requireCron, runCron, sendJson } = require('../_lib/omni');

module.exports = async (req, res) => {
  if (!['GET', 'POST'].includes(req.method)) return sendJson(res, 405, { ok: false, error: 'method_not_allowed' });
  try {
    requireCron(req);
    const summary = await runCron();
    return sendJson(res, 200, { ok: true, summary });
  } catch (e) {
    console.error('[omni cron]', e);
    return sendJson(res, 500, { ok: false, error: e.message || String(e) });
  }
};
