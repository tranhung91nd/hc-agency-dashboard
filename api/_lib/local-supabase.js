const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const bcrypt = require('bcryptjs');
const express = require('express');
const jwt = require('jsonwebtoken');
const { Pool, types } = require('pg');

const router = express.Router();
const jsonParser = express.json({ limit: '50mb' });

function parsePgNumber(value) {
  if (value === null || value === undefined) return value;
  const number = Number(value);
  return Number.isFinite(number) ? number : value;
}

types.setTypeParser(20, parsePgNumber);
types.setTypeParser(1082, value => value);
types.setTypeParser(1700, parsePgNumber);

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

const columnTypeCache = new Map();

const RESERVED_QUERY_KEYS = new Set([
  'select',
  'order',
  'limit',
  'offset',
  'on_conflict',
]);

const RELATIONS = {
  ad_account: {
    client: { table: 'client', localKey: 'client_id', foreignKey: 'id' },
  },
  assignment: {
    client: { table: 'client', localKey: 'client_id', foreignKey: 'id' },
    staff: { table: 'staff', localKey: 'staff_id', foreignKey: 'id' },
  },
  campaign_daily_mess: {
    ad_account: { table: 'ad_account', localKey: 'ad_account_id', foreignKey: 'id', nested: ['client'] },
  },
  client_deposit: {
    client: { table: 'client', localKey: 'client_id', foreignKey: 'id' },
  },
  contract: {
    client: { table: 'client', localKey: 'client_id', foreignKey: 'id' },
  },
  monthly_revenue: {
    staff: { table: 'staff', localKey: 'staff_id', foreignKey: 'id' },
  },
  quotation: {
    client: { table: 'client', localKey: 'client_id', foreignKey: 'id' },
  },
  salary: {
    staff: { table: 'staff', localKey: 'staff_id', foreignKey: 'id' },
  },
  staff_client: {
    client: { table: 'client', localKey: 'client_id', foreignKey: 'id' },
  },
  transaction: {
    client: { table: 'client', localKey: 'client_id', foreignKey: 'id' },
    staff: { table: 'staff', localKey: 'staff_id', foreignKey: 'id' },
  },
};

const RPC_ARGS = {
  auto_scan_camp_penalty: ['p_scan_date', 'p_amount'],
  get_dashboard_overview: ['p_month'],
  get_public_client_report: ['p_client_id', 'p_token'],
  get_public_rental_ledger: ['p_client_id', 'p_token'],
  get_public_team_penalty: ['p_token', 'p_month'],
  refresh_ad_account_month_spend: [],
  submit_public_lead: ['p_data'],
};

const PUBLIC_RPC = new Set([
  'get_public_client_report',
  'get_public_rental_ledger',
  'get_public_team_penalty',
  'submit_public_lead',
]);

