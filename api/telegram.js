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
    '<b>Lệnh nhanh:</b>',
    '/chitieu — Chi tiêu hôm nay theo nhân sự',
    '/canhbao — TKQC sắp hết tiền (≥80%)',
    '/canthu — Khách chưa thanh toán + đã gửi phiếu',
    '/help — Hiện lại menu này',
    '',
    '<b>Tự nhiên:</b>',
    'Gõ thẳng câu hỏi — bot sẽ trả lời theo data dashboard.',
    'VD: "Khách nào chi tiêu cao nhất tháng này?"',
    '',
    '<i>Dữ liệu cập nhật real-time từ Supabase.</i>'
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
  if (!OPENAI_API_KEY) return '❌ Bot chưa cấu hình OPENAI_API_KEY. Liên hệ admin.';
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

// ═══ ROUTER ═══
async function route(text) {
  const cmd = text.split(/\s+/)[0].toLowerCase();
  if (cmd === '/start' || cmd === '/help') return helpText();
  if (cmd === '/chitieu' || cmd === '/spend') return await spendToday();
  if (cmd === '/canhbao' || cmd === '/alert') return await balanceAlerts();
  if (cmd === '/canthu' || cmd === '/unpaid') return await unpaidClients();
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
    const reply = await route(text);
    await sendMessage(chatId, reply, {reply_to_message_id: msg.message_id});
  } catch (e) {
    console.error('[Telegram route error]', e);
    await sendMessage(chatId, '❌ Lỗi xử lý: ' + (e.message || 'Không rõ'));
  }

  return res.status(200).send('ok');
};
