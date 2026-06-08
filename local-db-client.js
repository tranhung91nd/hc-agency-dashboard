(function(root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.localDb = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
  function joinUrl(base, path) {
    return String(base || '').replace(/\/+$/, '') + '/' + String(path || '').replace(/^\/+/, '');
  }

  function storageGet(key) {
    try {
      if (typeof localStorage !== 'undefined') return localStorage.getItem(key);
    } catch (_e) {}
    return storageGet.mem && storageGet.mem[key] || null;
  }
  storageGet.mem = {};

  function storageSet(key, value) {
    try {
      if (typeof localStorage !== 'undefined') {
        if (value === null) localStorage.removeItem(key);
        else localStorage.setItem(key, value);
        return;
      }
    } catch (_e) {}
    if (value === null) delete storageGet.mem[key];
    else storageGet.mem[key] = value;
  }

  function parseSession(raw) {
    if (!raw) return null;
    try { return JSON.parse(raw); } catch (_e) { return null; }
  }

  function makeError(status, body, fallback) {
    if (!status || status < 400) return null;
    return {
      message: body && (body.message || body.error) || fallback || ('HTTP ' + status),
      code: body && body.code || String(status),
      details: body && body.details || null,
      hint: body && body.hint || null,
      status: status
    };
  }

  function encodeValue(value) {
    if (value === null) return 'null';
    if (Array.isArray(value)) return '(' + value.map(encodeValue).join(',') + ')';
    return String(value);
  }

  function parseCount(resp) {
    var cr = resp.headers.get('content-range') || '';
    var m = cr.match(/\/(\d+|\*)$/);
    return m && m[1] !== '*' ? Number(m[1]) : null;
  }

  function createClient(baseUrl, apiKey, options) {
    options = options || {};
    var storageKey = options.auth && options.auth.storageKey || 'hc-local-db-auth';

    function getStoredSession() {
      return parseSession(storageGet(storageKey));
    }

    function setStoredSession(session) {
      storageSet(storageKey, session ? JSON.stringify(session) : null);
    }

    function authHeaders(token) {
      var headers = {};
      var session = getStoredSession();
      var bearer = token || (session && session.access_token) || apiKey || '';
      if (bearer) headers.Authorization = 'Bearer ' + bearer;
      if (apiKey) headers.apikey = apiKey;
      return headers;
    }

    async function request(path, init, token) {
      init = init || {};
      init.headers = Object.assign({}, authHeaders(token), init.headers || {});
      var resp = await fetch(joinUrl(baseUrl, path), init);
      var text = await resp.text();
      var body = null;
      if (text) {
        try { body = JSON.parse(text); } catch (_e) { body = text; }
      }
      var error = makeError(resp.status, body, typeof body === 'string' ? body : null);
      return { resp: resp, body: body, error: error };
    }

    var auth = {
      async signInWithPassword(creds) {
        var r = await request('auth/v1/token?grant_type=password', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: creds.email, password: creds.password })
        });
        if (!r.error && r.body) setStoredSession(r.body);
        return { data: { session: r.error ? null : r.body, user: r.body && r.body.user || null }, error: r.error };
      },
      async signOut() {
        await request('auth/v1/logout', { method: 'POST' }).catch(function() {});
        setStoredSession(null);
        return { error: null };
      },
      async getSession() {
        return { data: { session: getStoredSession() }, error: null };
      },
      async getUser(token) {
        var r = await request('auth/v1/user', { method: 'GET' }, token);
        return { data: { user: r.error ? null : r.body }, error: r.error };
      },
      async signUp(args) {
        var payload = {
          email: args.email,
          password: args.password,
          data: args.data || args.options && args.options.data || {}
        };
        var r = await request('auth/v1/signup', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        var session = r.body && r.body.session || null;
        if (!r.error && session) setStoredSession(session);
        return { data: r.error ? null : r.body, error: r.error };
      },
      async resetPasswordForEmail(email) {
        var r = await request('auth/v1/recover', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: email })
        });
        return { data: r.error ? null : r.body, error: r.error };
      }
    };

    function QueryBuilder(table) {
      this.table = table;
      this.method = 'GET';
      this.params = new URLSearchParams();
      this.headers = {};
      this.body = undefined;
      this.singular = false;
      this.maybe = false;
      this.head = false;
    }

    QueryBuilder.prototype._prefer = function(value) {
      var current = this.headers.Prefer || '';
      this.headers.Prefer = current ? current + ',' + value : value;
      return this;
    };

    QueryBuilder.prototype.select = function(columns, opts) {
      columns = columns || '*';
      opts = opts || {};
      this.params.set('select', columns);
      if (opts.count === 'exact') this._prefer('count=exact');
      if (opts.head) {
        this.method = 'HEAD';
        this.head = true;
      } else if (this.method !== 'GET' && this.method !== 'HEAD') {
        this._prefer('return=representation');
      }
      return this;
    };

    QueryBuilder.prototype.insert = function(values) {
      this.method = 'POST';
      this.body = values;
      return this;
    };

    QueryBuilder.prototype.update = function(values) {
      this.method = 'PATCH';
      this.body = values;
      return this;
    };

    QueryBuilder.prototype.delete = function() {
      this.method = 'DELETE';
      return this;
    };

    QueryBuilder.prototype.upsert = function(values, opts) {
      opts = opts || {};
      this.method = 'POST';
      this.body = values;
      if (opts.onConflict) this.params.set('on_conflict', opts.onConflict);
      this._prefer(opts.ignoreDuplicates ? 'resolution=ignore-duplicates' : 'resolution=merge-duplicates');
      return this;
    };

    QueryBuilder.prototype._filter = function(column, op, value) {
      this.params.set(column, op + '.' + encodeValue(value));
      return this;
    };
    QueryBuilder.prototype.eq = function(c, v) { return this._filter(c, 'eq', v); };
    QueryBuilder.prototype.neq = function(c, v) { return this._filter(c, 'neq', v); };
    QueryBuilder.prototype.gt = function(c, v) { return this._filter(c, 'gt', v); };
    QueryBuilder.prototype.gte = function(c, v) { return this._filter(c, 'gte', v); };
    QueryBuilder.prototype.lt = function(c, v) { return this._filter(c, 'lt', v); };
    QueryBuilder.prototype.lte = function(c, v) { return this._filter(c, 'lte', v); };
    QueryBuilder.prototype.like = function(c, v) { return this._filter(c, 'like', v); };
    QueryBuilder.prototype.ilike = function(c, v) { return this._filter(c, 'ilike', v); };
    QueryBuilder.prototype.is = function(c, v) { return this._filter(c, 'is', v); };
    QueryBuilder.prototype.in = function(c, v) { return this._filter(c, 'in', v || []); };
    QueryBuilder.prototype.not = function(c, op, v) {
      this.params.set('not.' + c, op + '.' + encodeValue(v));
      return this;
    };
    QueryBuilder.prototype.or = function(expression) {
      this.params.set('or', expression);
      return this;
    };
    QueryBuilder.prototype.order = function(column, opts) {
      opts = opts || {};
      var value = column + (opts.ascending === false ? '.desc' : '.asc');
      this.params.set('order', value);
      return this;
    };
    QueryBuilder.prototype.limit = function(n) {
      this.params.set('limit', String(n));
      return this;
    };
    QueryBuilder.prototype.range = function(from, to) {
      this.params.set('offset', String(from));
      this.params.set('limit', String(Math.max(0, to - from + 1)));
      return this;
    };
    QueryBuilder.prototype.single = function() {
      this.singular = true;
      this.headers.Accept = 'application/vnd.pgrst.object+json';
      return this;
    };
    QueryBuilder.prototype.maybeSingle = function() {
      this.singular = true;
      this.maybe = true;
      this.headers.Accept = 'application/vnd.pgrst.object+json';
      return this;
    };
    QueryBuilder.prototype.then = function(resolve, reject) {
      return this._execute().then(resolve, reject);
    };
    QueryBuilder.prototype.catch = function(reject) {
      return this._execute().catch(reject);
    };
    QueryBuilder.prototype._execute = async function() {
      var path = 'rest/v1/' + encodeURIComponent(this.table);
      var query = this.params.toString();
      if (query) path += '?' + query;
      var init = { method: this.method, headers: Object.assign({}, this.headers) };
      if (this.body !== undefined) {
        init.headers['Content-Type'] = 'application/json';
        init.body = JSON.stringify(this.body);
      }
      var r = await request(path, init);
      var status = r.resp.status;
      var data = this.head ? null : r.body;
      var error = r.error;
      if (this.maybe && status === 406) {
        data = null;
        error = null;
      }
      return {
        data: error ? null : data,
        error: error,
        status: status,
        count: parseCount(r.resp)
      };
    };

    return {
      auth: auth,
      from: function(table) { return new QueryBuilder(table); },
      rpc: async function(name, args) {
        var r = await request('rest/v1/rpc/' + encodeURIComponent(name), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(args || {})
        });
        return { data: r.error ? null : r.body, error: r.error, status: r.resp.status };
      },
      channel: function() {
        var channel = {
          on: function() { return channel; },
          subscribe: function(cb) { if (typeof cb === 'function') setTimeout(function() { cb('SUBSCRIBED'); }, 0); return channel; },
          unsubscribe: function() { return Promise.resolve('ok'); }
        };
        return channel;
      },
      removeChannel: function(channel) {
        return channel && channel.unsubscribe ? channel.unsubscribe() : Promise.resolve('ok');
      }
    };
  }

  return { createClient: createClient };
});
