// HC Agency Dashboard — Telegram bot webhook
// Triển khai dưới dạng Vercel Serverless Function tại /api/telegram

const { createClient } = require('@supabase/supabase-js');

// ═══ ENV ═══
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_WEBHOOK_SECRET = process.env.TELEGRAM_WEBHOOK_SECRET || '';
const ALLOWED_CHAT_IDS = (process.env.TELEGRAM_ALLOWED_CHAT_IDS || '')
  .split(',').map(function(s){return s.trim();}).filter(Boolean);
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini';
const META_TOKEN = process.env.META_TOKEN || '';
const GRAPH_BASE = 'https://graph.facebook.com/v25.0/';

// ═══ HELPERS ═══
function vnDateStr(offsetMs) {
  const d = new Date();
  const u = d.getTime() + d.getTimezoneOffset() * 60000 + 25200000 + (offsetMs || 0);
  const v = new Date(u);
  return v.getFullYear() + '-' + ('0' + (v.getMonth() + 1)).slice(-2) + '-' + ('0' + v.getDate()).slice(-2);
}
function fm(n) { return (n || 0).toLocaleString('vi-VN'); }
function shortMoney(n) {
  n = n || 0;
  if (n >= 1000000) return (n / 1000000).toFixed(1).replace(/\.0$/, '') + 'tr';
  if (n >= 1000) return Math.round(n / 1000) + 'K';
  return String(n);
}

const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

