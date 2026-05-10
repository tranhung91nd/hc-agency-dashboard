#!/usr/bin/env node
// HC Agency — ChatGPT proxy chạy local trên máy anh
//
// Mục đích: Vercel datacenter IP bị Cloudflare WAF của ChatGPT chặn.
// Proxy này chạy ở máy anh (IP nhà mạng pass CF), Vercel function gọi qua
// tunnel ngrok/cloudflared/localtunnel. Token ChatGPT vẫn lưu Supabase,
// chỉ luồng request /codex/responses đi qua máy anh.
//
// Cách chạy:
//   HC_PROXY_SECRET=<chuỗi-bí-mật-trùng-với-env-Vercel> node scripts/chatgpt-proxy.js
//
// Sau đó expose port 8787 ra internet:
//   ngrok http 8787
// Copy URL ngrok (https://abc123.ngrok.io) → set env CHATGPT_PROXY_URL trên Vercel.
//
// Bảo mật:
//   - Header X-HC-Proxy-Secret phải khớp HC_PROXY_SECRET, nếu không trả 401
//   - Chỉ accept POST /codex/responses
//   - Forward toàn bộ body + Authorization header → chatgpt.com

const http = require('http');
const https = require('https');

const PORT = Number(process.env.PORT || 8787);
const SECRET = process.env.HC_PROXY_SECRET || '';
const TARGET_HOST = 'chatgpt.com';
const TARGET_PATH = '/backend-api/codex/responses';

if (!SECRET) {
  console.error('[FATAL] Thiếu env HC_PROXY_SECRET. Chạy lại với: HC_PROXY_SECRET=xxx node scripts/chatgpt-proxy.js');
  process.exit(1);
}

const server = http.createServer((req, res) => {
  const sendErr = (code, msg) => {
    res.writeHead(code, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: msg }));
  };

  if (req.method === 'GET' && req.url === '/healthz') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, target: TARGET_HOST + TARGET_PATH }));
    return;
  }

  if (req.method !== 'POST' || req.url !== '/codex/responses') {
    return sendErr(404, 'Chỉ accept POST /codex/responses');
  }

  if (req.headers['x-hc-proxy-secret'] !== SECRET) {
    console.warn('[AUTH] Reject request with bad/missing X-HC-Proxy-Secret từ', req.socket.remoteAddress);
    return sendErr(401, 'Unauthorized');
  }

  // Forward chỉ các header tối thiểu giống Goclaw. Không inject Codex CLI fingerprint
  // vì sẽ trigger ChatGPT version-gating khiến model mới bị reject.
  const forwardHeaders = {
    'Content-Type': 'application/json',
    Host: TARGET_HOST
  };
  ['authorization', 'openai-beta'].forEach(h => {
    if (req.headers[h]) forwardHeaders[h] = req.headers[h];
  });

  const upstreamReq = https.request({
    host: TARGET_HOST,
    port: 443,
    path: TARGET_PATH,
    method: 'POST',
    headers: forwardHeaders
  }, (upstreamRes) => {
    console.log('[PROXY]', upstreamRes.statusCode, upstreamRes.headers['content-type'] || '?');
    res.writeHead(upstreamRes.statusCode, upstreamRes.headers);
    upstreamRes.pipe(res);
  });

  upstreamReq.on('error', (err) => {
    console.error('[UPSTREAM ERROR]', err.message);
    sendErr(502, 'Upstream error: ' + err.message);
  });

  req.pipe(upstreamReq);
});

server.listen(PORT, '0.0.0.0', () => {
  console.log('────────────────────────────────────────────────────────────');
  console.log(' HC Agency ChatGPT proxy đang chạy ở http://0.0.0.0:' + PORT);
  console.log(' Health check:  curl http://localhost:' + PORT + '/healthz');
  console.log(' Bước tiếp:     ngrok http ' + PORT);
  console.log(' Copy URL ngrok → set env CHATGPT_PROXY_URL trên Vercel');
  console.log(' Set env HC_PROXY_SECRET trên Vercel = secret hiện tại');
  console.log('────────────────────────────────────────────────────────────');
});
