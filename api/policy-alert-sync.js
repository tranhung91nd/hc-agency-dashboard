const { verifyBearerUser } = require('./_lib/db');
const { scanRejectedAds } = require('./_lib/policy-alert-sync');

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (!['POST', 'GET'].includes(req.method)) return res.status(405).json({ error: 'Method not allowed' });

  const user = await verifyBearerUser(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized - vui long dang nhap lai' });

  try {
    const result = await scanRejectedAds({ source: req.method === 'GET' ? 'ui-get' : 'ui' });
    return res.status(200).json({ ok: true, result });
  } catch (e) {
    console.error('[policy-alert-sync]', e);
    return res.status(500).json({ error: e.message || String(e) });
  }
};