// ═══ TELEGRAM API ═══
async function sendMessage(chatId, text, opts) {
  opts = opts || {};
  const body = {
    chat_id: chatId,
    text: text,
    parse_mode: 'HTML',
    disable_web_page_preview: true
  };
  if (opts.reply_to_message_id) body.reply_to_message_id = opts.reply_to_message_id;
  const resp = await fetch('https://api.telegram.org/bot' + TELEGRAM_BOT_TOKEN + '/sendMessage', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  if (!resp.ok) {
    const errText = await resp.text();
    console.error('[Telegram sendMessage]', resp.status, errText);
  }
}

// ═══ DATA QUERIES ═══
async function getActiveClients() {
  const { data, error } = await sb.from('client').select('*').eq('status', 'active');
  if (error) throw new Error('client: ' + error.message);
  return data || [];
}
async function getAdAccounts() {
  const { data, error } = await sb.from('ad_account').select('*');
  if (error) throw new Error('ad_account: ' + error.message);
  return data || [];
}
async function getStaff() {
  const { data, error } = await sb.from('staff').select('*').eq('is_active', true);
  if (error) throw new Error('staff: ' + error.message);
  return data || [];
}
async function getAssignments() {
  const { data, error } = await sb.from('assignment').select('*');
  if (error) throw new Error('assignment: ' + error.message);
  return data || [];
}
async function getDailySpend(sinceDate) {
  const { data, error } = await sb.from('daily_spend').select('*').gte('report_date', sinceDate);
  if (error) throw new Error('daily_spend: ' + error.message);
  return data || [];
}
async function getDeposits(sinceMonth) {
  // sinceMonth: 'YYYY-MM-01'
  const { data, error } = await sb.from('client_deposit').select('*').gte('deposit_date', sinceMonth);
  if (error) throw new Error('client_deposit: ' + error.message);
  return data || [];
}

// Match daily_spend row → client_id
function resolveClientForSpend(d, ads, assigns) {
  if (d.matched_client_id) return d.matched_client_id;
  const acc = ads.find(function(a){return a.id === d.ad_account_id;});
  if (!acc) return null;
  const asgn = assigns.find(function(a){
    return a.ad_account_id === d.ad_account_id
      && a.start_date <= d.report_date
      && (!a.end_date || a.end_date >= d.report_date);
  });
  return (asgn && asgn.client_id) || acc.client_id || null;
}
function resolveStaffForSpend(d, assigns) {
  if (d.staff_id) return d.staff_id;
  const asgn = assigns.find(function(a){
    return a.ad_account_id === d.ad_account_id
      && a.start_date <= d.report_date
      && (!a.end_date || a.end_date >= d.report_date);
  });
  return (asgn && asgn.staff_id) || null;
}

// ═══ COMMANDS ═══
function helpText() {
  return [
    '<b>🤖 HC Agency Bot</b>',
    '',
    '<b>📊 Báo cáo:</b>',
    '/chitieu — Chi tiêu hôm nay theo nhân sự',
    '/canhbao — TKQC sắp hết tiền (≥80%)',
    '/canthu — Khách chưa thanh toán + đã gửi phiếu',
    '',
    '<b>🚀 Auto Ads:</b>',
    '/setads &lt;preset&gt; &lt;budget&gt; &lt;url&gt; — tạo ad nhanh',
    'Hoặc nhắn đa dòng:',
    '<code>Sét Ads:',
    'https://facebook.com/.../posts/...',
    'Công thức: A1',
    'Ngân sách: 200K',
    'TKQC: 9326</code>',
    '',
    '/luupreset &lt;tên&gt; &lt;campaign_id&gt; — clone công thức từ campaign cũ',
    '/presets — Xem tất cả công thức',
    '',
    '<b>⏸ Tắt ads:</b>',
    '<code>Tắt Ads',
    'Campaign: 12024...',
    'Ad: 12024...</code>',
    '/tatads &lt;campaign_id|link&gt; — tắt campaign',
    '/batads &lt;campaign_id|link&gt; — bật lại campaign',
    '/nsads &lt;campaign_id|link&gt; &lt;budget&gt; — đặt ngân sách/ngày',
    '/tangns &lt;campaign_id|link&gt; &lt;budget&gt; — tăng ngân sách/ngày',
    '/giamns &lt;campaign_id|link&gt; &lt;budget&gt; — giảm ngân sách/ngày',
    '',
    '<b>🤖 Tự nhiên:</b>',
    'Gõ thẳng câu hỏi → AI trả lời theo data.',
    '',
    '<i>Budget hiểu: 200K · 200000 · 1tr · 1tr5 · 200.000</i>'
  ].join('\n');
}

async function spendToday() {
  const today = vnDateStr(0);
  const [staff, ads, assigns, daily] = await Promise.all([
    getStaff(), getAdAccounts(), getAssignments(), getDailySpend(today)
  ]);
  const todayRows = daily.filter(function(d){return d.report_date === today;});
  if (!todayRows.length) {
    return '<b>📊 Chi tiêu hôm nay (' + today + ')</b>\n\n<i>Chưa có data. Có thể Meta chưa sync, vào dashboard bấm Sync.</i>';
  }
  const byStaff = {};
  staff.forEach(function(s){byStaff[s.id] = {name: s.short_name || s.full_name, total: 0};});
  byStaff['_unassigned'] = {name: '— Chưa gán —', total: 0};
  let total = 0;
  todayRows.forEach(function(d){
    const sid = resolveStaffForSpend(d, assigns) || '_unassigned';
    if (!byStaff[sid]) byStaff[sid] = {name: 'Khác', total: 0};
    byStaff[sid].total += Number(d.spend_amount) || 0;
    total += Number(d.spend_amount) || 0;
  });
  const arr = Object.values(byStaff).filter(function(x){return x.total > 0;}).sort(function(a,b){return b.total - a.total;});
  const lines = ['<b>📊 Chi tiêu hôm nay (' + today + ')</b>', ''];
  arr.forEach(function(x){
    lines.push('• <b>' + x.name + '</b>: ' + fm(x.total));
  });
  lines.push('');
  lines.push('<b>Tổng:</b> ' + fm(total));
  return lines.join('\n');
}

async function balanceAlerts() {
  const ads = await getAdAccounts();
  const alerts = ads.filter(function(a){
    return a.spend_cap && a.amount_spent >= 0 && a.amount_spent <= a.spend_cap
      && (a.amount_spent / a.spend_cap) >= 0.8 && (a.account_status || 1) === 1;
  }).map(function(a){
    return {
      name: a.account_name || a.fb_account_id,
      spent: a.amount_spent,
      cap: a.spend_cap,
      pct: Math.round(a.amount_spent / a.spend_cap * 100),
      remain: a.spend_cap - a.amount_spent
    };
  }).sort(function(x,y){return y.pct - x.pct;});
  if (!alerts.length) return '<b>✅ Cảnh báo TKQC</b>\n\nKhông có TKQC nào sắp hết tiền (≥80%).';
  const lines = ['<b>⚠ TKQC sắp hết tiền (' + alerts.length + ')</b>', ''];
  alerts.slice(0, 15).forEach(function(a){
    lines.push('• <b>' + a.name + '</b> — ' + a.pct + '% (còn ' + shortMoney(a.remain) + ')');
  });
  if (alerts.length > 15) lines.push('\n<i>... và ' + (alerts.length - 15) + ' tài khoản khác</i>');
  return lines.join('\n');
}

async function unpaidClients() {
  const clients = await getActiveClients();
  const due = clients.filter(function(c){return c.payment_status !== 'paid';});
  if (!due.length) return '<b>✅ Cần thu</b>\n\nTất cả khách đã thanh toán.';
  const sent = due.filter(function(c){return c.payment_status === 'invoice_sent';});
  const unpaid = due.filter(function(c){return c.payment_status !== 'invoice_sent';});
  const lines = ['<b>💰 Cần thu (' + due.length + ' khách)</b>', ''];
  if (sent.length) {
    lines.push('<b>✉ Đã gửi phiếu — chờ chuyển:</b>');
    sent.forEach(function(c){lines.push('• ' + c.name);});
    lines.push('');
  }
  if (unpaid.length) {
    lines.push('<b>🔘 Chưa gửi phiếu:</b>');
    unpaid.forEach(function(c){lines.push('• ' + c.name);});
  }
  return lines.join('\n');
}

// ═══ AI: BUILD CONTEXT + CALL OPENAI ═══
async function buildContextSummary() {
  const today = vnDateStr(0);
  const monthKey = today.substring(0, 7);
  const monthStart = monthKey + '-01';
  const [staff, clients, ads, assigns, daily, deposits] = await Promise.all([
    getStaff(), getActiveClients(), getAdAccounts(), getAssignments(),
    getDailySpend(monthStart), getDeposits(monthStart)
  ]);

  const lines = [];
  lines.push('Dữ liệu HC Agency — ' + today + ' (kỳ ' + monthKey + ')');
  lines.push('Số nhân sự: ' + staff.length + ', khách hàng active: ' + clients.length + ', tài khoản QC: ' + ads.length);
  lines.push('');

  // Spend per staff this month
  const byStaff = {};
  staff.forEach(function(s){byStaff[s.id] = {name: s.short_name || s.full_name, total: 0, budget: s.monthly_budget || 0};});
  let totalSpend = 0;
  daily.forEach(function(d){
    const sid = resolveStaffForSpend(d, assigns);
    if (sid && byStaff[sid]) byStaff[sid].total += Number(d.spend_amount) || 0;
    totalSpend += Number(d.spend_amount) || 0;
  });
  lines.push('NHÂN SỰ (chi tiêu tháng):');
  Object.values(byStaff).forEach(function(s){
    const pct = s.budget ? Math.round(s.total / s.budget * 100) : 0;
    lines.push('- ' + s.name + ': ' + fm(s.total) + (s.budget ? ' / ngân sách ' + fm(s.budget) + ' (' + pct + '%)' : ''));
  });
  lines.push('Tổng spend tháng: ' + fm(totalSpend));
  lines.push('');

  // Spend per client + payment status
  const byClient = {};
  clients.forEach(function(c){byClient[c.id] = {name: c.name, payment: c.payment_status || 'unpaid', has_vat: !!c.has_vat, fee: c.service_fee || 0, spend: 0};});
  daily.forEach(function(d){
    const cid = resolveClientForSpend(d, ads, assigns);
    if (cid && byClient[cid]) byClient[cid].spend += Number(d.spend_amount) || 0;
  });
  const clientArr = Object.values(byClient).filter(function(c){return c.spend > 0 || c.payment !== 'paid';}).sort(function(a,b){return b.spend - a.spend;});
  lines.push('KHÁCH HÀNG (top 20 theo spend tháng):');
  clientArr.slice(0, 20).forEach(function(c){
    const ps = c.payment === 'paid' ? 'đã thanh toán' : (c.payment === 'invoice_sent' ? 'đã gửi phiếu' : 'chưa thanh toán');
    lines.push('- ' + c.name + ': spend ' + fm(c.spend) + ', phí ' + fm(c.fee) + ', ' + ps + (c.has_vat ? ', VAT' : ''));
  });
  lines.push('');

  // Balance alerts
  const balAlerts = ads.filter(function(a){
    return a.spend_cap && a.amount_spent >= 0 && a.amount_spent <= a.spend_cap
      && (a.amount_spent / a.spend_cap) >= 0.8 && (a.account_status || 1) === 1;
  });
  if (balAlerts.length) {
    lines.push('CẢNH BÁO TKQC SẮP HẾT TIỀN (' + balAlerts.length + '):');
    balAlerts.forEach(function(a){
      const pct = Math.round(a.amount_spent / a.spend_cap * 100);
      lines.push('- ' + (a.account_name || a.fb_account_id) + ': ' + pct + '% (còn ' + shortMoney(a.spend_cap - a.amount_spent) + ')');
    });
    lines.push('');
  }

  // Deposits this month
  if (deposits.length) {
    const depByClient = {};
    deposits.forEach(function(d){
      const c = clients.find(function(x){return x.id === d.client_id;});
      const name = c ? c.name : '?';
      depByClient[name] = (depByClient[name] || 0) + (Number(d.amount) || 0);
    });
    lines.push('NẠP TIỀN THÁNG:');
    Object.keys(depByClient).forEach(function(name){
      lines.push('- ' + name + ': ' + fm(depByClient[name]));
    });
  }

  return lines.join('\n');
}

async function askAI(question) {
  if (!OPENAI_API_KEY) {
    return [
      '🤖 <b>Tôi chưa hiểu lệnh này.</b>',
      '',
      'Các lệnh khả dụng:',
      '• <b>📊 Báo cáo:</b> /chitieu · /canhbao · /canthu',
      '• <b>🚀 Auto Ads:</b> /setads · /luupreset · /presets',
      '• <b>🆔 Khác:</b> /myid · /help',
      '',
      '<i>AI Q&A chưa kích hoạt (admin cần set OPENAI_API_KEY).</i>'
    ].join('\n');
  }
  const context = await buildContextSummary();
  const systemPrompt = 'Bạn là trợ lý của HC Agency (agency Facebook Ads VN). Trả lời ngắn gọn, dùng tiếng Việt, bullet/số liệu cụ thể. Dữ liệu dashboard hiện tại:\n\n' + context;
  const resp = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + OPENAI_API_KEY
    },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      messages: [
        {role: 'system', content: systemPrompt},
        {role: 'user', content: question}
      ],
      max_completion_tokens: 1200
    })
  });
  const data = await resp.json();
  if (data.error) return '❌ Lỗi AI: ' + data.error.message;
  const text = data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
  return text || '❌ AI không trả lời.';
}