function asyncRoute(fn) {
  return function route(req, res, next) {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

function isIdent(value) {
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(value || '');
}

function qi(value) {
  if (!isIdent(value)) throw httpError(400, 'invalid_identifier: ' + value);
  return '"' + value.replace(/"/g, '""') + '"';
}

function tableSql(table, schema = 'public') {
  return qi(schema) + '.' + qi(table);
}

function httpError(status, message, code) {
  const err = new Error(message);
  err.status = status;
  err.code = code;
  return err;
}

function first(value) {
  return Array.isArray(value) ? value[value.length - 1] : value;
}

function bearer(req) {
  const header = req.headers.authorization || '';
  const match = String(header).match(/^Bearer\s+(.+)$/i);
  return match ? match[1] : '';
}

function jwtSecret() {
  return process.env.LOCAL_SUPABASE_JWT_SECRET || process.env.SUPABASE_JWT_SECRET || process.env.JWT_SECRET || '';
}

function serviceKey() {
  return process.env.LOCAL_SUPABASE_SERVICE_KEY || '';
}

function authFromReq(req) {
  const token = bearer(req);
  const svc = serviceKey();
  if (svc && token && token === svc) return { role: 'service_role', service: true };
  const secret = jwtSecret();
  if (!token || !secret) return { role: 'anon' };
  try {
    const payload = jwt.verify(token, secret);
    return {
      role: payload.role || 'authenticated',
      userId: payload.sub,
      email: payload.email,
      payload,
    };
  } catch (_err) {
    return { role: 'anon' };
  }
}

function requireMutationAuth(req) {
  const auth = authFromReq(req);
  if (auth.service || auth.role === 'authenticated') return auth;
  throw httpError(401, 'Auth session missing', 'PGRST301');
}

function userJson(row) {
  if (!row) return null;
  return {
    id: row.id,
    aud: row.aud || 'authenticated',
    role: row.role || 'authenticated',
    email: row.email,
    email_confirmed_at: row.email_confirmed_at,
    phone: row.phone,
    confirmed_at: row.confirmed_at || row.email_confirmed_at || row.phone_confirmed_at,
    last_sign_in_at: row.last_sign_in_at,
    app_metadata: row.raw_app_meta_data || {},
    user_metadata: row.raw_user_meta_data || {},
    identities: [],
    created_at: row.created_at,
    updated_at: row.updated_at,
    is_anonymous: !!row.is_anonymous,
  };
}

function sessionJson(row) {
  const secret = jwtSecret();
  if (!secret) throw httpError(500, 'Missing LOCAL_SUPABASE_JWT_SECRET');
  const expiresIn = 60 * 60 * 24 * 7;
  const now = Math.floor(Date.now() / 1000);
  const user = userJson(row);
  const accessToken = jwt.sign({
    aud: 'authenticated',
    exp: now + expiresIn,
    sub: row.id,
    email: row.email,
    role: 'authenticated',
  }, secret);
  return {
    access_token: accessToken,
    token_type: 'bearer',
    expires_in: expiresIn,
    expires_at: now + expiresIn,
    refresh_token: crypto.randomBytes(32).toString('hex'),
    user,
  };
}

function splitTopLevel(value) {
  const out = [];
  let cur = '';
  let depth = 0;
  let quoted = false;
  for (const ch of String(value || '')) {
    if (ch === '"' && cur[cur.length - 1] !== '\\') quoted = !quoted;
    if (!quoted && ch === '(') depth++;
    if (!quoted && ch === ')') depth = Math.max(0, depth - 1);
    if (!quoted && depth === 0 && ch === ',') {
      out.push(cur);
      cur = '';
    } else {
      cur += ch;
    }
  }
  if (cur || value === '') out.push(cur);
  return out.map(s => s.trim()).filter(Boolean);
}

function cleanFilterValue(value) {
  let out = String(value == null ? '' : value);
  if (out.startsWith('"') && out.endsWith('"')) out = out.slice(1, -1);
  return out;
}

function addCondition(parts, params, column, expression, forcedNot) {
  let expr = String(expression == null ? '' : expression);
  let negated = !!forcedNot;
  if (expr.startsWith('not.')) {
    negated = !negated;
    expr = expr.slice(4);
  }
  const dot = expr.indexOf('.');
  const op = dot === -1 ? 'eq' : expr.slice(0, dot);
  const raw = dot === -1 ? expr : expr.slice(dot + 1);
  const col = qi(column);

  if (op === 'is') {
    if (raw === 'null') parts.push(col + (negated ? ' IS NOT NULL' : ' IS NULL'));
    else if (raw === 'true' || raw === 'false') parts.push(col + (negated ? ' IS NOT ' : ' IS ') + raw.toUpperCase());
    else parts.push(col + (negated ? ' IS DISTINCT FROM ' : ' IS NOT DISTINCT FROM ') + '$' + params.push(cleanFilterValue(raw)));
    return;
  }

  if (op === 'in') {
    const list = raw.replace(/^\(/, '').replace(/\)$/, '');
    const values = splitTopLevel(list).map(cleanFilterValue);
    if (!values.length) {
      parts.push(negated ? 'TRUE' : 'FALSE');
      return;
    }
    const placeholders = values.map(v => '$' + params.push(v)).join(',');
    parts.push(col + (negated ? ' NOT IN ' : ' IN ') + '(' + placeholders + ')');
    return;
  }

  const value = cleanFilterValue(raw);
  const param = '$' + params.push(value);
  const ops = {
    eq: negated ? '<>' : '=',
    neq: negated ? '=' : '<>',
    gt: negated ? '<=' : '>',
    gte: negated ? '<' : '>=',
    lt: negated ? '>=' : '<',
    lte: negated ? '>' : '<=',
    like: negated ? 'NOT LIKE' : 'LIKE',
    ilike: negated ? 'NOT ILIKE' : 'ILIKE',
  };
  if (!ops[op]) throw httpError(400, 'unsupported_filter_operator: ' + op);
  parts.push(col + ' ' + ops[op] + ' ' + param);
}

function addOrCondition(parts, params, expression) {
  const branches = splitTopLevel(expression).map(item => {
    const bits = item.split('.');
    if (bits.length < 3) return null;
    const column = bits.shift();
    const op = bits.shift();
    const value = bits.join('.');
    const branch = [];
    addCondition(branch, params, column, op + '.' + value, false);
    return branch[0];
  }).filter(Boolean);
  if (branches.length) parts.push('(' + branches.join(' OR ') + ')');
}

function buildWhere(query) {
  const parts = [];
  const params = [];
  for (const [rawKey, rawValue] of Object.entries(query || {})) {
    const value = first(rawValue);
    if (RESERVED_QUERY_KEYS.has(rawKey)) continue;
    if (rawKey === 'or') {
      addOrCondition(parts, params, value);
      continue;
    }
    let key = rawKey;
    let negated = false;
    if (key.startsWith('not.')) {
      negated = true;
      key = key.slice(4);
    }
    if (!isIdent(key)) continue;
    addCondition(parts, params, key, value, negated);
  }
  return {
    sql: parts.length ? ' WHERE ' + parts.join(' AND ') : '',
    params,
  };
}

function buildOrder(query) {
  const raw = first(query.order);
  if (!raw) return '';
  const clauses = splitTopLevel(raw).map(part => {
    const bits = part.split('.');
    const col = bits.shift();
    if (!isIdent(col)) return null;
    const desc = bits.includes('desc');
    const nullsFirst = bits.includes('nullsfirst');
    const nullsLast = bits.includes('nullslast');
    return qi(col) + (desc ? ' DESC' : ' ASC') + (nullsFirst ? ' NULLS FIRST' : '') + (nullsLast ? ' NULLS LAST' : '');
  }).filter(Boolean);
  return clauses.length ? ' ORDER BY ' + clauses.join(', ') : '';
}

function rangeFromReq(req) {
  let limit = first(req.query.limit);
  let offset = first(req.query.offset);
  const range = req.headers.range;
  if (range && /^\d+-\d+$/.test(range)) {
    const [from, to] = range.split('-').map(n => Number(n));
    offset = from;
    limit = Math.max(0, to - from + 1);
  }
  const out = { limit: null, offset: null };
  if (limit !== undefined && limit !== null && limit !== '') out.limit = Math.max(0, Number(limit));
  if (offset !== undefined && offset !== null && offset !== '') out.offset = Math.max(0, Number(offset));
  return out;
}

function wantsSingular(req) {
  return String(req.headers.accept || '').includes('application/vnd.pgrst.object+json');
}

function wantsRepresentation(req) {
  return String(req.headers.prefer || '').includes('return=representation');
}

function wantsCount(req) {
  return String(req.headers.prefer || '').includes('count=exact');
}

function setRangeHeaders(req, res, from, rowsLength, total) {
  const start = rowsLength ? from : 0;
  const end = rowsLength ? from + rowsLength - 1 : 0;
  const totalPart = Number.isFinite(total) ? String(total) : '*';
  res.setHeader('Range-Unit', 'items');
  res.setHeader('Content-Range', start + '-' + end + '/' + totalPart);
}

function postgrestSingularError(res, rowCount) {
  return res.status(406).json({
    code: 'PGRST116',
    details: 'The result contains ' + rowCount + ' rows',
    hint: null,
    message: 'JSON object requested, multiple (or no) rows returned',
  });
}

async function sendRows(req, res, rows, status, total, offset) {
  const from = Number(offset || 0);
  setRangeHeaders(req, res, from, rows.length, total);
  if (req.method === 'HEAD') return res.status(200).end();
  if (wantsSingular(req)) {
    if (rows.length !== 1) return postgrestSingularError(res, rows.length);
    return res.status(status || 200).json(rows[0]);
  }
  return res.status(status || 200).json(rows);
}

async function hydrateRows(table, rows, select) {
  if (!rows.length || !select) return rows;
  const config = RELATIONS[table];
  if (!config) return rows;
  for (const [relationName, relation] of Object.entries(config)) {
    if (!String(select).includes(relationName + '(')) continue;
    await hydrateRelation(rows, relationName, relation);
  }
  return rows;
}

async function hydrateRelation(rows, relationName, relation) {
  const ids = [...new Set(rows.map(row => row[relation.localKey]).filter(v => v !== null && v !== undefined).map(String))];
  if (!ids.length) {
    rows.forEach(row => { row[relationName] = null; });
    return;
  }
  const sql = 'SELECT * FROM ' + tableSql(relation.table) + ' WHERE ' + qi(relation.foreignKey) + '::text = ANY($1)';
  const { rows: relatedRows } = await pool.query(sql, [ids]);
  if (relation.nested && relation.nested.includes('client')) {
    await hydrateRelation(relatedRows, 'client', { table: 'client', localKey: 'client_id', foreignKey: 'id' });
  }
  const map = new Map(relatedRows.map(row => [String(row[relation.foreignKey]), row]));
  rows.forEach(row => {
    const key = row[relation.localKey] == null ? null : String(row[relation.localKey]);
    row[relationName] = key ? (map.get(key) || null) : null;
  });
}

function bodyRows(body) {
  if (Array.isArray(body)) return body;
  if (body && typeof body === 'object') return [body];
  throw httpError(400, 'JSON body must be object or array');
}

function allColumns(rows) {
  return [...new Set(rows.flatMap(row => Object.keys(row || {})))].filter(isIdent);
}

async function getColumnTypes(table) {
  if (columnTypeCache.has(table)) return columnTypeCache.get(table);
  const result = await pool.query(`
    SELECT column_name, data_type, udt_name
    FROM information_schema.columns
    WHERE table_schema='public' AND table_name=$1
  `, [table]);
  const map = new Map(result.rows.map(row => [row.column_name, row]));
  columnTypeCache.set(table, map);
  return map;
}

function normalizeDbValue(types, column, value) {
  if (value === undefined) return null;
  const type = types.get(column);
  if (type && (type.data_type === 'json' || type.data_type === 'jsonb') && value !== null && typeof value === 'object') {
    return JSON.stringify(value);
  }
  return value;
}

async function restGet(req, res, table) {
  requireMutationAuth(req);
  const where = buildWhere(req.query);
  const order = buildOrder(req.query);
  const range = rangeFromReq(req);
  const countSql = 'SELECT count(*)::int AS count FROM ' + tableSql(table) + where.sql;
  const countResult = wantsCount(req) || req.method === 'HEAD'
    ? await pool.query(countSql, where.params)
    : null;
  const total = countResult ? countResult.rows[0].count : NaN;
  let sql = 'SELECT * FROM ' + tableSql(table) + where.sql + order;
  const params = [...where.params];
  if (range.limit !== null) sql += ' LIMIT $' + params.push(range.limit);
  if (range.offset !== null) sql += ' OFFSET $' + params.push(range.offset);
  const result = req.method === 'HEAD' ? { rows: [] } : await pool.query(sql, params);
  await hydrateRows(table, result.rows, first(req.query.select));
  return sendRows(req, res, result.rows, 200, total, range.offset || 0);
}

async function restInsert(req, res, table) {
  const auth = requireMutationAuth(req);
  const rows = bodyRows(req.body);
  const cols = allColumns(rows);
  if (!cols.length) throw httpError(400, 'No insert columns');
  const types = await getColumnTypes(table);

  const params = [];
  const valuesSql = rows.map(row => {
    const slots = cols.map(col => '$' + params.push(normalizeDbValue(types, col, row[col])));
    return '(' + slots.join(',') + ')';
  }).join(',');

  const conflict = first(req.query.on_conflict);
  let conflictSql = '';
  if (conflict) {
    const conflictCols = String(conflict).split(',').map(s => s.trim()).filter(isIdent);
    const prefer = String(req.headers.prefer || '');
    if (!conflictCols.length) throw httpError(400, 'Invalid on_conflict');
    if (prefer.includes('resolution=ignore-duplicates')) {
      conflictSql = ' ON CONFLICT (' + conflictCols.map(qi).join(',') + ') DO NOTHING';
    } else {
      const updates = cols
        .filter(col => !conflictCols.includes(col))
        .map(col => qi(col) + '=EXCLUDED.' + qi(col));
      conflictSql = ' ON CONFLICT (' + conflictCols.map(qi).join(',') + ') DO UPDATE SET ' + (updates.length ? updates.join(',') : qi(conflictCols[0]) + '=EXCLUDED.' + qi(conflictCols[0]));
    }
  }

  const sql = 'INSERT INTO ' + tableSql(table) + ' (' + cols.map(qi).join(',') + ') VALUES ' + valuesSql + conflictSql + ' RETURNING *';
  const result = await pool.query(sql, params);
  await hydrateRows(table, result.rows, first(req.query.select));
  const status = auth.service ? 200 : 201;
  if (!wantsRepresentation(req)) return res.status(status).json(null);
  return sendRows(req, res, result.rows, status, result.rows.length, 0);
}

async function restPatch(req, res, table) {
  requireMutationAuth(req);
  const patch = req.body || {};
  const cols = Object.keys(patch).filter(isIdent);
  if (!cols.length) throw httpError(400, 'No update columns');
  const types = await getColumnTypes(table);
  const where = buildWhere(req.query);
  const params = [];
  const setSql = cols.map(col => qi(col) + '=$' + params.push(normalizeDbValue(types, col, patch[col]))).join(',');
  const sql = 'UPDATE ' + tableSql(table) + ' SET ' + setSql + where.sql.replace(/\$(\d+)/g, (_m, n) => '$' + (Number(n) + params.length)) + ' RETURNING *';
  const result = await pool.query(sql, params.concat(where.params));
  await hydrateRows(table, result.rows, first(req.query.select));
  if (!wantsRepresentation(req)) return res.status(204).end();
  return sendRows(req, res, result.rows, 200, result.rows.length, 0);
}

async function restDelete(req, res, table) {
  requireMutationAuth(req);
  const where = buildWhere(req.query);
  const sql = 'DELETE FROM ' + tableSql(table) + where.sql + ' RETURNING *';
  const result = await pool.query(sql, where.params);
  if (!wantsRepresentation(req)) return res.status(204).end();
  return sendRows(req, res, result.rows, 200, result.rows.length, 0);
}

async function rpc(req, res) {
  const name = req.params.name;
  if (!Object.prototype.hasOwnProperty.call(RPC_ARGS, name)) throw httpError(404, 'Unknown RPC: ' + name);
  if (!PUBLIC_RPC.has(name)) requireMutationAuth(req);
  const argNames = RPC_ARGS[name].filter(arg => req.body && Object.prototype.hasOwnProperty.call(req.body, arg));
  const params = argNames.map(arg => req.body[arg]);
  const callArgs = argNames.map((arg, idx) => qi(arg) + ' => $' + (idx + 1)).join(', ');
  const sql = 'SELECT public.' + qi(name) + '(' + callArgs + ') AS result';
  const result = await pool.query(sql, params);
  return res.status(200).json(result.rows[0] ? result.rows[0].result : null);
}

async function findUserByEmail(email) {
  const result = await pool.query('SELECT * FROM auth.users WHERE lower(email)=lower($1) AND deleted_at IS NULL LIMIT 1', [email]);
  return result.rows[0] || null;
}

async function authToken(req, res) {
  const grantType = req.query.grant_type;
  if (grantType !== 'password') throw httpError(400, 'unsupported_grant_type');
  const email = String(req.body.email || '').trim().toLowerCase();
  const password = String(req.body.password || '');
  const user = await findUserByEmail(email);
  if (!user || !user.encrypted_password) throw httpError(400, 'Invalid login credentials');
  const ok = await bcrypt.compare(password, user.encrypted_password);
  if (!ok) throw httpError(400, 'Invalid login credentials');
  await pool.query('UPDATE auth.users SET last_sign_in_at=now(), updated_at=now() WHERE id=$1', [user.id]);
  user.last_sign_in_at = new Date().toISOString();
  return res.status(200).json(sessionJson(user));
}

async function authUser(req, res) {
  const auth = authFromReq(req);
  if (!auth.userId) throw httpError(401, 'Auth session missing');
  const result = await pool.query('SELECT * FROM auth.users WHERE id=$1 AND deleted_at IS NULL LIMIT 1', [auth.userId]);
  if (!result.rows[0]) throw httpError(401, 'Auth user not found');
  return res.status(200).json(userJson(result.rows[0]));
}

async function authSignup(req, res) {
  const email = String(req.body.email || '').trim().toLowerCase();
  const password = String(req.body.password || '');
  const metadata = (req.body.data || (req.body.options && req.body.options.data) || {});
  if (!email || !password) throw httpError(400, 'email and password are required');
  const hash = await bcrypt.hash(password, 10);
  const result = await pool.query(`
    INSERT INTO auth.users (
      id, aud, role, email, encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at
    )
    VALUES (
      gen_random_uuid(), 'authenticated', 'authenticated', $1, $2, now(),
      '{"provider":"email","providers":["email"]}'::jsonb, $3::jsonb, now(), now()
    )
    RETURNING *
  `, [email, hash, JSON.stringify(metadata || {})]);
  const user = result.rows[0];
  await pool.query(`
    INSERT INTO auth.identities (provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
    VALUES ($1, $2, $3::jsonb, 'email', now(), now(), now())
    ON CONFLICT (provider_id, provider) DO NOTHING
  `, [user.id, user.id, JSON.stringify({ sub: user.id, email })]);
  return res.status(200).json({ user: userJson(user), session: sessionJson(user) });
}

async function authRecover(_req, res) {
  return res.status(200).json({});
}

function safeStoragePath(bucket, objectName) {
  const base = path.resolve(process.env.LOCAL_SUPABASE_STORAGE_DIR || path.join(process.cwd(), 'storage'));
  const file = path.resolve(base, bucket, objectName);
  if (!file.startsWith(base + path.sep)) throw httpError(400, 'Invalid storage path');
  return file;
}

async function storageDownload(req, res) {
  const bucket = req.params.bucket;
  const objectName = req.params[0] || '';
  const file = safeStoragePath(bucket, objectName);
  if (!fs.existsSync(file)) throw httpError(404, 'Object not found');
  const meta = await pool.query('SELECT metadata FROM storage.objects WHERE bucket_id=$1 AND name=$2 LIMIT 1', [bucket, objectName]);
  const metadata = meta.rows[0] ? meta.rows[0].metadata || {} : {};
  if (metadata.mimetype) res.setHeader('Content-Type', metadata.mimetype);
  res.setHeader('Cache-Control', metadata.cacheControl || 'max-age=3600');
  return fs.createReadStream(file).pipe(res);
}

router.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'authorization, apikey, content-type, prefer, range, x-client-info');
  res.setHeader('Access-Control-Allow-Methods', 'GET,HEAD,POST,PATCH,DELETE,OPTIONS');
  res.setHeader('Access-Control-Expose-Headers', 'Content-Range, Range-Unit');
  if (req.method === 'OPTIONS') return res.status(200).end();
  return next();
});

