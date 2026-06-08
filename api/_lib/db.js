const { createClient } = require('../../local-db-client');

function dbApiUrl() {
  return process.env.LOCAL_DB_URL || process.env.DB_API_URL || 'http://127.0.0.1:' + (process.env.PORT || 8788) + '/db';
}

function dbServiceKey() {
  return process.env.LOCAL_DB_SERVICE_KEY || process.env.DB_SERVICE_KEY || '';
}

function createDbClient() {
  const url = dbApiUrl();
  const key = dbServiceKey();
  if (!url || !key) throw new Error('Thiếu LOCAL_DB_URL hoặc LOCAL_DB_SERVICE_KEY');
  return createClient(url, key, { auth: { persistSession: false } });
}

async function verifyBearerUser(req) {
  const auth = req.headers && (req.headers.authorization || req.headers.Authorization) || '';
  const token = String(auth).replace(/^Bearer\s+/i, '').trim();
  if (!token) return null;
  try {
    const db = createClient(dbApiUrl(), dbServiceKey(), { auth: { persistSession: false } });
    const { data, error } = await db.auth.getUser(token);
    if (error || !data || !data.user) return null;
    return data.user;
  } catch (e) {
    console.error('[db auth] verifyBearerUser error:', e.message || e);
    return null;
  }
}

module.exports = {
  createDbClient,
  dbApiUrl,
  dbServiceKey,
  verifyBearerUser,
};