// ═══════════════════════════════════════════════════════════════
// AUTO ADS (Telegram Set Ads) — port từ submitSetAds ở app.js
// ═══════════════════════════════════════════════════════════════

// ─── Meta Graph API helper (Node-side, dùng META_TOKEN env trực tiếp) ───
// customToken: dùng page access token thay vì META_TOKEN (cần cho /<page_id>/feed)
async function metaApi(method, path, payload, customToken) {
  const token = customToken || META_TOKEN;
  if (!token) throw new Error('META_TOKEN chưa cấu hình ở Vercel env');
  const url = GRAPH_BASE + path.replace(/^\/+/, '');
  const init = {
    method: method,
    headers: { 'Content-Type': 'application/json' }
  };
  const body = Object.assign({}, payload || {}, { access_token: token });
  if (method === 'GET') {
    const qs = new URLSearchParams();
    Object.keys(body).forEach(function(k){
      const v = body[k];
      qs.append(k, typeof v === 'object' ? JSON.stringify(v) : String(v));
    });
    const fullUrl = url + (url.indexOf('?') >= 0 ? '&' : '?') + qs.toString();
    const r = await fetch(fullUrl);
    return await r.json();
  } else {
    const parts = [];
    Object.keys(body).forEach(function(k){
      const v = body[k];
      if (v === undefined || v === null) return;
      const sv = typeof v === 'object' ? JSON.stringify(v) : String(v);
      parts.push(encodeURIComponent(k) + '=' + encodeURIComponent(sv));
    });
    init.headers = { 'Content-Type': 'application/x-www-form-urlencoded' };
    init.body = parts.join('&');
    const r = await fetch(url, init);
    return await r.json();
  }
}

// ─── Lấy page access token (cần cho /<page_id>/feed read) ───
// Yêu cầu META_TOKEN có pages_show_list + system user phải được gán làm admin/editor của Page.
async function getPageAccessToken(pageId) {
  const r = await metaApi('GET', 'me/accounts', { fields: 'id,name,access_token', limit: 100 });
  if (r.error || !r.data) return null;
  const page = r.data.find(function(p){ return p.id === pageId; });
  return page ? page.access_token : null;
}

// ─── Resolve pfbid → numeric post ID bằng HTML scrape ───
// Thử nhiều User-Agent + Mobile URL fallback để bypass Facebook anti-bot từ Vercel IP.
async function resolvePfbidFromHtml(postUrl) {
  const tryFetch = async (url, ua) => {
    try {
      const r = await fetch(url, {
        headers: {
          'User-Agent': ua,
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'vi-VN,vi;q=0.9,en-US;q=0.8,en;q=0.7',
          'Accept-Encoding': 'gzip, deflate, br',
          'Cache-Control': 'no-cache',
          'Pragma': 'no-cache',
          'Sec-Fetch-Dest': 'document',
          'Sec-Fetch-Mode': 'navigate',
          'Sec-Fetch-Site': 'none'
        },
        redirect: 'follow'
      });
      if (!r.ok) {
        console.warn('[pfbid] HTTP', r.status, 'for', url.substring(0, 60));
        return null;
      }
      const html = await r.text();
      let m = html.match(/property="og:url"\s+content="[^"]*\/posts\/[^"\/]+\/(\d+)\/?"/);
      if (m) return m[1];
      m = html.match(/property="og:url"\s+content="[^"]*\/posts\/(\d+)/);
      if (m) return m[1];
      // Mobile fallback patterns
      m = html.match(/[?&]story_fbid=(\d+)/);
      if (m) return m[1];
      m = html.match(/"top_level_post_id":"(\d+)"/);
      if (m) return m[1];
      return null;
    } catch (e) {
      console.warn('[pfbid] fetch error:', e.message);
      return null;
    }
  };

  const userAgents = [
    // 1. Facebook crawler — thường được phép pass anti-bot
    'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)',
    // 2. Real Chrome desktop
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    // 3. iPhone Safari (mobile site thân thiện hơn)
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'
  ];

  // Thử desktop URL với từng UA
  for (const ua of userAgents) {
    const id = await tryFetch(postUrl, ua);
    if (id) return id;
  }
  // Fallback: thử mobile URL m.facebook.com
  const mUrl = postUrl.replace(/^https?:\/\/(www\.)?facebook\.com/, 'https://m.facebook.com');
  if (mUrl !== postUrl) {
    for (const ua of userAgents) {
      const id = await tryFetch(mUrl, ua);
      if (id) return id;
    }
  }
  return null;
}

// ─── Format Meta error đầy đủ (Meta trả nhiều field: code, subcode, user_msg) ───
function formatMetaError(err) {
  if (!err) return 'unknown';
  if (typeof err === 'string') return err;
  var parts = [];
  parts.push(err.message || 'Invalid');
  if (err.code) parts.push('code=' + err.code);
  if (err.error_subcode) parts.push('sub=' + err.error_subcode);
  if (err.error_user_title) parts.push('"' + err.error_user_title + '"');
  if (err.error_user_msg) parts.push('→ ' + err.error_user_msg);
  if (err.fbtrace_id) parts.push('trace=' + err.fbtrace_id);
  return parts.join(' · ');
}

// ─── Parse budget linh hoạt: "200K", "200.000", "200000", "200tr", "1tr5" ───
function parseBudget(str) {
  if (typeof str === 'number') return Math.round(str);
  if (!str) return 0;
  let s = String(str).trim().toLowerCase().replace(/\s+/g, '').replace(/[.,](?=\d{3}\b)/g, '');
  // "1tr5" → 1500000, "200tr" → 200000000, "200k" → 200000
  const trMatch = s.match(/^(\d+(?:[.,]\d+)?)tr(\d*)$/);
  if (trMatch) {
    const main = parseFloat(trMatch[1].replace(',', '.'));
    const dec = trMatch[2] ? parseFloat('0.' + trMatch[2]) : 0;
    return Math.round((main + dec) * 1000000);
  }
  const mMatch = s.match(/^(\d+(?:[.,]\d+)?)m$/);
  if (mMatch) return Math.round(parseFloat(mMatch[1].replace(',', '.')) * 1000000);
  const kMatch = s.match(/^(\d+(?:[.,]\d+)?)k$/);
  if (kMatch) return Math.round(parseFloat(kMatch[1].replace(',', '.')) * 1000);
  const n = parseInt(s.replace(/[^\d]/g, ''), 10);
  return isNaN(n) ? 0 : n;
}