router.get('/health', (_req, res) => res.json({ ok: true, service: 'local-supabase-bridge' }));
router.post('/auth/v1/token', jsonParser, asyncRoute(authToken));
router.get('/auth/v1/user', asyncRoute(authUser));
router.put('/auth/v1/user', jsonParser, asyncRoute(authUser));
router.post('/auth/v1/logout', (_req, res) => res.status(204).end());
router.post('/auth/v1/signup', jsonParser, asyncRoute(authSignup));
router.post('/auth/v1/recover', jsonParser, asyncRoute(authRecover));

router.post('/rest/v1/rpc/:name', jsonParser, asyncRoute(rpc));
router.get('/storage/v1/object/:bucket/*', asyncRoute(storageDownload));
router.get('/storage/v1/object/public/:bucket/*', asyncRoute(storageDownload));

router.all('/rest/v1/:table', jsonParser, asyncRoute(async (req, res) => {
  const table = req.params.table;
  if (!isIdent(table)) throw httpError(400, 'invalid table');
  if (req.method === 'GET' || req.method === 'HEAD') return restGet(req, res, table);
  if (req.method === 'POST') return restInsert(req, res, table);
  if (req.method === 'PATCH') return restPatch(req, res, table);
  if (req.method === 'DELETE') return restDelete(req, res, table);
  throw httpError(405, 'method_not_allowed');
}));

router.use((err, _req, res, _next) => {
  const status = err.status || 500;
  const body = {
    code: err.code || (status >= 500 ? 'LOCAL_SUPABASE_ERROR' : 'LOCAL_SUPABASE_REQUEST_ERROR'),
    details: null,
    hint: null,
    message: err.message || String(err),
  };
  if (status >= 500) console.error('[local-supabase]', err);
  res.status(status).json(body);
});

module.exports = router;