// ─── Parse post URL/ID từ Facebook ───
function parsePostId(input) {
  if (!input) return null;
  let s = String(input).trim();
  // Pure numeric ID
  if (/^\d+$/.test(s)) return s;
  // page_post format: 123_456
  if (/^\d+_\d+$/.test(s)) return s;
  // URL formats
  let m = s.match(/\/posts\/(\d+)/);
  if (m) return m[1];
  m = s.match(/\/posts\/(pfbid[A-Za-z0-9]+)/);
  if (m) return m[1];
  m = s.match(/[?&]story_fbid=(\d+)/);
  if (m) return m[1];
  m = s.match(/[?&]fbid=(\d+)/);
  if (m) return m[1];
  // pfbid token bare
  if (/^pfbid[A-Za-z0-9]+$/.test(s)) return s;
  return null;
}

// ─── Parse campaign ID từ ID thô hoặc link Ads Manager ───
function parseCampaignId(input) {
  if (!input) return null;
  const s = String(input).trim();
  let m = s.match(/[?&]selected_campaign_ids=(\d+)/);
  if (m) return m[1];
  m = s.match(/[?&]campaign_id=(\d+)/);
  if (m) return m[1];
  m = s.match(/(?:campaign|camp|chien\s*dich|chiến\s*dịch)\s*[:#-]?\s*(\d{8,})/i);
  if (m) return m[1];
  m = s.match(/\b(\d{8,})\b/);
  return m ? m[1] : null;
}

function parseAdId(input) {
  if (!input) return null;
  const s = String(input).trim();
  let m = s.match(/[?&]selected_ad_ids=(\d+)/);
  if (m) return m[1];
  m = s.match(/[?&]ad_id=(\d+)/);
  if (m) return m[1];
  m = s.match(/(?:^|\n|[\s•-])ad\s*[:#-]?\s*(\d{8,})/i);
  return m ? m[1] : null;
}

function normalizeLookupText(v) {
  return String(v || '').toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '');
}

function parseAccountHint(raw) {
  if (!raw) return null;
  let s = String(raw).trim();
  s = s.replace(/^(?:tkqc|tk|account|ad_account|tai\s*khoan|tài\s*khoản)\s*[:=]?\s*/i, '').trim();
  return s || null;
}

async function resolveAdAccountOverride(hint) {
  hint = parseAccountHint(hint);
  if (!hint) return { account: null };
  const accounts = await getAdAccounts();
  const mapped = accounts.filter(function(a){ return a.fb_account_id; });
  const needle = normalizeLookupText(hint);
  const digitNeedle = String(hint).replace(/[^\d]/g, '');
  const matches = mapped.filter(function(a){
    const fb = String(a.fb_account_id || '');
    const fbNum = fb.replace(/^act_/, '');
    const name = String(a.account_name || '');
    return normalizeLookupText(fb) === needle
      || normalizeLookupText(fbNum) === needle
      || (digitNeedle && fbNum.endsWith(digitNeedle))
      || normalizeLookupText(name).indexOf(needle) >= 0;
  });
  if (!matches.length) return { error: 'Không tìm thấy TKQC khớp với "' + hint + '". Dùng act_id, ID số, hoặc đoạn tên/suffix trong dashboard.' };
  if (matches.length > 1) {
    const lines = ['Tìm thấy nhiều TKQC khớp "' + hint + '", nhập rõ hơn:'];
    matches.slice(0, 8).forEach(function(a){
      lines.push('• ' + (a.account_name || a.fb_account_id) + ' — <code>' + a.fb_account_id + '</code>');
    });
    if (matches.length > 8) lines.push('• ... +' + (matches.length - 8) + ' tài khoản khác');
    return { error: lines.join('\n') };
  }
  return { account: matches[0] };
}

// ─── Parse lệnh "Sét Ads" (multi-line) hoặc "/setads A1 200K <url>" (1 dòng) ───
function parseSetAdsCommand(text) {
  const t = String(text || '').trim();
  // Format 1: /setads <preset> <budget> <url> [tkqc]
  const oneLineMatch = t.match(/^\/setads\s+(\S+)\s+(\S+)\s+(\S+)(?:\s+(.+))?$/i);
  if (oneLineMatch) {
    return {
      preset: oneLineMatch[1],
      budget: parseBudget(oneLineMatch[2]),
      postInput: oneLineMatch[3],
      accountHint: parseAccountHint(oneLineMatch[4])
    };
  }
  // Format 2: multi-line "Sét Ads:\n<url>\nCông thức: A1\nNgân sách: 200K\nTKQC: 9326"
  if (!/sét\s*ads/i.test(t) && !/set\s*ads/i.test(t)) return null;
  const lines = t.split('\n').map(function(x){return x.trim();}).filter(Boolean);
  let postInput = null, preset = null, budget = null, accountHint = null;
  lines.forEach(function(line){
    if (/^https?:\/\//i.test(line) || /^pfbid/i.test(line) || /^\d+(_\d+)?$/.test(line)) {
      postInput = line;
    } else {
      const m1 = line.match(/^(?:công\s*thức|preset|formula)\s*[:=]\s*(\S+)/i);
      if (m1) preset = m1[1];
      const m2 = line.match(/^(?:ngân\s*sách|budget|ns)\s*[:=]\s*(\S+)/i);
      if (m2) budget = parseBudget(m2[1]);
      const m3 = line.match(/^(?:tkqc|tk|account|ad_account|tài\s*khoản|tai\s*khoan)\s*[:=]\s*(.+)$/i);
      if (m3) accountHint = parseAccountHint(m3[1]);
    }
  });
  if (!preset || !budget || !postInput) return null;
  return { preset: preset, budget: budget, postInput: postInput, accountHint: accountHint };
}

// ─── DB: lấy preset theo tên ───
async function getPreset(name) {
  const { data, error } = await sb.from('auto_ads_preset').select('*').eq('name', name).maybeSingle();
  if (error) throw new Error('preset: ' + error.message);
  return data;
}
async function listPresets() {
  const { data, error } = await sb.from('auto_ads_preset').select('name,page_id,ad_account_id,default_budget,source_page_name,source_account_name,note,updated_at').order('updated_at',{ascending:false});
  if (error) throw new Error('list preset: ' + error.message);
  return data || [];
}
async function insertAutoAdsLog(row) {
  try { await sb.from('auto_ads_log').insert(row); }
  catch (e) { console.error('[auto_ads_log] insert fail:', e.message); }
}

// ─── Core: tạo 4-step Meta campaign từ preset + post + budget ───
async function createAdsFromPreset(preset, postId, postUrl, budget, source, chatId, opts) {
  opts = opts || {};
  const log = { source: source, chat_id: chatId, preset_name: preset.name, post_id: postId, post_url: postUrl, budget: budget, status: 'pending' };
  try {
    const actPath = (opts.account && opts.account.fb_account_id) || preset.ad_account_id; // act_xxx
    const pageId = preset.page_id;
    const dest = preset.destination_type || 'MESSENGER';
    const targeting = Object.assign({}, preset.targeting || {});
    if (!targeting.geo_locations || !Object.keys(targeting.geo_locations).length) {
      targeting.geo_locations = { countries: ['VN'] };
    }
    if (!targeting.age_min) targeting.age_min = 18;
    if (!targeting.age_max) targeting.age_max = 65;

    // ─── Resolve post_id: pfbid → numeric ID qua Page Feed search ───
    // Meta object_story_id cần dạng <page_id>_<numeric_post_id>, KHÔNG nhận pfbid.
    // GET /pfbid bị deprecated v2.4+. URL Sharing API bị block bởi policy "FB URLs cannot be crawled".
    // → Cách duy nhất: list /<page_id>/feed, match pfbid trong permalink_url của từng post.
    let resolvedPostId = postId;
    if (/^pfbid/i.test(postId)) {
      if (!postUrl || !/^https?:\/\//i.test(postUrl)) {
        throw { step: 'creative', msg: 'Cần URL Facebook đầy đủ (https://...). Paste cả link, không chỉ pfbid token.' };
      }
      resolvedPostId = await resolvePfbidFromHtml(postUrl);
      if (!resolvedPostId) {
        throw { step: 'creative', msg: 'Không resolve được pfbid → numeric ID. Workaround: copy URL từ Meta Business Suite (có dạng /posts/<số>/) hoặc paste trực tiếp ID số.' };
      }
    }
    // object_story_id format
    let storyId;
    if (/^\d+_\d+$/.test(resolvedPostId)) storyId = resolvedPostId;
    else storyId = pageId + '_' + resolvedPostId;

    // STEP 1: Campaign
    const campName = '[' + preset.name + '] ' + new Date().toISOString().substring(0, 10);
    const campRes = await metaApi('POST', actPath + '/campaigns', {
      name: campName,
      objective: 'OUTCOME_ENGAGEMENT',
      special_ad_categories: [],
      status: 'ACTIVE',
      buying_type: 'AUCTION',
      is_adset_budget_sharing_enabled: false  // false = budget ở adset level (cần khai báo từ Meta API v22+)
    });
    if (campRes.error) throw { step: 'campaign', msg: formatMetaError(campRes.error) };
    if (!campRes.id) throw { step: 'campaign', msg: 'Không trả về campaign_id' };
    log.campaign_id = campRes.id;

    // STEP 2: Adset
    const adsetRes = await metaApi('POST', actPath + '/adsets', {
      name: campName + ' - Adset',
      campaign_id: campRes.id,
      daily_budget: budget,
      billing_event: 'IMPRESSIONS',
      optimization_goal: 'CONVERSATIONS',
      bid_strategy: 'LOWEST_COST_WITHOUT_CAP',
      destination_type: dest,
      promoted_object: { page_id: pageId },
      targeting: targeting,
      status: 'ACTIVE'
    });
    if (adsetRes.error) throw { step: 'adset', msg: formatMetaError(adsetRes.error) };
    if (!adsetRes.id) throw { step: 'adset', msg: 'Không trả về adset_id' };
    log.adset_id = adsetRes.id;

    // STEP 3: Creative
    const crRes = await metaApi('POST', actPath + '/adcreatives', {
      name: campName + ' - Creative',
      object_story_id: storyId
    });
    if (crRes.error) throw { step: 'creative', msg: formatMetaError(crRes.error) };
    if (!crRes.id) throw { step: 'creative', msg: 'Không trả về creative_id' };
    log.creative_id = crRes.id;

    // STEP 4: Ad
    const adRes = await metaApi('POST', actPath + '/ads', {
      name: campName + ' - Ad',
      adset_id: adsetRes.id,
      creative: { creative_id: crRes.id },
      status: 'ACTIVE'
    });
    if (adRes.error) throw { step: 'ad', msg: formatMetaError(adRes.error) };
    if (!adRes.id) throw { step: 'ad', msg: 'Không trả về ad_id' };
    log.ad_id = adRes.id;

    log.status = 'success';
    await insertAutoAdsLog(log);
    const actNum = actPath.replace('act_', '');
    return {
      success: true,
      campaign_id: campRes.id,
      adset_id: adsetRes.id,
      creative_id: crRes.id,
      ad_id: adRes.id,
      manager_link: 'https://adsmanager.facebook.com/adsmanager/manage/campaigns?act=' + actNum + '&selected_campaign_ids=' + campRes.id
    };
  } catch (err) {
    log.status = 'failed';
    log.error_step = err.step || 'unknown';
    log.error_message = err.msg || err.message || String(err);
    await insertAutoAdsLog(log);
    return { success: false, error: log.error_message, step: log.error_step };
  }
}

// ─── Handle: lệnh /setads / Sét Ads ───
async function handleSetAds(text, chatId) {
  const parsed = parseSetAdsCommand(text);
  if (!parsed) {
    return [
      '❌ Lệnh không hợp lệ. Format:',
      '',
      '<b>Cách 1 (đa dòng):</b>',
      '<code>Sét Ads:',
      'https://facebook.com/.../posts/...',
      'Công thức: A1',
      'Ngân sách: 200K',
      'TKQC: 9326</code>',
      '',
      '<b>Cách 2 (1 dòng):</b>',
      '<code>/setads A1 200K https://facebook.com/.../posts/... 9326</code>'
    ].join('\n');
  }
  const postId = parsePostId(parsed.postInput);
  if (!postId) return '❌ Không nhận diện được post từ: <code>' + parsed.postInput + '</code>';
  if (!parsed.budget || parsed.budget < 50000) return '❌ Ngân sách tối thiểu 50.000đ/ngày (anh nhập: ' + fm(parsed.budget) + 'đ).';

  const preset = await getPreset(parsed.preset);
  if (!preset) return '❌ Không tìm thấy công thức <b>' + parsed.preset + '</b>.\nGõ /presets xem danh sách.';

  const override = await resolveAdAccountOverride(parsed.accountHint);
  if (override.error) return '❌ ' + override.error;
  const runAccountName = override.account
    ? (override.account.account_name || override.account.fb_account_id)
    : (preset.source_account_name || preset.ad_account_id);

  // Reply preview ngay (Telegram không hỗ trợ async streaming, gửi tin riêng rồi update)
  await sendMessage(chatId, [
    '📋 <b>Sét Ads với công thức ' + preset.name + '</b>',
    '• Page: ' + (preset.source_page_name || preset.page_id),
    '• TKQC: ' + runAccountName + (override.account ? ' <i>(override)</i>' : ''),
    '• Đích: ' + (preset.destination_type || 'MESSENGER'),
    '• Ngân sách: ' + fm(parsed.budget) + 'đ/ngày',
    '• Post: <code>' + postId + '</code>',
    '',
    '⏳ Đang tạo Campaign + Adset + Creative + Ad...'
  ].join('\n'));

  const result = await createAdsFromPreset(preset, postId, parsed.postInput, parsed.budget, 'telegram', chatId, { account: override.account });
  if (result.success) {
    return [
      '✅ <b>Hoàn tất! Campaign đang ACTIVE</b>',
      '',
      '• Campaign: <code>' + result.campaign_id + '</code>',
      '• Ad: <code>' + result.ad_id + '</code>',
      '',
      '🔗 <a href="' + result.manager_link + '">Mở Ads Manager</a>'
    ].join('\n');
  } else {
    return [
      '❌ <b>Tạo ads thất bại</b>',
      '',
      'Bước lỗi: <b>' + (result.step || '—') + '</b>',
      'Chi tiết: <code>' + (result.error || 'không rõ') + '</code>'
    ].join('\n');
  }
}

// ─── Handle: /luupreset <tên> <campaign_id|link> — clone campaign cũ → tạo preset ───
async function handleSavePreset(text, chatId) {
  const m = text.trim().match(/^\/luupreset\s+(\S+)\s+(\S+)/i);
  if (!m) return '❌ Format: <code>/luupreset A1 &lt;campaign_id_hoặc_link_AdsManager&gt;</code>';
  const name = m[1];
  let campId = m[2];
  // Extract campaign_id từ link nếu cần
  const linkMatch = campId.match(/selected_campaign_ids=(\d+)/);
  if (linkMatch) campId = linkMatch[1];
  if (!/^\d+$/.test(campId)) return '❌ Campaign ID phải là số. Nếu paste link AdsManager → đảm bảo link có <code>selected_campaign_ids=...</code>';

  // Fetch campaign info + adsets từ Meta
  const camp = await metaApi('GET', campId, { fields: 'id,name,account_id' });
  if (camp.error) return '❌ Không lấy được campaign từ Meta: ' + camp.error.message;
  const adsets = await metaApi('GET', campId + '/adsets', { fields: 'id,name,daily_budget,destination_type,promoted_object,targeting', limit: 1 });
  if (adsets.error) return '❌ Không lấy được adset: ' + adsets.error.message;
  if (!adsets.data || !adsets.data.length) return '❌ Campaign không có adset nào.';
  const adset = adsets.data[0];
  const promotedObj = adset.promoted_object || {};
  const pageId = promotedObj.page_id;
  if (!pageId) return '❌ Adset không có page_id. Campaign này không phải Mess/Form?';

  // Account info để cache tên
  const actId = 'act_' + camp.account_id;
  const accInfo = await metaApi('GET', actId, { fields: 'name' });
  const pageInfo = await metaApi('GET', pageId, { fields: 'name' });

  const payload = {
    name: name,
    page_id: pageId,
    ad_account_id: actId,
    destination_type: adset.destination_type || 'MESSENGER',
    default_budget: parseInt(adset.daily_budget) || 200000,
    targeting: adset.targeting || {},
    source_campaign_id: campId,
    source_page_name: (pageInfo && pageInfo.name) || null,
    source_account_name: (accInfo && accInfo.name) || null
  };

  // Upsert (overwrite nếu name đã tồn tại)
  const { error } = await sb.from('auto_ads_preset').upsert(payload, { onConflict: 'name' });
  if (error) return '❌ Lỗi lưu DB: ' + error.message;

  return [
    '✅ <b>Đã lưu công thức ' + name + '</b>',
    '',
    '• Page: ' + (payload.source_page_name || pageId),
    '• TKQC: ' + (payload.source_account_name || actId),
    '• Đích: ' + payload.destination_type,
    '• Ngân sách mặc định: ' + fm(payload.default_budget) + 'đ/ngày',
    '• Source: <code>' + campId + '</code>',
    '',
    'Giờ có thể dùng: <code>Sét Ads:</code> với công thức <b>' + name + '</b>'
  ].join('\n');
}

// ─── Parse lệnh tắt: "Tắt Ads\nCampaign: 123\nAd: 456" hoặc "/tatads 123 456" ───
function parsePauseAdsCommand(text) {
  const t = String(text || '').trim();
  if (!/^tắt\s*ads/i.test(t) && !/^turn\s*off\s*ads/i.test(t) && !/^\/tatads\b/i.test(t)) return null;
  const ids = { campaign_id: null, adset_id: null, ad_id: null };
  // Format đa dòng "Campaign: 123\nAd: 456"
  const campM = t.match(/campaign\s*[:=]\s*(\d+)/i);
  if (campM) ids.campaign_id = campM[1];
  const adsetM = t.match(/adset\s*[:=]\s*(\d+)/i);
  if (adsetM) ids.adset_id = adsetM[1];
  const adM = t.match(/(?:^|[^a-z_])ad\s*[:=]\s*(\d+)/i);
  if (adM) ids.ad_id = adM[1];
  // Format 1 dòng "/tatads <id1> <id2> ..."
  if (!ids.campaign_id && !ids.adset_id && !ids.ad_id) {
    const nums = t.match(/\d{8,}/g) || [];
    if (nums.length) ids.campaign_id = nums[0]; // assume first ID is campaign
    if (nums.length > 1) ids.ad_id = nums[1];
  }
  if (!ids.campaign_id && !ids.adset_id && !ids.ad_id) return null;
  return ids;
}

async function handlePauseAds(text, chatId) {
  const parsed = parsePauseAdsCommand(text);
  if (!parsed) {
    return [
      '❌ Lệnh không hợp lệ. Format:',
      '',
      '<code>Tắt Ads',
      'Campaign: 120249724924720404',
      'Ad: 120249724925480404</code>',
      '',
      'Hoặc dùng /tatads &lt;campaign_id&gt; &lt;ad_id&gt;'
    ].join('\n');
  }
  await sendMessage(chatId, '⏳ Đang tắt qua Meta API...');
  const tasks = [];
  if (parsed.campaign_id) tasks.push({ key: 'Campaign', id: parsed.campaign_id });
  if (parsed.adset_id) tasks.push({ key: 'Adset', id: parsed.adset_id });
  if (parsed.ad_id) tasks.push({ key: 'Ad', id: parsed.ad_id });

  const results = [];
  for (const t of tasks) {
    try {
      const r = await metaApi('POST', t.id, { status: 'PAUSED' });
      if (r.error) {
        results.push({ ...t, ok: false, error: formatMetaError(r.error) });
      } else if (r.success === false) {
        results.push({ ...t, ok: false, error: 'Meta không xác nhận thành công' });
      } else {
        results.push({ ...t, ok: true });
      }
    } catch (e) {
      results.push({ ...t, ok: false, error: e.message || String(e) });
    }
  }

  const ok = results.filter(r => r.ok);
  const fail = results.filter(r => !r.ok);
  const lines = [];
  if (ok.length === tasks.length) {
    lines.push('✅ <b>Đã tắt ' + ok.length + '/' + tasks.length + ' đối tượng</b>');
  } else if (ok.length) {
    lines.push('⚠️ Tắt ' + ok.length + '/' + tasks.length + ' đối tượng (có lỗi)');
  } else {
    lines.push('❌ <b>Tắt thất bại</b>');
  }
  lines.push('');
  results.forEach(r => {
    lines.push('• ' + r.key + ': <code>' + r.id + '</code> ' + (r.ok ? '✅ PAUSED' : '❌ ' + r.error));
  });
  return lines.join('\n');
}

// ─── Handle: /presets — list tất cả preset ───
async function handleListPresets() {
  const list = await listPresets();
  if (!list.length) return '<b>📋 Công thức Auto Ads</b>\n\n<i>Chưa có. Tạo bằng /luupreset.</i>';
  const lines = ['<b>📋 Công thức Auto Ads (' + list.length + ')</b>', ''];
  list.forEach(function(p){
    lines.push('• <b>' + p.name + '</b> — ' + fm(p.default_budget) + 'đ/ngày');
    lines.push('  Page: ' + (p.source_page_name || p.page_id) + ' · TKQC: ' + (p.source_account_name || p.ad_account_id));
    if (p.note) lines.push('  📝 ' + p.note);
  });
  return lines.join('\n');
}

async function updateMetaObjectStatus(type, id, name, nextStatus) {
  const updated = await metaApi('POST', id, { status: nextStatus });
  if (updated.error) {
    return { type: type, id: id, name: name, ok: false, error: formatMetaError(updated.error) };
  }
  if (updated.success === false) {
    return { type: type, id: id, name: name, ok: false, error: 'Meta trả success=false' };
  }
  return { type: type, id: id, name: name, ok: true };
}

function formatStatusLine(type, obj) {
  if (!obj) return '• ' + type + ': không có dữ liệu';
  return '• ' + type + ' ' + (obj.name || obj.id || '—')
    + ': status=<b>' + (obj.status || '—') + '</b>'
    + ', effective=<b>' + (obj.effective_status || '—') + '</b>'
    + (obj.id ? ' · <code>' + obj.id + '</code>' : '');
}

async function handleCheckAdsStatus(text) {
  const campaignId = parseCampaignId(text);
  const explicitAdId = parseAdId(text);
  if (!campaignId) {
    return [
      '❌ Format: <code>/checkads &lt;campaign_id_hoặc_link_AdsManager&gt;</code>',
      '',
      'Ví dụ:',
      '<code>/checkads 120249724924720404</code>'
    ].join('\n');
  }

  const camp = await metaApi('GET', campaignId, { fields: 'id,name,status,effective_status' });
  if (camp.error) return '❌ Không đọc được campaign: <code>' + formatMetaError(camp.error) + '</code>';

  const adsets = await metaApi('GET', campaignId + '/adsets', {
    fields: 'id,name,status,effective_status',
    limit: 20
  });
  if (adsets.error) return '❌ Không đọc được adset: <code>' + formatMetaError(adsets.error) + '</code>';

  const ads = await metaApi('GET', campaignId + '/ads', {
    fields: 'id,name,status,effective_status',
    limit: 20
  });
  if (ads.error) return '❌ Không đọc được ads: <code>' + formatMetaError(ads.error) + '</code>';

  const lines = ['📌 <b>Trạng thái Ads</b>', '', formatStatusLine('Campaign', camp)];
  (adsets.data || []).slice(0, 5).forEach(function(a){ lines.push(formatStatusLine('Adset', a)); });
  (ads.data || []).slice(0, 5).forEach(function(a){ lines.push(formatStatusLine('Ad', a)); });
  if (explicitAdId && !(ads.data || []).some(function(a){return a.id === explicitAdId;})) {
    const adInfo = await metaApi('GET', explicitAdId, { fields: 'id,name,status,effective_status' });
    if (adInfo.error) lines.push('• Ad explicit <code>' + explicitAdId + '</code>: lỗi ' + formatMetaError(adInfo.error));
    else lines.push(formatStatusLine('Ad explicit', adInfo));
  }
  if ((adsets.data || []).length > 5) lines.push('• ... +' + ((adsets.data || []).length - 5) + ' adset khác');
  if ((ads.data || []).length > 5) lines.push('• ... +' + ((ads.data || []).length - 5) + ' ad khác');
  return lines.join('\n');
}

// ─── Handle: /tatads /batads <campaign_id|link> ───
async function handleToggleCampaign(text, nextStatus) {
  const cmdLabel = nextStatus === 'ACTIVE' ? '/batads' : '/tatads';
  const campaignId = parseCampaignId(text);
  const explicitAdId = parseAdId(text);
  if (!campaignId) {
    return [
      '❌ Format: <code>' + cmdLabel + ' &lt;campaign_id_hoặc_link_AdsManager&gt;</code>',
      '',
      'Ví dụ:',
      '<code>' + cmdLabel + ' 123456789012345</code>'
    ].join('\n');
  }

  const before = await metaApi('GET', campaignId, { fields: 'id,name,status,effective_status' });
  if (before.error) {
    return '❌ Không đọc được campaign: <code>' + formatMetaError(before.error) + '</code>';
  }

  const adsets = await metaApi('GET', campaignId + '/adsets', {
    fields: 'id,name,status,effective_status',
    limit: 100
  });
  if (adsets.error) return '❌ Không đọc được adset: <code>' + formatMetaError(adsets.error) + '</code>';

  const ads = await metaApi('GET', campaignId + '/ads', {
    fields: 'id,name,status,effective_status',
    limit: 100
  });
  if (ads.error) return '❌ Không đọc được ads: <code>' + formatMetaError(ads.error) + '</code>';

  const adsetRows = adsets.data || [];
  const adRows = ads.data || [];
  let explicitAd = null;
  if (explicitAdId && !adRows.some(function(ad){return ad.id === explicitAdId;})) {
    const adInfo = await metaApi('GET', explicitAdId, { fields: 'id,name,status,effective_status' });
    explicitAd = adInfo && !adInfo.error ? adInfo : { id: explicitAdId, name: explicitAdId };
  }
  const results = [];

  if (nextStatus === 'PAUSED') {
    results.push(await updateMetaObjectStatus('campaign', campaignId, before.name, nextStatus));
    for (const adset of adsetRows) results.push(await updateMetaObjectStatus('adset', adset.id, adset.name, nextStatus));
    for (const ad of adRows) results.push(await updateMetaObjectStatus('ad', ad.id, ad.name, nextStatus));
    if (explicitAd) results.push(await updateMetaObjectStatus('ad', explicitAd.id, explicitAd.name, nextStatus));
  } else {
    for (const adset of adsetRows) results.push(await updateMetaObjectStatus('adset', adset.id, adset.name, nextStatus));
    for (const ad of adRows) results.push(await updateMetaObjectStatus('ad', ad.id, ad.name, nextStatus));
    if (explicitAd) results.push(await updateMetaObjectStatus('ad', explicitAd.id, explicitAd.name, nextStatus));
    results.push(await updateMetaObjectStatus('campaign', campaignId, before.name, nextStatus));
  }

  const after = await metaApi('GET', campaignId, { fields: 'id,name,status,effective_status' });
  const okCount = results.filter(function(r){return r.ok;}).length;
  const failRows = results.filter(function(r){return !r.ok;});

  const actionText = nextStatus === 'ACTIVE' ? 'bật lại' : 'tắt';
  const lines = [
    (failRows.length ? '⚠️' : '✅') + ' <b>Đã ' + actionText + ' ' + okCount + '/' + results.length + ' đối tượng</b>',
    '',
    '• Tên: ' + (before.name || '—'),
    '• Campaign: <code>' + campaignId + '</code>',
    '• Campaign status: <b>' + ((after && !after.error && after.status) || nextStatus) + '</b>',
    '• Effective: <b>' + ((after && !after.error && after.effective_status) || 'đang cập nhật') + '</b>',
    '• Đã xử lý: ' + adsetRows.length + ' adset, ' + (adRows.length + (explicitAd ? 1 : 0)) + ' ad'
  ];
  failRows.slice(0, 5).forEach(function(r){
    lines.push('• Lỗi ' + r.type + ' ' + (r.name || r.id) + ': <code>' + r.error + '</code>');
  });
  if (failRows.length > 5) lines.push('• ... +' + (failRows.length - 5) + ' lỗi khác');
  return lines.join('\n');
}

// ─── Handle: /nsads /tangns /giamns <campaign_id|link> <budget> ───
async function handleCampaignBudget(text, mode) {
  const cmdLabel = mode === 'increase' ? '/tangns' : (mode === 'decrease' ? '/giamns' : '/nsads');
  const campaignId = parseCampaignId(text);
  const parts = String(text || '').trim().split(/\s+/).filter(Boolean);
  const budget = parseBudget(parts[parts.length - 1]);
  if (!campaignId || !budget) {
    return [
      '❌ Format: <code>' + cmdLabel + ' &lt;campaign_id_hoặc_link_AdsManager&gt; &lt;budget&gt;</code>',
      '',
      'Ví dụ:',
      '<code>' + cmdLabel + ' 123456789012345 200K</code>'
    ].join('\n');
  }
  if (budget < 10000) return '❌ Số tiền thay đổi quá nhỏ. Nhập từ 10.000đ trở lên.';

  const camp = await metaApi('GET', campaignId, { fields: 'id,name,status,effective_status' });
  if (camp.error) return '❌ Không đọc được campaign: <code>' + formatMetaError(camp.error) + '</code>';

  const adsets = await metaApi('GET', campaignId + '/adsets', {
    fields: 'id,name,daily_budget,status,effective_status',
    limit: 50
  });
  if (adsets.error) return '❌ Không đọc được adset: <code>' + formatMetaError(adsets.error) + '</code>';
  const rows = adsets.data || [];
  if (!rows.length) return '❌ Campaign này không có adset để cập nhật ngân sách.';

  const results = [];
  for (const adset of rows) {
    const oldBudget = parseInt(adset.daily_budget || '0', 10) || 0;
    let nextBudget = budget;
    if (mode === 'increase') {
      if (!oldBudget) {
        results.push({ adset: adset, ok: false, error: 'Không có daily_budget hiện tại để tăng' });
        continue;
      }
      nextBudget = oldBudget + budget;
    } else if (mode === 'decrease') {
      if (!oldBudget) {
        results.push({ adset: adset, ok: false, error: 'Không có daily_budget hiện tại để giảm' });
        continue;
      }
      nextBudget = oldBudget - budget;
      if (nextBudget < 50000) nextBudget = 50000;
    }

    const updated = await metaApi('POST', adset.id, { daily_budget: nextBudget });
    if (updated.error) results.push({ adset: adset, ok: false, error: formatMetaError(updated.error), oldBudget: oldBudget, nextBudget: nextBudget });
    else results.push({ adset: adset, ok: true, oldBudget: oldBudget, nextBudget: nextBudget });
  }

  const okCount = results.filter(function(r){return r.ok;}).length;
  const actionText = mode === 'increase' ? 'tăng ngân sách' : (mode === 'decrease' ? 'giảm ngân sách' : 'đặt ngân sách');
  const lines = [
    (okCount ? '✅' : '❌') + ' <b>Đã ' + actionText + ' ' + okCount + '/' + rows.length + ' adset</b>',
    '',
    '• Campaign: ' + (camp.name || campaignId),
    '• ID: <code>' + campaignId + '</code>'
  ];
  results.slice(0, 10).forEach(function(r){
    if (r.ok) lines.push('• ' + (r.adset.name || r.adset.id) + ': ' + fm(r.oldBudget) + 'đ → <b>' + fm(r.nextBudget) + 'đ/ngày</b>');
    else lines.push('• ' + (r.adset.name || r.adset.id) + ': lỗi <code>' + r.error + '</code>');
  });
  if (results.length > 10) lines.push('• ... +' + (results.length - 10) + ' adset khác');
  return lines.join('\n');
}

// ═══ ROUTER ═══
async function route(text, chatId) {
  const tLower = text.trim().toLowerCase();
  const cmd = text.split(/\s+/)[0].toLowerCase();
  if (cmd === '/myid' || cmd === '/me' || cmd === '/chatid') return '🆔 Chat ID của bạn: <code>' + chatId + '</code>\n\n<i>Copy số trên paste vào Vercel env <b>TELEGRAM_ALLOWED_CHAT_IDS</b> để giới hạn ai dùng được bot.</i>';
  if (cmd === '/start' || cmd === '/help') return helpText();
  if (cmd === '/chitieu' || cmd === '/spend') return await spendToday();
  if (cmd === '/canhbao' || cmd === '/alert') return await balanceAlerts();
  if (cmd === '/canthu' || cmd === '/unpaid') return await unpaidClients();
  if (cmd === '/setads' || /^sét\s*ads\s*[:.]?/i.test(tLower) || /^set\s*ads\s*[:.]?/i.test(tLower)) return await handleSetAds(text, chatId);
  if (cmd === '/tatads' || cmd === '/pause' || /^tắt\s*ads/i.test(tLower) || /^turn\s*off\s*ads/i.test(tLower)) return await handlePauseAds(text, chatId);
  if (cmd === '/luupreset' || cmd === '/savepreset') return await handleSavePreset(text, chatId);
  if (cmd === '/presets' || cmd === '/listpresets' || cmd === '/congthuc') return await handleListPresets();
  if (cmd === '/tatads' || cmd === '/pauseads' || /^tắt\s*ads/i.test(tLower) || /^tat\s*ads/i.test(tLower)) return await handleToggleCampaign(text, 'PAUSED');
  if (cmd === '/batads' || cmd === '/resumeads' || cmd === '/activeads' || /^bật\s*ads/i.test(tLower) || /^bat\s*ads/i.test(tLower)) return await handleToggleCampaign(text, 'ACTIVE');
  if (cmd === '/checkads' || cmd === '/statusads' || /^kiểm\s*tra\s*ads/i.test(tLower) || /^kiem\s*tra\s*ads/i.test(tLower) || /^trạng\s*thái\s*ads/i.test(tLower) || /^trang\s*thai\s*ads/i.test(tLower)) return await handleCheckAdsStatus(text);
  if (cmd === '/nsads' || cmd === '/budgetads' || cmd === '/setbudget' || /^ngân\s*sách\s*ads/i.test(tLower) || /^ngan\s*sach\s*ads/i.test(tLower)) return await handleCampaignBudget(text, 'set');
  if (cmd === '/tangns' || cmd === '/increasebudget' || /^tăng\s*ns/i.test(tLower) || /^tang\s*ns/i.test(tLower)) return await handleCampaignBudget(text, 'increase');
  if (cmd === '/giamns' || cmd === '/decreasebudget' || /^giảm\s*ns/i.test(tLower) || /^giam\s*ns/i.test(tLower)) return await handleCampaignBudget(text, 'decrease');
  return await askAI(text);
}

// ═══ ENTRY ═══
module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).send('Method not allowed');

  if (TELEGRAM_WEBHOOK_SECRET && req.headers['x-telegram-bot-api-secret-token'] !== TELEGRAM_WEBHOOK_SECRET) {
    return res.status(401).send('Unauthorized');
  }

  const update = req.body || {};
  const msg = update.message || update.edited_message;
  if (!msg || !msg.chat || !msg.text) return res.status(200).send('ok');

  const chatId = String(msg.chat.id);
  const text = String(msg.text || '').trim();

  if (ALLOWED_CHAT_IDS.length && ALLOWED_CHAT_IDS.indexOf(chatId) < 0) {
    await sendMessage(chatId, '❌ Bot này dành riêng cho HC Agency.\nChat ID của bạn: <code>' + chatId + '</code>');
    return res.status(200).send('ok');
  }

  try {
    const reply = await route(text, chatId);
    await sendMessage(chatId, reply, {reply_to_message_id: msg.message_id});
  } catch (e) {
    console.error('[Telegram route error]', e);
    await sendMessage(chatId, '❌ Lỗi xử lý: ' + (e.message || 'Không rõ'));
  }

  return res.status(200).send('ok');
};
