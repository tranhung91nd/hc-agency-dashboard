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
const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-5.4-mini';
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
function normalizeTelegramHtml(text) {
  let out = String(text || '').trim();
  if (!out) return out;
  out = out.replace(/\*\*([^*\n]+?)\*\*/g, '<b>$1</b>');
  out = out.replace(/__([^_\n]+?)__/g, '<b>$1</b>');
  out = out.replace(/`([^`\n]+?)`/g, '<code>$1</code>');
  out = out.replace(/^\s*[-*]\s+/gm, '• ');
  out = out.replace(/[ \t]+\n/g, '\n');
  out = out.replace(/\n{3,}/g, '\n\n');
  return out;
}

async function sendMessage(chatId, text, opts) {
  opts = opts || {};
  const body = {
    chat_id: chatId,
    text: normalizeTelegramHtml(text),
    parse_mode: 'HTML',
    disable_web_page_preview: true
  };
  if (opts.reply_to_message_id) body.reply_to_message_id = opts.reply_to_message_id;
  const url = 'https://api.telegram.org/bot' + TELEGRAM_BOT_TOKEN + '/sendMessage';
  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  if (!resp.ok) {
    const errText = await resp.text();
    console.error('[Telegram sendMessage]', resp.status, errText);
    if (/can't parse entities|parse/i.test(errText)) {
      const fallback = Object.assign({}, body);
      delete fallback.parse_mode;
      await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(fallback)
      });
    }
  }
}

function getTelegramMessageText(message) {
  if (!message) return '';
  return String(message.text || message.caption || '').trim();
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
    '<b>💳 Tài khoản & Campaign:</b>',
    '/tkqc — Danh sách TKQC',
    '/camps &lt;tkqc_id&gt; [active|paused] — Camp của TKQC',
    '/camp &lt;camp_id&gt; — Chi tiết 1 camp (target, budget, insights 7d)',
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
    '/clonecamp &lt;campaign_id&gt; [budget] — Nhân bản nguyên văn 1 campaign',
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
    '<b>🤖 AI Agent (gõ tự nhiên):</b>',
    'AI tự query DB + Meta API + thực hiện action.',
    'VD:',
    '• "Khách Tabb tháng này chi bao nhiêu?"',
    '• "Top 5 staff chi nhiều nhất tuần này"',
    '• "Tắt giúp tôi cái campaign 12024..."',
    '• "TKQC nào đang chạy lỗ tháng này?"',
    '• "So sánh spend T5 vs T4"',
    '',
    '/clear — Xóa lịch sử AI nhớ',
    '',
    '<i>Budget: 200K · 1tr · 200.000 · 1tr5</i>'
  ].join('\n');
}

function capabilitiesText() {
  return [
    '<b>🤖 Trợ lý HC Quảng cáo</b>',
    '<i>Bạn cứ hỏi tự nhiên, bot sẽ tự tìm TKQC/campaign và gọi Meta API khi cần.</i>',
    '',
    '<b>💳 TKQC & Campaign</b>',
    '• Tìm ID tài khoản theo tên',
    '• Xem campaign đang chạy/tạm dừng',
    '• Kiểm tra spend, mess, giá/mess theo campaign',
    '',
    '<b>⚙️ Thao tác Ads</b>',
    '• Tắt/bật campaign, adset, ads',
    '• Tăng/giảm/đặt ngân sách',
    '• Clone campaign hoặc set ads từ công thức',
    '',
    '<b>📊 Báo cáo</b>',
    '• Chi tiêu hôm nay',
    '• TKQC sắp hết tiền',
    '• Khách chưa thanh toán',
    '',
    '<b>Ví dụ hỏi nhanh</b>',
    '• <code>ID tài khoản Livefit 03 VAT</code>',
    '• <code>Livefit 03 VAT có những campaign nào?</code>',
    '• <code>Campaign nào đang chi tiêu, giá mess bao nhiêu?</code>',
    '• <code>Tắt campaign 120249724924720404</code>',
    '• <code>Tăng ngân sách campaign này thêm 100K</code>'
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

// ═══ B. AI FUNCTION CALLING — hiểu intent freeform + dispatch action thật ═══
// 11 tools whitelisted để AI gọi. Mọi action có verify (handleToggleCampaign,
// handleCampaignBudget...) trước khi confirm thành công. AI KHÔNG gọi được
// function ngoài whitelist này → an toàn.
const AI_TOOLS = [
  {
    type: 'function',
    function: {
      name: 'duplicate_campaign',
      description: 'Nhân bản 1 campaign trên Meta (clone toàn bộ: page, targeting, post, destination). Có thể override budget hoặc tên. Khi user nói: nhân bản/clone/copy/duplicate + campaign + ID.',
      parameters: { type: 'object', properties: { source_campaign_id: { type: 'string', description: 'Campaign ID cần clone' }, new_name: { type: 'string', description: 'Tên campaign mới (optional)' }, budget: { type: 'string', description: 'Ngân sách mới VD 200K, 500K, 1tr (optional, default = budget cũ)' } }, required: ['source_campaign_id'] }
    }
  },
  {
    type: 'function',
    function: {
      name: 'pause_campaign',
      description: 'Tắt (PAUSED) campaign trên Meta. Khi user nói: tắt/dừng/stop/pause + (ads/qc/campaign/chiến dịch + ID).',
      parameters: { type: 'object', properties: { campaign_id: { type: 'string', description: 'Campaign ID dạng số 15-17 chữ số' } }, required: ['campaign_id'] }
    }
  },
  {
    type: 'function',
    function: {
      name: 'activate_campaign',
      description: 'Bật lại (ACTIVE) campaign trên Meta. Khi user nói: bật/mở/resume/start + (ads/campaign + ID).',
      parameters: { type: 'object', properties: { campaign_id: { type: 'string' } }, required: ['campaign_id'] }
    }
  },
  {
    type: 'function',
    function: {
      name: 'check_ads_status',
      description: 'Xem trạng thái hiện tại của campaign + adsets + ads. Khi user hỏi: kiểm tra/xem/trạng thái/status + ID.',
      parameters: { type: 'object', properties: { campaign_id: { type: 'string' } }, required: ['campaign_id'] }
    }
  },
  {
    type: 'function',
    function: {
      name: 'set_campaign_budget',
      description: 'Đặt ngân sách hàng ngày cho campaign (override hiện tại). Khi user nói: đặt ngân sách/budget X cho campaign Y.',
      parameters: { type: 'object', properties: { campaign_id: { type: 'string' }, budget: { type: 'string', description: 'Số tiền VND, chấp nhận 200K, 200000, 1tr, 200.000' } }, required: ['campaign_id', 'budget'] }
    }
  },
  {
    type: 'function',
    function: {
      name: 'increase_campaign_budget',
      description: 'Tăng ngân sách hiện tại lên thêm 1 lượng. Khi user nói: tăng/cộng/thêm + ngân sách + delta + campaign.',
      parameters: { type: 'object', properties: { campaign_id: { type: 'string' }, delta: { type: 'string', description: 'Số tiền cộng thêm VND' } }, required: ['campaign_id', 'delta'] }
    }
  },
  {
    type: 'function',
    function: {
      name: 'decrease_campaign_budget',
      description: 'Giảm ngân sách hiện tại. Floor 50k tối thiểu. Khi user: giảm/bớt + ngân sách + delta.',
      parameters: { type: 'object', properties: { campaign_id: { type: 'string' }, delta: { type: 'string' } }, required: ['campaign_id', 'delta'] }
    }
  },
  {
    type: 'function',
    function: {
      name: 'list_accounts',
      description: 'Tìm hoặc liệt kê tài khoản quảng cáo (TKQC). GỌI LUÔN tool này khi user hỏi về TKQC: danh sách, liệt kê, "ID tài khoản X", "TKQC tên Y là gì". Khi user hỏi 1 TKQC cụ thể theo tên (vd "ID tài khoản Livefit 03"), TRUYỀN search="Livefit 03" để chỉ trả về account match (bỏ dấu tiếng Việt, case-insensitive, partial match). Để search trống nếu user thực sự muốn xem tất cả.',
      parameters: { type: 'object', properties: { search: { type: 'string', description: 'Từ khoá tên TKQC để filter (vd "Livefit 03", "Hibou"). Để trống = list tất cả.' } } }
    }
  },
  {
    type: 'function',
    function: {
      name: 'list_campaigns',
      description: 'Liệt kê campaigns trong 1 TKQC, có thể filter active/paused. Khi user hỏi: TKQC X có campaign gì, list ads đang chạy của tài khoản Y.',
      parameters: { type: 'object', properties: { ad_account_id: { type: 'string', description: 'TKQC ID dạng act_xxx hoặc số' }, filter: { type: 'string', enum: ['active', 'paused', 'all'], description: 'Lọc theo trạng thái, default all' } }, required: ['ad_account_id'] }
    }
  },
  {
    type: 'function',
    function: {
      name: 'campaign_detail',
      description: 'Xem chi tiết 1 campaign: targeting, ngân sách, mục tiêu, insights 7 ngày, page, đích. Khi user hỏi sâu về 1 campaign cụ thể.',
      parameters: { type: 'object', properties: { campaign_id: { type: 'string' } }, required: ['campaign_id'] }
    }
  },
  {
    type: 'function',
    function: {
      name: 'show_spend_today',
      description: 'Xem chi tiêu hôm nay phân theo nhân sự. Khi user hỏi: hôm nay chi bao nhiêu, spend today, ai chi nhiều nhất hôm nay.',
      parameters: { type: 'object', properties: {} }
    }
  },
  {
    type: 'function',
    function: {
      name: 'show_balance_alerts',
      description: 'TKQC sắp hết tiền (≥80% spend_cap). Khi user hỏi: TKQC nào sắp hết, cảnh báo balance, ad account low budget.',
      parameters: { type: 'object', properties: {} }
    }
  },
  {
    type: 'function',
    function: {
      name: 'show_unpaid_clients',
      description: 'Khách chưa thanh toán. Khi user hỏi: ai chưa thanh toán, khách nợ, cần thu, unpaid clients.',
      parameters: { type: 'object', properties: {} }
    }
  }
];

// ═══ DUPLICATE CAMPAIGN — clone nguyên văn 1 campaign Meta ═══
// Khác với createAdsFromPreset (cần preset + post mới), function này:
// - Đọc trực tiếp source campaign + adset + ad creative từ Meta
// - Clone cùng targeting + page + post + destination + budget
// - Có thể override budget/name nếu user request
async function duplicateCampaign(sourceCampaignId, opts) {
  opts = opts || {};
  // 1. Source campaign info
  const camp = await metaApi('GET', sourceCampaignId, { fields: 'id,name,account_id,objective,special_ad_categories' });
  if (camp.error) return { ok: false, step: 'fetch_campaign', error: formatMetaError(camp.error) };
  if (!camp.account_id) return { ok: false, step: 'fetch_campaign', error: 'Campaign không có account_id (deleted?)' };

  // 2. Source adset (lấy cái đầu tiên)
  const adsets = await metaApi('GET', sourceCampaignId + '/adsets', { fields: 'id,name,daily_budget,destination_type,promoted_object,targeting,billing_event,optimization_goal,bid_strategy', limit: 1 });
  if (adsets.error) return { ok: false, step: 'fetch_adset', error: formatMetaError(adsets.error) };
  if (!adsets.data || !adsets.data.length) return { ok: false, step: 'fetch_adset', error: 'Campaign không có adset' };
  const srcAdset = adsets.data[0];

  // 3. Source ad + creative
  const ads = await metaApi('GET', sourceCampaignId + '/ads', { fields: 'id,name,creative{id,effective_object_story_id,object_story_id}', limit: 1 });
  if (ads.error) return { ok: false, step: 'fetch_ad', error: formatMetaError(ads.error) };
  if (!ads.data || !ads.data.length) return { ok: false, step: 'fetch_ad', error: 'Campaign không có ad' };
  const srcAd = ads.data[0];
  const objectStoryId = (srcAd.creative && (srcAd.creative.effective_object_story_id || srcAd.creative.object_story_id));
  if (!objectStoryId) return { ok: false, step: 'fetch_creative', error: 'Không lấy được object_story_id từ creative cũ (creative có thể không phải post link)' };

  // 4. Override values + naming
  const actPath = 'act_' + camp.account_id;
  const budget = opts.budget ? parseBudget(opts.budget) : parseInt(srcAdset.daily_budget) || 0;
  if (!budget || budget < 50000) return { ok: false, step: 'validate', error: 'Budget thiếu hoặc <50.000đ' };
  const newName = opts.new_name || ('[Clone] ' + (camp.name || 'Camp') + ' - ' + vnDateStr(0));

  // 5. Tạo Campaign mới (clone objective + special_ad_categories)
  const newCamp = await metaApi('POST', actPath + '/campaigns', {
    name: newName,
    objective: camp.objective || 'OUTCOME_ENGAGEMENT',
    special_ad_categories: camp.special_ad_categories || [],
    status: 'ACTIVE',
    buying_type: 'AUCTION',
    is_adset_budget_sharing_enabled: false
  });
  if (newCamp.error) return { ok: false, step: 'campaign', error: formatMetaError(newCamp.error) };
  if (!newCamp.id) return { ok: false, step: 'campaign', error: 'Không trả về campaign_id' };

  // 6. Tạo Adset mới (clone targeting + promoted_object + destination)
  const newAdset = await metaApi('POST', actPath + '/adsets', {
    name: newName + ' - Adset',
    campaign_id: newCamp.id,
    daily_budget: budget,
    billing_event: srcAdset.billing_event || 'IMPRESSIONS',
    optimization_goal: srcAdset.optimization_goal || 'CONVERSATIONS',
    bid_strategy: srcAdset.bid_strategy || 'LOWEST_COST_WITHOUT_CAP',
    destination_type: srcAdset.destination_type || 'MESSENGER',
    promoted_object: srcAdset.promoted_object || {},
    targeting: srcAdset.targeting || {},
    status: 'ACTIVE'
  });
  if (newAdset.error) return { ok: false, step: 'adset', error: formatMetaError(newAdset.error) };

  // 7. Tạo Creative mới (cùng object_story_id = cùng post)
  const newCreative = await metaApi('POST', actPath + '/adcreatives', {
    name: newName + ' - Creative',
    object_story_id: objectStoryId
  });
  if (newCreative.error) return { ok: false, step: 'creative', error: formatMetaError(newCreative.error) };

  // 8. Tạo Ad mới
  const newAd = await metaApi('POST', actPath + '/ads', {
    name: newName + ' - Ad',
    adset_id: newAdset.id,
    creative: { creative_id: newCreative.id },
    status: 'ACTIVE'
  });
  if (newAd.error) return { ok: false, step: 'ad', error: formatMetaError(newAd.error) };

  // Log
  try {
    await sb.from('auto_ads_log').insert({
      source: 'duplicate',
      preset_name: 'clone:' + sourceCampaignId,
      post_id: objectStoryId,
      budget: budget,
      campaign_id: newCamp.id,
      adset_id: newAdset.id,
      creative_id: newCreative.id,
      ad_id: newAd.id,
      ad_account_id: actPath,
      status: 'success'
    });
  } catch (e) {}

  return {
    ok: true,
    source_campaign_id: sourceCampaignId,
    source_name: camp.name,
    new_campaign_id: newCamp.id,
    new_ad_id: newAd.id,
    new_name: newName,
    budget: budget,
    manager_link: 'https://adsmanager.facebook.com/adsmanager/manage/campaigns?act=' + camp.account_id + '&selected_campaign_ids=' + newCamp.id
  };
}

async function handleDuplicateCampaign(args) {
  const r = await duplicateCampaign(args.source_campaign_id, { new_name: args.new_name, budget: args.budget });
  if (!r.ok) {
    return [
      '❌ <b>Nhân bản campaign thất bại</b>',
      '',
      'Bước lỗi: <b>' + (r.step || '—') + '</b>',
      'Chi tiết: <code>' + (r.error || '—') + '</code>'
    ].join('\n');
  }
  return [
    '✅ <b>Đã nhân bản campaign</b>',
    '',
    '• Tên mới: ' + r.new_name,
    '• Campaign mới: <code>' + r.new_campaign_id + '</code>',
    '• Ad mới: <code>' + r.new_ad_id + '</code>',
    '• Ngân sách: ' + fm(r.budget) + 'đ/ngày',
    '• Source: ' + (r.source_name || r.source_campaign_id),
    '',
    '🔗 <a href="' + r.manager_link + '">Mở Ads Manager</a>'
  ].join('\n');
}

// ═══ AI AGENT TOOLS CẤP 3 ═══
// 11 query tools (DB live + Meta live + scan). AI tự gọi để lấy data trước khi trả lời.
const AI_QUERY_TOOLS = [
  {
    type: 'function',
    function: {
      name: 'query_client_by_name',
      description: 'Tìm thông tin khách theo tên (fuzzy match). Trả về list khách + services + payment_status + spend tháng + balance rental nếu có.',
      parameters: { type: 'object', properties: { name: { type: 'string', description: 'Tên hoặc 1 phần tên khách' } }, required: ['name'] }
    }
  },
  {
    type: 'function',
    function: {
      name: 'query_campaign_details',
      description: 'Chi tiết campaign từ DB local (đã sync 15p): tên, spend N ngày qua, account. Dùng khi user hỏi về campaign cụ thể.',
      parameters: { type: 'object', properties: { campaign_id: { type: 'string' }, days: { type: 'number', description: 'Default 7' } }, required: ['campaign_id'] }
    }
  },
  {
    type: 'function',
    function: {
      name: 'query_staff_kpi',
      description: 'KPI 1 nhân sự trong tháng: spend, budget, %, top khách quản lý.',
      parameters: { type: 'object', properties: { staff_name: { type: 'string' }, month: { type: 'string', description: 'YYYY-MM, default tháng hiện tại' } }, required: ['staff_name'] }
    }
  },
  {
    type: 'function',
    function: {
      name: 'query_recent_auto_ads',
      description: 'Lịch sử bot tạo ads. Filter theo preset_name, status (success/failed). Default 10 dòng mới nhất.',
      parameters: { type: 'object', properties: { limit: { type: 'number' }, preset_name: { type: 'string' }, status: { type: 'string', enum: ['success', 'failed'] } } }
    }
  },
  {
    type: 'function',
    function: {
      name: 'query_top_spenders',
      description: 'Top N người chi nhiều nhất theo type (client/account/staff) trong period (today/week/month).',
      parameters: { type: 'object', properties: { type: { type: 'string', enum: ['client', 'account', 'staff'] }, period: { type: 'string', enum: ['today', 'week', 'month'] }, limit: { type: 'number', description: 'Default 5' } }, required: ['type', 'period'] }
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_meta_ad_insights',
      description: 'Lấy insights LIVE từ Meta API: spend, impressions, clicks, conversions của 1 object (campaign/adset/ad).',
      parameters: { type: 'object', properties: { object_id: { type: 'string' }, days: { type: 'number', description: 'Số ngày, default 7' } }, required: ['object_id'] }
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_invoice_for_client',
      description: 'Sinh tóm tắt phiếu thanh toán tháng cho khách: spend, fee, VAT, total, payment_status.',
      parameters: { type: 'object', properties: { client_name: { type: 'string' }, month: { type: 'string', description: 'YYYY-MM, default tháng hiện tại' } }, required: ['client_name'] }
    }
  },
  {
    type: 'function',
    function: {
      name: 'scan_unprofitable_accounts',
      description: 'Quét TKQC có thể đang chạy lỗ trong tháng (spend cao nhưng không có khách gán đủ phí).',
      parameters: { type: 'object', properties: { month: { type: 'string', description: 'YYYY-MM, default tháng hiện tại' } } }
    }
  },
  {
    type: 'function',
    function: {
      name: 'scan_inactive_clients',
      description: 'Quét khách lâu không chi tiêu (active nhưng spend=0 trong N ngày).',
      parameters: { type: 'object', properties: { days: { type: 'number', description: 'Default 14' } } }
    }
  },
  {
    type: 'function',
    function: {
      name: 'compare_periods',
      description: 'So sánh tổng spend / doanh thu / số khách giữa 2 tháng. Trả % change.',
      parameters: { type: 'object', properties: { metric: { type: 'string', enum: ['spend', 'revenue', 'clients'] }, month_a: { type: 'string', description: 'YYYY-MM' }, month_b: { type: 'string', description: 'YYYY-MM' } }, required: ['metric', 'month_a', 'month_b'] }
    }
  }
];

// ═══ TOOL HANDLERS — execute query và trả về JSON cho AI ═══
async function executeQueryTool(fn, args) {
  try {
    switch (fn) {
      case 'query_client_by_name': {
        const r = await sb.from('client').select('id,name,phone,status,payment_status,services,service_fee,rental_fee_pct,has_vat,start_date,campaign_keyword').ilike('name', '%' + args.name + '%').limit(5);
        return r.data || [];
      }
      case 'query_campaign_details': {
        const days = Math.min(args.days || 7, 30);
        const since = vnDateStr(-days * 86400000);
        const spend = await sb.from('campaign_daily_mess').select('report_date,spend,mess_count,lead_count,campaign_name,ad_account_id').eq('campaign_id', args.campaign_id).gte('report_date', since).order('report_date');
        if (!spend.data || !spend.data.length) {
          // Try Meta live
          const meta = await metaApi('GET', args.campaign_id, { fields: 'id,name,status,effective_status,daily_budget,created_time' });
          return { source: 'meta_live', meta: meta, db_rows: 0 };
        }
        const total = spend.data.reduce((s,d) => s + (d.spend||0), 0);
        const totalMess = spend.data.reduce((s,d) => s + (d.mess_count||0), 0);
        return { campaign_id: args.campaign_id, name: spend.data[0].campaign_name, days: spend.data.length, total_spend: total, total_mess: totalMess, ad_account_id: spend.data[0].ad_account_id, daily: spend.data };
      }
      case 'query_staff_kpi': {
        const month = args.month || vnDateStr(0).substring(0,7);
        const staff = await sb.from('staff').select('*').or('short_name.ilike.%' + args.staff_name + '%,full_name.ilike.%' + args.staff_name + '%').limit(1);
        if (!staff.data || !staff.data.length) return { error: 'Không tìm thấy nhân sự ' + args.staff_name };
        const s = staff.data[0];
        const ds = await sb.from('daily_spend').select('spend_amount').gte('report_date', month + '-01').lt('report_date', month + '-32').eq('staff_id', s.id);
        const total = (ds.data || []).reduce((sum,d) => sum + (d.spend_amount||0), 0);
        return { staff: { id: s.id, name: s.short_name || s.full_name, monthly_budget: s.monthly_budget }, month: month, spend: total, pct_of_budget: s.monthly_budget ? Math.round(total/s.monthly_budget*100) : null };
      }
      case 'query_recent_auto_ads': {
        let q = sb.from('auto_ads_log').select('created_at,preset_name,status,campaign_id,ad_id,budget,source,error_step,error_message').order('created_at',{ascending:false}).limit(Math.min(args.limit || 10, 30));
        if (args.preset_name) q = q.eq('preset_name', args.preset_name);
        if (args.status) q = q.eq('status', args.status);
        const r = await q;
        return r.data || [];
      }
      case 'query_top_spenders': {
        const period = args.period || 'month';
        const today = vnDateStr(0);
        let since;
        if (period === 'today') since = today;
        else if (period === 'week') since = vnDateStr(-7 * 86400000);
        else since = today.substring(0,7) + '-01';
        const limit = Math.min(args.limit || 5, 20);
        const daily = await sb.from('daily_spend').select('ad_account_id,staff_id,matched_client_id,spend_amount').gte('report_date', since);
        const rows = daily.data || [];
        const groupBy = args.type === 'client' ? 'matched_client_id' : (args.type === 'staff' ? 'staff_id' : 'ad_account_id');
        const totals = {};
        rows.forEach(d => {
          const key = d[groupBy];
          if (!key) return;
          totals[key] = (totals[key] || 0) + (d.spend_amount||0);
        });
        const sorted = Object.entries(totals).sort((a,b)=>b[1]-a[1]).slice(0,limit);
        // Resolve names
        const result = [];
        for (const [id, total] of sorted) {
          let name = id;
          if (args.type === 'client') { const r = await sb.from('client').select('name').eq('id',id).maybeSingle(); name = r.data?.name || id; }
          else if (args.type === 'staff') { const r = await sb.from('staff').select('short_name,full_name').eq('id',id).maybeSingle(); name = r.data?.short_name || r.data?.full_name || id; }
          else { const r = await sb.from('ad_account').select('account_name').eq('id',id).maybeSingle(); name = r.data?.account_name || id; }
          result.push({ id, name, total_spend: total });
        }
        return { period, type: args.type, top: result };
      }
      case 'get_meta_ad_insights': {
        const days = Math.min(args.days || 7, 30);
        const since = vnDateStr(-days * 86400000);
        const until = vnDateStr(0);
        const r = await metaApi('GET', args.object_id + '/insights', { fields: 'spend,impressions,clicks,actions,date_start,date_stop', time_range: { since, until }, time_increment: 1 });
        if (r.error) return { error: formatMetaError(r.error) };
        return r.data || [];
      }
      case 'get_invoice_for_client': {
        const month = args.month || vnDateStr(0).substring(0,7);
        const client = await sb.from('client').select('*').ilike('name', '%' + args.client_name + '%').limit(1);
        if (!client.data || !client.data.length) return { error: 'Không tìm thấy khách ' + args.client_name };
        const c = client.data[0];
        const ds = await sb.from('daily_spend').select('spend_amount').gte('report_date', month+'-01').lt('report_date', month+'-32').or('matched_client_id.eq.' + c.id);
        const spend = (ds.data||[]).reduce((s,d)=>s+(d.spend_amount||0),0);
        const fee = c.service_fee || 0;
        const rentalFee = c.rental_fee_pct ? Math.round(spend * c.rental_fee_pct / 1000) * 1000 : 0;
        const totalFee = fee + rentalFee;
        const vat = c.has_vat ? Math.round(totalFee * 0.08) : 0;
        return { client_name: c.name, month, spend, service_fee: fee, rental_fee: rentalFee, vat, total: totalFee + vat, payment_status: c.payment_status };
      }
      case 'scan_unprofitable_accounts': {
        const month = args.month || vnDateStr(0).substring(0,7);
        const ads = await sb.from('ad_account').select('id,account_name,client_id').eq('account_status',1);
        const daily = await sb.from('daily_spend').select('ad_account_id,spend_amount').gte('report_date', month+'-01');
        const spendByAcc = {};
        (daily.data||[]).forEach(d => { spendByAcc[d.ad_account_id] = (spendByAcc[d.ad_account_id]||0) + (d.spend_amount||0); });
        const unprofitable = (ads.data||[]).filter(a => !a.client_id && (spendByAcc[a.id] || 0) > 0).map(a => ({ id: a.id, name: a.account_name, spend: spendByAcc[a.id] }));
        return { month, count: unprofitable.length, accounts: unprofitable.slice(0, 10) };
      }
      case 'scan_inactive_clients': {
        const days = Math.min(args.days || 14, 90);
        const since = vnDateStr(-days * 86400000);
        const clients = await sb.from('client').select('id,name,start_date').eq('status','active');
        const daily = await sb.from('daily_spend').select('matched_client_id').gte('report_date', since);
        const activeIds = new Set((daily.data||[]).map(d => d.matched_client_id).filter(Boolean));
        const inactive = (clients.data||[]).filter(c => !activeIds.has(c.id));
        return { days_inactive: days, count: inactive.length, clients: inactive.slice(0, 15) };
      }
      case 'compare_periods': {
        const monthA = args.month_a;
        const monthB = args.month_b;
        if (args.metric === 'spend') {
          const a = await sb.from('daily_spend').select('spend_amount').gte('report_date', monthA+'-01').lt('report_date', monthA+'-32');
          const b = await sb.from('daily_spend').select('spend_amount').gte('report_date', monthB+'-01').lt('report_date', monthB+'-32');
          const totalA = (a.data||[]).reduce((s,d)=>s+(d.spend_amount||0),0);
          const totalB = (b.data||[]).reduce((s,d)=>s+(d.spend_amount||0),0);
          const pct = totalA ? Math.round((totalB-totalA)/totalA*100) : null;
          return { metric: 'spend', month_a: monthA, total_a: totalA, month_b: monthB, total_b: totalB, change_pct: pct };
        }
        return { error: 'metric chưa support: ' + args.metric };
      }
      default: return { error: 'Unknown tool: ' + fn };
    }
  } catch (e) {
    console.error('[executeQueryTool]', fn, e.message);
    return { error: e.message };
  }
}

// ═══ CONVERSATION MEMORY ═══
// Sanitize messages: loại bỏ orphan 'tool' messages (không có assistant.tool_calls đứng trước),
// và assistant.tool_calls không có đủ tool responses đứng sau.
// Lỗi OpenAI: "messages with role 'tool' must be a response to a preceeding message with 'tool_calls'"
function sanitizeAIMessages(msgs) {
  if (!Array.isArray(msgs) || !msgs.length) return [];
  // Pass 1: mỗi assistant với tool_calls phải có tool response cho TỪNG tool_call_id ngay sau.
  //          Nếu thiếu bất kỳ tool response nào → bỏ cả assistant + tool responses lẻ.
  // Pass 2: tool message phải đứng sau assistant.tool_calls có tool_call_id match.
  const out = [];
  for (let i = 0; i < msgs.length; i++) {
    const m = msgs[i];
    if (!m || !m.role) continue;
    if (m.role === 'tool') {
      // Chỉ giữ nếu đứng ngay sau assistant.tool_calls match
      const prev = out[out.length - 1];
      const isValidTool = prev && prev.role === 'assistant' && Array.isArray(prev.tool_calls) &&
        prev.tool_calls.some(c => c.id === m.tool_call_id);
      // hoặc đứng sau tool message khác trong cùng group (multi-tool)
      const isContinuationTool = prev && prev.role === 'tool';
      if (!isValidTool && !isContinuationTool) continue;
      if (isContinuationTool) {
        // Tìm assistant gần nhất phía trước
        let assistant = null;
        for (let j = out.length - 1; j >= 0; j--) {
          if (out[j].role === 'assistant' && out[j].tool_calls) { assistant = out[j]; break; }
          if (out[j].role !== 'tool') break;
        }
        if (!assistant || !assistant.tool_calls.some(c => c.id === m.tool_call_id)) continue;
      }
      out.push(m);
      continue;
    }
    if (m.role === 'assistant' && Array.isArray(m.tool_calls) && m.tool_calls.length) {
      // Phải có đủ tool responses ngay sau trong msgs gốc
      const needIds = new Set(m.tool_calls.map(c => c.id));
      const haveIds = new Set();
      for (let j = i + 1; j < msgs.length; j++) {
        if (msgs[j].role !== 'tool') break;
        if (needIds.has(msgs[j].tool_call_id)) haveIds.add(msgs[j].tool_call_id);
      }
      if (needIds.size !== haveIds.size) continue; // skip — không đủ response
      out.push(m);
      continue;
    }
    out.push(m);
  }
  return out;
}

async function getConversation(chatId) {
  const r = await sb.from('telegram_conversation').select('messages').eq('chat_id', chatId).maybeSingle();
  const raw = (r.data && r.data.messages) || [];
  return sanitizeAIMessages(raw);
}
async function saveConversation(chatId, messages, tokens) {
  // Sanitize TRƯỚC khi trim — đảm bảo không lưu orphan
  const clean = sanitizeAIMessages(messages);
  // Trim còn 20 messages cuối nhưng giữ nguyên cấu trúc tool_calls ↔ tool responses
  let trimmed = clean.slice(-20);
  // Sau slice có thể vô tình cắt đầu trên 1 tool message → sanitize lần nữa
  trimmed = sanitizeAIMessages(trimmed);
  await sb.from('telegram_conversation').upsert({
    chat_id: chatId,
    messages: trimmed,
    total_turns: trimmed.length,
    total_tokens: tokens || 0,
    updated_at: new Date().toISOString()
  });
}
async function clearConversation(chatId) {
  await sb.from('telegram_conversation').delete().eq('chat_id', chatId);
}

// ═══ AI AGENT — multi-turn ReAct loop với memory ═══
async function askAIAgent(question, chatId) {
  if (!OPENAI_API_KEY) return null;
  const history = await getConversation(chatId);
  const systemPrompt = [
    'Bạn là AI Agent quản lý Facebook Ads cho HC Agency (agency chạy ads tại VN).',
    'Có thể gọi tools để: query DB local (khách, staff, campaign...), gọi Meta API live, scan toàn bộ data, thực hiện action (tắt/bật/sửa campaign).',
    'Quy tắc:',
    '1. Suy luận từng bước. Nếu cần data, gọi tool query TRƯỚC khi trả lời.',
    '2. Trả lời ngắn gọn, dùng số liệu cụ thể (đ, %, ngày).',
    '3. Khi user yêu cầu HÀNH ĐỘNG (tắt/bật/sửa), confirm ID đúng rồi mới gọi action tool.',
    '4. KHÔNG output thông tin nhạy cảm (access_token, full ad_account_id nếu user không hỏi).',
    '5. Nếu câu hỏi có phần "Ngữ cảnh tin nhắn được reply", ưu tiên ngữ cảnh đó hơn lịch sử conversation cũ.',
    '6. Định dạng cho Telegram parse_mode HTML: dùng <b>...</b>, <code>...</code>, bullet "•". KHÔNG dùng Markdown như **bold**, ###, hoặc bảng.',
    '7. Khi trả lời danh sách, chia nhóm ngắn, mỗi dòng 1 ý, tránh đoạn văn dài.',
    '8. Hôm nay là ' + vnDateStr(0) + ', tháng ' + vnDateStr(0).substring(0,7) + '.'
  ].join('\n');
  let messages = [{ role: 'system', content: systemPrompt }, ...history, { role: 'user', content: question }];
  const allTools = [...AI_TOOLS, ...AI_QUERY_TOOLS];
  let totalTokens = 0;
  for (let turn = 0; turn < 7; turn++) {
    try {
      const resp = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'Authorization': 'Bearer ' + OPENAI_API_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: OPENAI_MODEL, messages: messages, tools: allTools, tool_choice: 'auto', max_completion_tokens: 800 })
      });
      const data = await resp.json();
      if (data.error) {
        // Tự phục hồi: nếu lỗi do conversation history orphan tool messages → clear + báo user thử lại
        const errMsg = data.error.message || '';
        if (/tool.*tool_calls|preceeding message with 'tool_calls'/i.test(errMsg)) {
          await clearConversation(chatId);
          return '⚠ Đã reset lịch sử AI do conversation lỗi. Hỏi lại câu vừa rồi nhé.';
        }
        return '❌ AI lỗi: ' + errMsg;
      }
      totalTokens += (data.usage && data.usage.total_tokens) || 0;
      const msg = data.choices && data.choices[0] && data.choices[0].message;
      if (!msg) return '❌ AI không trả lời.';
      messages.push(msg);
      if (msg.tool_calls && msg.tool_calls.length) {
        for (const call of msg.tool_calls) {
          let args = {};
          try { args = JSON.parse(call.function.arguments || '{}'); } catch (e) {}
          // Action tool → dispatch + END loop (1 action/conversation turn)
          if (AI_TOOLS.find(t => t.function.name === call.function.name)) {
            const actionResult = await dispatchAIIntent({ fn: call.function.name, args }, chatId);
            messages.push({ role: 'tool', tool_call_id: call.id, content: 'Đã thực hiện action.' });
            await saveConversation(chatId, messages, totalTokens);
            return actionResult;
          }
          // Query tool → execute + add to messages + continue loop
          const result = await executeQueryTool(call.function.name, args);
          const resultStr = JSON.stringify(result).substring(0, 4000);
          messages.push({ role: 'tool', tool_call_id: call.id, content: resultStr });
        }
        continue;
      }
      // Final text response
      await saveConversation(chatId, messages, totalTokens);
      return msg.content || '❌ AI không có câu trả lời.';
    } catch (e) {
      console.error('[askAIAgent]', e.message);
      return '❌ AI exception: ' + e.message;
    }
  }
  return '❌ AI loop quá nhiều bước (>7 turns). Hỏi lại câu rõ ràng hơn.';
}

async function askAIWithTools(question) {
  if (!OPENAI_API_KEY) return null;
  try {
    const resp = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + OPENAI_API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: OPENAI_MODEL,
        messages: [
          {
            role: 'system',
            content: 'Bạn là intent router cho bot quản lý Facebook Ads HC Agency. Nếu user yêu cầu HÀNH ĐỘNG cụ thể (tắt/bật/sửa/xem campaign, list TKQC, báo cáo), gọi đúng function với tham số extract từ message. Nếu là câu hỏi phân tích/giải thích/tư vấn → KHÔNG gọi function, trả lời tự nhiên. Campaign ID là chuỗi số 15-17 chữ số. Ngân sách giữ nguyên format user gõ (200K, 1tr...).'
          },
          { role: 'user', content: question }
        ],
        tools: AI_TOOLS,
        tool_choice: 'auto',
        max_completion_tokens: 300
      })
    });
    const data = await resp.json();
    if (data.error) {
      console.warn('[askAIWithTools] error:', data.error.message);
      return null;
    }
    const msg = data.choices && data.choices[0] && data.choices[0].message;
    if (msg && msg.tool_calls && msg.tool_calls.length) {
      const call = msg.tool_calls[0];
      try {
        return { fn: call.function.name, args: JSON.parse(call.function.arguments || '{}') };
      } catch (e) { return null; }
    }
    return null;
  } catch (e) {
    console.warn('[askAIWithTools] exception:', e.message);
    return null;
  }
}

async function dispatchAIIntent(intent, chatId) {
  const { fn, args } = intent;
  switch (fn) {
    case 'duplicate_campaign':
      return await handleDuplicateCampaign(args);
    case 'pause_campaign':
      return await handleToggleCampaign('Tắt ads ' + args.campaign_id, 'PAUSED');
    case 'activate_campaign':
      return await handleToggleCampaign('Bật ads ' + args.campaign_id, 'ACTIVE');
    case 'check_ads_status':
      return await handleCheckAdsStatus('Kiểm tra ads ' + args.campaign_id);
    case 'set_campaign_budget':
      return await handleCampaignBudget('Ngân sách ads ' + args.campaign_id + ' ' + args.budget, 'set');
    case 'increase_campaign_budget':
      return await handleCampaignBudget('Tăng ns ' + args.campaign_id + ' ' + args.delta, 'increase');
    case 'decrease_campaign_budget':
      return await handleCampaignBudget('Giảm ns ' + args.campaign_id + ' ' + args.delta, 'decrease');
    case 'list_accounts':
      return await handleListAccounts(args && args.search);
    case 'list_campaigns':
      return await handleListCampaigns('/camps ' + args.ad_account_id + (args.filter ? ' ' + args.filter : ''));
    case 'campaign_detail':
      return await handleCampaignDetail('/camp ' + args.campaign_id);
    case 'show_spend_today':
      return await spendToday();
    case 'show_balance_alerts':
      return await balanceAlerts();
    case 'show_unpaid_clients':
      return await unpaidClients();
    default:
      return null;
  }
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
  const systemPrompt = [
    'Bạn là trợ lý của HC Agency (agency Facebook Ads VN).',
    'Trả lời ngắn gọn, dùng tiếng Việt, bullet/số liệu cụ thể.',
    'Định dạng cho Telegram parse_mode HTML: dùng <b>...</b>, <code>...</code>, bullet "•". KHÔNG dùng Markdown như **bold**, ###, hoặc bảng.',
    'Dữ liệu dashboard hiện tại:',
    '',
    context
  ].join('\n');
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
    const json = await r.json();
    // Log raw response cho debug (chỉ POST update — không log GET vì spam)
    if (json && json.error) console.warn('[metaApi POST]', path, 'error:', JSON.stringify(json.error).substring(0, 200));
    return json;
  }
}

async function metaApiGetAll(path, payload, maxPages) {
  const firstPayload = Object.assign({ limit: 500 }, payload || {});
  let page = await metaApi('GET', path, firstPayload);
  if (page.error) return page;

  const rows = [];
  let pages = 0;
  const limit = maxPages || 10;
  while (page && !page.error) {
    if (Array.isArray(page.data)) rows.push.apply(rows, page.data);
    pages += 1;
    if (!page.paging || !page.paging.next || pages >= limit) break;
    const resp = await fetch(page.paging.next);
    page = await resp.json();
  }

  if (page && page.error) return page;
  return { data: rows };
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

function parseAdAccountId(input) {
  if (!input) return null;
  const s = String(input || '');
  let m = s.match(/\bact_(\d{8,})\b/i);
  if (m) return 'act_' + m[1];
  m = s.match(/[?&]act=(\d{8,})/i);
  if (m) return 'act_' + m[1];
  m = s.match(/(?:tkqc|ad\s*account|account|tài\s*khoản|tai\s*khoan)\s*[:#-]?\s*(\d{8,})/i);
  if (m) return 'act_' + m[1];
  return null;
}

function extractMessageCount(actions) {
  let total = 0;
  (actions || []).forEach(function(act){
    const type = String(act.action_type || '').toLowerCase();
    if (type.indexOf('messaging_conversation_started') >= 0 || type === 'onsite_conversion.messaging_conversation_started_7d') {
      total += Number(act.value || 0);
    }
  });
  return total;
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

function cleanNaturalAccountHint(raw) {
  if (!raw) return null;
  let s = String(raw || '').trim();
  s = s.replace(/[?!.。]+$/g, '').trim();
  s = s.replace(/^(?:id\s*)?(?:tkqc|tk|account|ad\s*account|tai\s*khoan|tài\s*khoản)\s*[:=]?\s*/i, '').trim();
  s = s.replace(/^(?:của|cua)\s+/i, '').trim();
  s = s.replace(/\s+(?:có|co)\s+(?:những|nhung|các|cac)?\s*(?:chiến\s*dịch|chien\s*dich|campaigns?|camp|quảng\s*cáo|quang\s*cao).*$/i, '').trim();
  s = s.replace(/\s+(?:đang|dang)\s+(?:chạy|chay|bật|bat|tắt|tat).*$/i, '').trim();
  s = s.replace(/\s+(?:gồm|gom|bao\s+nhiêu|bao\s+nhieu|mấy|may|nào|nao|gì|gi).*$/i, '').trim();
  return s || null;
}

function extractAccountHintFromNaturalCampaignQuestion(text) {
  const s = String(text || '').split(/\n\n/)[0].trim();
  let m = s.match(/(?:id\s*)?(?:tài\s*khoản|tai\s*khoan|tkqc|account|ad\s*account)\s+(.+?)(?:\s+(?:có|co|gồm|gom|đang|dang)\s|$)/i);
  if (m) return cleanNaturalAccountHint(m[1]);
  m = s.match(/(?:campaigns?|camp|chiến\s*dịch|chien\s*dich|quảng\s*cáo|quang\s*cao).*(?:của|cua)\s+(.+)$/i);
  if (m) return cleanNaturalAccountHint(m[1]);
  m = s.match(/^(.+?)\s+(?:có|co)\s+(?:những|nhung|các|cac|bao\s+nhiêu|bao\s+nhieu|mấy|may)?\s*(?:chiến\s*dịch|chien\s*dich|campaigns?|camp|quảng\s*cáo|quang\s*cao)/i);
  if (m) return cleanNaturalAccountHint(m[1]);
  m = s.match(/^(.+?)\s+(?:đang|dang)\s+(?:chạy|chay|bật|bat|tắt|tat).*(?:chiến\s*dịch|chien\s*dich|campaigns?|camp|quảng\s*cáo|quang\s*cao)/i);
  if (m) return cleanNaturalAccountHint(m[1]);
  return null;
}

function extractAccountHintFromNaturalAccountQuestion(text) {
  const s = String(text || '').split(/\n\n/)[0].trim();
  let m = s.match(/(?:id\s*)?(?:tài\s*khoản|tai\s*khoan|tkqc|account|ad\s*account)\s+(.+)$/i);
  if (!m) return null;
  let hint = cleanNaturalAccountHint(m[1]);
  if (!hint || /^(nào|nao|gì|gi|bao\s+nhiêu|bao\s+nhieu|nhiêu|nhieu)$/i.test(hint)) return null;
  hint = hint.replace(/\s+(?:là|la)\s*(?:gì|gi).*$/i, '').trim();
  hint = hint.replace(/\s+(?:id|mã|ma)\s*(?:là|la)?\s*(?:gì|gi).*$/i, '').trim();
  return hint || null;
}

function inferCampaignFilter(text) {
  const s = String(text || '');
  if (/\b(active|đang\s*chạy|dang\s*chay|chạy|chay|đang\s*bật|dang\s*bat|bật|bat|on)\b/i.test(s)) return 'active';
  if (/\b(paused|đang\s*tắt|dang\s*tat|tắt|tat|off|dừng|dung)\b/i.test(s)) return 'paused';
  return 'all';
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
      if (m3) accountHint = m3[1].trim(); // raw, sẽ split bulk sau
    }
  });
  if (!preset || !postInput) return null; // budget optional — fallback default_budget của preset
  // Hỗ trợ bulk: "TKQC: 9326, 1293, 7141" hoặc "9326; 1293"
  const accountHints = accountHint
    ? accountHint.split(/[,;]/).map(function(s){return parseAccountHint(s);}).filter(Boolean)
    : [];
  return { preset: preset, budget: budget, postInput: postInput, accountHints: accountHints };
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
  const actPath = (opts.account && opts.account.fb_account_id) || preset.ad_account_id; // act_xxx
  const log = { source: source, chat_id: chatId, preset_name: preset.name, post_id: postId, post_url: postUrl, budget: budget, ad_account_id: actPath || null, status: 'pending' };
  try {
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
      '<b>Cách 1 — Đa dòng (1 hoặc nhiều TKQC):</b>',
      '<code>Sét Ads:',
      'https://facebook.com/.../posts/...',
      'Công thức: PM1',
      'Ngân sách: 200K',
      'TKQC: 9326, 1293, 7141</code>',
      '',
      '<b>Cách 2 — 1 dòng:</b>',
      '<code>/setads PM1 200K https://... 9326</code>'
    ].join('\n');
  }
  const postId = parsePostId(parsed.postInput);
  if (!postId) return '❌ Không nhận diện được post từ: <code>' + parsed.postInput + '</code>';

  const preset = await getPreset(parsed.preset);
  if (!preset) return '❌ Không tìm thấy công thức <b>' + parsed.preset + '</b>.\nGõ /presets xem danh sách.';

  // ═══ Resolve BUDGET: lệnh ưu tiên → fallback preset.default_budget ═══
  const finalBudget = parsed.budget || preset.default_budget || 0;
  if (!finalBudget || finalBudget < 50000) {
    return [
      '❌ <b>Cần ngân sách</b>',
      '',
      'Không có ngân sách trong lệnh và preset <b>' + preset.name + '</b> không có default.',
      '',
      'Thêm dòng <code>Ngân sách: 200K</code> vào lệnh, hoặc',
      'set default_budget cho preset qua dashboard.'
    ].join('\n');
  }

  // ═══ Resolve TKQC: lệnh ưu tiên → fallback preset.ad_account_id ═══
  const accounts = [];
  const resolveErrors = [];
  if (parsed.accountHints && parsed.accountHints.length) {
    // User chỉ định TKQC trong lệnh (1 hoặc nhiều)
    for (const hint of parsed.accountHints) {
      const r = await resolveAdAccountOverride(hint);
      if (r.error) resolveErrors.push('• "' + hint + '": ' + r.error);
      else if (r.account) accounts.push(r.account);
    }
  } else if (preset.ad_account_id) {
    // Fallback: dùng TKQC mặc định của preset
    const defaultAcc = { fb_account_id: preset.ad_account_id, account_name: preset.source_account_name || preset.ad_account_id };
    accounts.push(defaultAcc);
  }
  // Nếu cả lệnh và preset đều không có TKQC → reject
  if (!accounts.length) {
    return [
      '❌ <b>Cần TKQC</b>',
      '',
      'Không có TKQC trong lệnh và preset <b>' + preset.name + '</b> không có default.',
      '',
      'Thêm dòng <code>TKQC: 9326</code> (hoặc nhiều: <code>TKQC: 9326, 1293</code>) vào lệnh.',
      '',
      'Xem danh sách TKQC: /tkqc'
    ].join('\n');
  }

  // ═══ BULK MODE (≥2 TKQC) ═══
  if (accounts.length >= 2) {
    await sendMessage(chatId, [
      '📋 <b>Bulk Sét Ads — ' + accounts.length + ' TKQC</b>',
      '• Công thức: ' + preset.name + ' (Page: ' + (preset.source_page_name || preset.page_id) + ')',
      '• Post: <code>' + postId + '</code>',
      '• Ngân sách: ' + fm(finalBudget) + 'đ/ngày × ' + accounts.length + ' TKQC' + (parsed.budget ? '' : ' <i>(từ preset)</i>'),
      '• TKQC:',
      ...accounts.map(a => '  - ' + (a.account_name || a.fb_account_id)),
      '',
      '⏳ Đang tạo tuần tự (~' + (accounts.length * 6) + 's)...'
    ].join('\n'));

    const results = [];
    for (const acc of accounts) {
      const r = await createAdsFromPreset(preset, postId, parsed.postInput, finalBudget, 'telegram', chatId, { account: acc });
      results.push({ acc: acc, r: r });
    }
    const ok = results.filter(x => x.r.success);
    const lines = [
      (ok.length === accounts.length ? '✅' : '⚠️') + ' <b>Bulk hoàn tất: ' + ok.length + '/' + accounts.length + ' TKQC</b>',
      ''
    ];
    results.forEach(({ acc, r }) => {
      const name = esc(acc.account_name || acc.fb_account_id);
      if (r.success) {
        lines.push('✅ <b>' + name + '</b>');
        lines.push('   Campaign: <code>' + r.campaign_id + '</code>');
        lines.push('   <a href="' + r.manager_link + '">Mở Ads Manager</a>');
      } else {
        lines.push('❌ <b>' + name + '</b>');
        lines.push('   Bước ' + (r.step || '?') + ': ' + esc((r.error || 'không rõ').substring(0, 120)));
      }
    });
    if (resolveErrors.length) {
      lines.push('');
      lines.push('<b>⚠️ Không resolve được:</b>');
      resolveErrors.forEach(e => lines.push(e));
    }
    return lines.join('\n');
  }

  // ═══ SINGLE MODE (0 hoặc 1 TKQC override) ═══
  if (resolveErrors.length) return '❌ ' + resolveErrors.join('\n');
  const overrideAccount = accounts[0] || null;
  const runAccountName = overrideAccount
    ? (overrideAccount.account_name || overrideAccount.fb_account_id)
    : (preset.source_account_name || preset.ad_account_id);

  await sendMessage(chatId, [
    '📋 <b>Sét Ads với công thức ' + preset.name + '</b>',
    '• Page: ' + (preset.source_page_name || preset.page_id),
    '• TKQC: ' + runAccountName + (overrideAccount ? ' <i>(override)</i>' : ''),
    '• Đích: ' + (preset.destination_type || 'MESSENGER'),
    '• Ngân sách: ' + fm(finalBudget) + 'đ/ngày' + (parsed.budget ? '' : ' <i>(từ preset)</i>'),
    '• Post: <code>' + postId + '</code>',
    '',
    '⏳ Đang tạo Campaign + Adset + Creative + Ad...'
  ].join('\n'));

  const result = await createAdsFromPreset(preset, postId, parsed.postInput, finalBudget, 'telegram', chatId, { account: overrideAccount });
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

// ─── Handle: /tkqc — list TKQC từ DB local (có thể filter theo search keyword) ───
async function handleListAccounts(searchKw) {
  const accounts = await getAdAccounts();
  if (!accounts.length) return '📋 Chưa có TKQC nào trong DB.';
  // Strip dấu tiếng Việt + lowercase để search dễ
  const strip = function(s){ return String(s||'').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/đ/g,'d'); };
  const kw = strip((searchKw||'').trim());
  let pool = accounts;
  if (kw) {
    pool = accounts.filter(a => strip(a.account_name).indexOf(kw) >= 0 || String(a.fb_account_id||'').indexOf(kw) >= 0);
    if (!pool.length) return '🔍 Không tìm thấy TKQC nào khớp "<b>' + searchKw + '</b>". Gõ <code>/tkqc</code> để xem hết.';
    if (pool.length === 1) {
      const a = pool[0];
      const lines = ['<b>💳 ' + (a.account_name || '(no name)') + '</b>'];
      lines.push('ID: <code>' + (a.fb_account_id || '—') + '</code>');
      if (a.spend_cap) {
        const pct = a.amount_spent ? Math.round(a.amount_spent / a.spend_cap * 100) : 0;
        lines.push('Ngưỡng: ' + shortMoney(a.amount_spent||0) + '/' + shortMoney(a.spend_cap) + ' (' + pct + '%)');
      }
      lines.push('Trạng thái: ' + ((a.account_status||1)===1 ? '🟢 Active' : '⏸ Ngưng'));
      return lines.join('\n');
    }
    // Nhiều kết quả → list compact
    const lines = ['<b>🔍 Tìm "' + searchKw + '" → ' + pool.length + ' TKQC khớp:</b>', ''];
    pool.sort((a,b) => (a.account_name||'').localeCompare(b.account_name||'')).forEach(function(a){
      lines.push('• <b>' + (a.account_name || '(no name)') + '</b> — <code>' + (a.fb_account_id || '—') + '</code>');
    });
    return lines.join('\n');
  }
  // Không search → list đầy đủ như cũ
  const active = pool.filter(a => (a.account_status || 1) === 1).sort((a, b) => (a.account_name||'').localeCompare(b.account_name||''));
  const inactive = pool.filter(a => (a.account_status || 1) !== 1);
  const lines = ['<b>💳 Tài khoản quảng cáo (' + accounts.length + ')</b>', ''];
  active.forEach(function(a){
    const pct = a.spend_cap && a.amount_spent ? Math.round(a.amount_spent / a.spend_cap * 100) : 0;
    const warn = pct >= 80 ? ' ⚠️' : '';
    const name = a.account_name || '(no name)';
    const fbId = a.fb_account_id || '—';
    lines.push('• <b>' + name + '</b> — <code>' + fbId + '</code>' + warn);
  });
  if (inactive.length) {
    lines.push('');
    lines.push('<b>⏸ Ngưng (' + inactive.length + '):</b>');
    inactive.slice(0, 5).forEach(function(a){
      lines.push('• ' + (a.account_name || '(no name)') + ' — <code>' + (a.fb_account_id || '—') + '</code>');
    });
    if (inactive.length > 5) lines.push('• ... +' + (inactive.length - 5) + ' khác');
  }
  lines.push('');
  lines.push('<i>📋 Camp của 1 TKQC: <code>/camps &lt;id&gt;</code></i>');
  lines.push('<i>🔍 Chi tiết 1 camp: <code>/camp &lt;id&gt;</code></i>');
  return lines.join('\n');
}

// ─── Handle: /camps <act_id> [filter] — list campaign live từ Meta API ───
async function handleListCampaigns(text) {
  const t = String(text || '').trim();
  let actId = parseAdAccountId(t);
  let m = null;
  if (!actId) {
    m = t.match(/[?&]act=(\d+)/);
    if (m) actId = 'act_' + m[1];
  }
  if (!actId) {
    const nums = t.match(/\b\d{10,}\b/g) || [];
    if (nums.length) actId = 'act_' + nums[nums.length - 1];
  }
  if (!actId) {
    return [
      '❌ Format: <code>/camps &lt;tkqc_id&gt; [active|paused|all]</code>',
      '',
      'Ví dụ:',
      '<code>/camps 1080264843255322</code>            (all)',
      '<code>/camps 1080264843255322 active</code>     (chỉ đang chạy)',
      '<code>/camps 1080264843255322 paused</code>     (chỉ tạm dừng)',
      '',
      'Xem danh sách TKQC: /tkqc'
    ].join('\n');
  }
  // Filter: active | paused | all (default)
  let statusFilter = 'all';
  if (/\b(active|đang\s*chạy|dang\s*chay|chạy|on)\b/i.test(t)) statusFilter = 'ACTIVE';
  else if (/\b(paused|đang\s*tắt|dang\s*tat|tắt|off)\b/i.test(t)) statusFilter = 'PAUSED';

  const r = await metaApi('GET', actId + '/campaigns', {
    fields: 'id,name,status,effective_status,objective,daily_budget,lifetime_budget,created_time',
    limit: 100,
    sort: 'created_time_descending'
  });
  if (r.error) return '❌ Meta lỗi: ' + formatMetaError(r.error);
  let camps = r.data || [];
  if (!camps.length) return '📋 TKQC <code>' + actId + '</code> chưa có campaign nào.';
  const total = camps.length;
  if (statusFilter !== 'all') camps = camps.filter(c => c.status === statusFilter);
  const active = camps.filter(c => c.status === 'ACTIVE');
  const paused = camps.filter(c => c.status === 'PAUSED');
  const archived = camps.filter(c => c.status === 'ARCHIVED');
  const filterLabel = statusFilter === 'ACTIVE' ? ' · lọc 🟢 ACTIVE' : (statusFilter === 'PAUSED' ? ' · lọc ⏸ PAUSED' : '');
  const lines = ['<b>📋 Campaign — ' + actId + '</b>' + filterLabel];
  if (statusFilter === 'all') {
    lines.push('<i>Tổng ' + total + ': ' + active.length + ' chạy · ' + paused.length + ' tắt · ' + archived.length + ' lưu trữ</i>');
  } else {
    lines.push('<i>' + camps.length + '/' + total + ' camp khớp filter</i>');
  }
  lines.push('');
  if (active.length) {
    lines.push('<b>🟢 ACTIVE (' + active.length + '):</b>');
    active.slice(0, 20).forEach(function(c){
      let budget = '';
      if (c.daily_budget && parseInt(c.daily_budget) > 0) budget = ' · ' + fm(parseInt(c.daily_budget)) + 'đ/ngày';
      else if (c.lifetime_budget && parseInt(c.lifetime_budget) > 0) budget = ' · ' + fm(parseInt(c.lifetime_budget)) + 'đ tổng';
      lines.push('• <b>' + esc(c.name || '(no name)') + '</b> — <code>' + c.id + '</code>' + budget);
    });
    if (active.length > 20) lines.push('  <i>... +' + (active.length - 20) + ' khác</i>');
  }
  if (paused.length) {
    if (active.length) lines.push('');
    lines.push('<b>⏸ PAUSED (' + paused.length + '):</b>');
    paused.slice(0, 12).forEach(function(c){
      lines.push('• <b>' + esc(c.name || '(no name)') + '</b> — <code>' + c.id + '</code>');
    });
    if (paused.length > 12) lines.push('  <i>... +' + (paused.length - 12) + ' khác</i>');
  }
  if (archived.length > 0 && statusFilter === 'all') {
    lines.push('');
    lines.push('<i>📦 ' + archived.length + ' campaign đã ARCHIVED (ẩn)</i>');
  }
  lines.push('');
  lines.push('<i>🔍 Chi tiết camp: /camp &lt;id&gt;</i>');
  lines.push('<i>⏸ Tắt: /tatads &lt;id&gt; · ▶ Bật: /batads &lt;id&gt;</i>');
  return lines.join('\n');
}

async function handleNaturalListCampaigns(text) {
  const t = String(text || '').trim();
  const actId = parseAdAccountId(t);
  const filter = inferCampaignFilter(t);
  if (actId) return await handleListCampaigns('/camps ' + actId + ' ' + filter);

  const hint = extractAccountHintFromNaturalCampaignQuestion(t);
  if (!hint) return null;

  const resolved = await resolveAdAccountOverride(hint);
  if (resolved.error) return resolved.error;
  if (!resolved.account || !resolved.account.fb_account_id) return null;

  const reply = await handleListCampaigns('/camps ' + resolved.account.fb_account_id + ' ' + filter);
  return '<i>Tìm TKQC theo tên: <b>' + esc(hint) + '</b> → <b>' + esc(resolved.account.account_name || resolved.account.fb_account_id) + '</b></i>\n\n' + reply;
}

async function handleNaturalAccountCampaignSpendMess(text) {
  const t = String(text || '').trim();
  const actId = parseAdAccountId(t);
  if (actId) return await handleAccountCampaignSpendMess('/spend ' + actId);

  const hint = extractAccountHintFromNaturalCampaignQuestion(t);
  if (!hint) return null;

  const resolved = await resolveAdAccountOverride(hint);
  if (resolved.error) return resolved.error;
  if (!resolved.account || !resolved.account.fb_account_id) return null;

  const reply = await handleAccountCampaignSpendMess('/spend ' + resolved.account.fb_account_id);
  return '<i>Tìm TKQC theo tên: <b>' + esc(hint) + '</b> → <b>' + esc(resolved.account.account_name || resolved.account.fb_account_id) + '</b></i>\n\n' + reply;
}

async function handleAccountCampaignSpendMess(text) {
  const actId = parseAdAccountId(text);
  if (!actId) {
    return [
      '❌ Mình cần TKQC ID để kiểm tra campaign đang chi tiêu.',
      'Ví dụ: <code>act_1909474376641098</code>'
    ].join('\n');
  }

  const today = vnDateStr(0);
  const [account, campaigns, insights] = await Promise.all([
    metaApi('GET', actId, { fields: 'id,name,account_status,currency' }),
    metaApiGetAll(actId + '/campaigns', {
      fields: 'id,name,status,effective_status,daily_budget,lifetime_budget',
      limit: 500,
      sort: 'created_time_descending'
    }, 10),
    metaApiGetAll(actId + '/insights', {
      level: 'campaign',
      fields: 'campaign_id,campaign_name,spend,actions',
      time_range: { since: today, until: today },
      limit: 500
    }, 10)
  ]);

  if (account.error) return '❌ Không đọc được TKQC: <code>' + formatMetaError(account.error) + '</code>';
  if (campaigns.error) return '❌ Không đọc được campaign: <code>' + formatMetaError(campaigns.error) + '</code>';
  if (insights.error) return '❌ Không đọc được insights: <code>' + formatMetaError(insights.error) + '</code>';

  const campaignById = {};
  (campaigns.data || []).forEach(function(c){ campaignById[c.id] = c; });
  const activeCampaigns = (campaigns.data || []).filter(function(c){
    return c.status === 'ACTIVE' || c.effective_status === 'ACTIVE';
  });

  const rows = (insights.data || []).map(function(r){
    const c = campaignById[r.campaign_id] || {};
    const spend = Math.round(Number(r.spend || 0));
    const mess = extractMessageCount(r.actions);
    return {
      id: r.campaign_id,
      name: r.campaign_name || c.name || r.campaign_id || '—',
      status: c.status || '—',
      effective_status: c.effective_status || '—',
      spend: spend,
      mess: mess,
      cost: mess > 0 ? Math.round(spend / mess) : null
    };
  }).filter(function(r){ return r.id && r.spend > 0; }).sort(function(a, b){ return b.spend - a.spend; });

  const totalSpend = rows.reduce(function(sum, r){ return sum + r.spend; }, 0);
  const totalMess = rows.reduce(function(sum, r){ return sum + r.mess; }, 0);
  const avgCost = totalMess > 0 ? Math.round(totalSpend / totalMess) : null;
  const accountName = account.name || actId;
  const currency = account.currency || 'VND';
  const moneySuffix = currency === 'VND' ? 'đ' : ' ' + esc(currency);

  const lines = [
    '<b>📊 Campaign đang chi tiêu</b>',
    '• TKQC: <b>' + esc(accountName) + '</b> — <code>' + actId + '</code>',
    '• Ngày: <b>' + today + '</b>',
    '• Campaign ACTIVE: <b>' + activeCampaigns.length + '</b>',
    '• Có spend hôm nay: <b>' + rows.length + '</b>',
    '• Tổng chi: <b>' + fm(totalSpend) + moneySuffix + '</b>',
    '• Tổng mess: <b>' + fm(totalMess) + '</b>' + (avgCost ? ' · Giá TB: <b>' + fm(avgCost) + moneySuffix + '/mess</b>' : '')
  ];

  if (!rows.length) {
    lines.push('');
    lines.push('Chưa thấy campaign nào có spend trong dữ liệu Meta hôm nay.');
    if (activeCampaigns.length) {
      lines.push('');
      lines.push('<b>Campaign đang bật:</b>');
      activeCampaigns.slice(0, 10).forEach(function(c){
        lines.push('• ' + esc(c.name || c.id) + ' — <code>' + c.id + '</code>');
      });
      if (activeCampaigns.length > 10) lines.push('• ... +' + (activeCampaigns.length - 10) + ' campaign khác');
    }
    return lines.join('\n');
  }

  lines.push('');
  lines.push('<b>Chi tiết:</b>');
  rows.slice(0, 15).forEach(function(r){
    const cost = r.cost ? fm(r.cost) + moneySuffix + '/mess' : '—';
    lines.push('• <b>' + esc(r.name) + '</b>');
    lines.push('  Spend: <b>' + fm(r.spend) + moneySuffix + '</b> · Mess: <b>' + fm(r.mess) + '</b> · Giá mess: <b>' + cost + '</b>');
    lines.push('  Status: <b>' + r.status + '</b> · Effective: <b>' + r.effective_status + '</b> · <code>' + r.id + '</code>');
  });
  if (rows.length > 15) lines.push('• ... +' + (rows.length - 15) + ' campaign khác có spend');
  return lines.join('\n');
}

// ─── Handle: /camp <campaign_id> — chi tiết 1 campaign ───
async function handleCampaignDetail(text) {
  const m = String(text || '').match(/\b(\d{10,})\b/);
  if (!m) {
    return [
      '❌ Format: <code>/camp &lt;campaign_id&gt;</code>',
      '',
      'Ví dụ: <code>/camp 120249707557470404</code>',
      '',
      'Lấy ID camp từ /camps &lt;tkqc_id&gt;'
    ].join('\n');
  }
  const campId = m[1];
  // Fetch song song: campaign + adsets + ads + insights 7 ngày
  const [camp, adsets, ads, insights] = await Promise.all([
    metaApi('GET', campId, { fields: 'id,name,status,effective_status,objective,daily_budget,lifetime_budget,buying_type,account_id,created_time,special_ad_categories' }),
    metaApi('GET', campId + '/adsets', { fields: 'id,name,status,daily_budget,destination_type,promoted_object,targeting,optimization_goal,billing_event', limit: 5 }),
    metaApi('GET', campId + '/ads', { fields: 'id,name,status,effective_status,creative{effective_object_story_id}', limit: 5 }),
    metaApi('GET', campId + '/insights', { fields: 'spend,impressions,clicks,actions', time_range: { since: vnDateStr(-7 * 86400000), until: vnDateStr(0) } })
  ]);
  if (camp.error) return '❌ ' + formatMetaError(camp.error);

  const statusIcon = camp.status === 'ACTIVE' ? '🟢' : (camp.status === 'PAUSED' ? '⏸' : (camp.status === 'ARCHIVED' ? '📦' : '⚪'));
  const adsetRows = adsets.data || [];
  const adRows = ads.data || [];
  const firstAdset = adsetRows[0];
  const targeting = firstAdset?.targeting || {};

  // Targeting summary
  const tgLines = [];
  if (targeting.age_min || targeting.age_max) tgLines.push('Tuổi ' + (targeting.age_min || 13) + '-' + (targeting.age_max || 65));
  if (targeting.genders && targeting.genders.length) {
    const g = [];
    if (targeting.genders.includes(1)) g.push('Nam');
    if (targeting.genders.includes(2)) g.push('Nữ');
    if (g.length) tgLines.push(g.join('+'));
  }
  const geo = targeting.geo_locations || {};
  if (geo.countries && geo.countries.length) tgLines.push(geo.countries.length + ' quốc gia: ' + geo.countries.slice(0, 3).join(','));
  if (geo.regions && geo.regions.length) tgLines.push(geo.regions.length + ' vùng: ' + geo.regions.slice(0, 3).map(x => x.name || x.key).join(', '));
  if (geo.cities && geo.cities.length) tgLines.push(geo.cities.length + ' TP');
  let interestCount = 0;
  if (targeting.flexible_spec) targeting.flexible_spec.forEach(s => { if (s.interests) interestCount += s.interests.length; });
  if (interestCount) tgLines.push(interestCount + ' sở thích');
  if (targeting.custom_audiences && targeting.custom_audiences.length) tgLines.push(targeting.custom_audiences.length + ' custom audience');

  // Budget — daily ưu tiên campaign, fallback adset
  let budgetStr = '—';
  if (camp.daily_budget && parseInt(camp.daily_budget) > 0) budgetStr = fm(parseInt(camp.daily_budget)) + 'đ/ngày (campaign-level)';
  else if (firstAdset && firstAdset.daily_budget) budgetStr = fm(parseInt(firstAdset.daily_budget)) + 'đ/ngày (adset-level)';
  else if (camp.lifetime_budget) budgetStr = fm(parseInt(camp.lifetime_budget)) + 'đ tổng';

  // Insights summary
  const insRow = insights.data?.[0];
  const ins7d = insRow ? {
    spend: parseInt(insRow.spend || 0),
    impressions: parseInt(insRow.impressions || 0),
    clicks: parseInt(insRow.clicks || 0),
    actions: insRow.actions || []
  } : null;

  const lines = [
    statusIcon + ' <b>' + esc(camp.name || '(no name)') + '</b>',
    '',
    '<b>📌 Cấu hình:</b>',
    '• Status: <b>' + camp.status + '</b>' + (camp.effective_status !== camp.status ? ' (effective: ' + camp.effective_status + ')' : ''),
    '• Mục tiêu: ' + esc(camp.objective || '—'),
    '• Buying: ' + (camp.buying_type || 'AUCTION'),
    '• Ngân sách: ' + budgetStr,
    '• TKQC: <code>act_' + camp.account_id + '</code>',
    '• Số adset: ' + adsetRows.length + ' · Số ad: ' + adRows.length
  ];
  if (firstAdset) {
    lines.push('');
    lines.push('<b>🎯 Target (adset đầu tiên):</b>');
    if (firstAdset.destination_type) lines.push('• Đích: ' + firstAdset.destination_type);
    if (firstAdset.optimization_goal) lines.push('• Optimize: ' + firstAdset.optimization_goal);
    if (firstAdset.promoted_object?.page_id) lines.push('• Page: <code>' + firstAdset.promoted_object.page_id + '</code>');
    if (tgLines.length) lines.push('• ' + tgLines.join(' · '));
    else lines.push('• <i>(không có targeting cụ thể — broad)</i>');
  }
  if (ins7d) {
    lines.push('');
    lines.push('<b>📊 Insights 7 ngày:</b>');
    lines.push('• Spend: <b>' + fm(ins7d.spend) + 'đ</b>');
    lines.push('• Impressions: ' + ins7d.impressions.toLocaleString('vi-VN'));
    lines.push('• Clicks: ' + ins7d.clicks.toLocaleString('vi-VN') + (ins7d.clicks && ins7d.impressions ? ' (CTR ' + (ins7d.clicks / ins7d.impressions * 100).toFixed(2) + '%)' : ''));
    // Actions summary
    if (ins7d.actions && ins7d.actions.length) {
      const messageActions = ins7d.actions.find(a => a.action_type && a.action_type.indexOf('messaging_conversation') >= 0);
      const leadActions = ins7d.actions.find(a => a.action_type === 'lead' || a.action_type === 'leadgen_grouped');
      if (messageActions) lines.push('• Mess: ' + messageActions.value);
      if (leadActions) lines.push('• Lead: ' + leadActions.value);
    }
  }
  lines.push('');
  lines.push('<i>Action nhanh:</i>');
  if (camp.status === 'ACTIVE') lines.push('<code>/tatads ' + campId + '</code>');
  else if (camp.status === 'PAUSED') lines.push('<code>/batads ' + campId + '</code>');
  lines.push('<code>/nsads ' + campId + ' &lt;budget&gt;</code> — đổi ngân sách');
  lines.push('<code>/clonecamp ' + campId + ' [budget]</code> — nhân bản');
  return lines.join('\n');
}

// HTML escape helper (cho safe trong reply Telegram parse_mode HTML)
function esc(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
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
    return { type: type, id: id, name: name, ok: false, error: 'Meta trả success=false: ' + JSON.stringify(updated).substring(0, 100) };
  }
  // Meta cần ~0.5-2s để propagate. Verify với retry 3 lần × 700ms delay.
  let verified = null;
  let lastStatus = '', lastEffective = '';
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt > 0) await new Promise(function(res){ setTimeout(res, 700); });
    verified = await metaApi('GET', id, { fields: 'id,name,status,effective_status' });
    if (verified.error) {
      return { type: type, id: id, name: name, ok: false, error: 'Verify lỗi: ' + formatMetaError(verified.error) };
    }
    lastStatus = verified.status || '';
    lastEffective = verified.effective_status || '';
    // STRICT: chỉ check field `status` (user-intent) — không dựa effective_status (hay trễ + nhiều giá trị)
    if (lastStatus === nextStatus) {
      return { type: type, id: id, name: verified.name || name, ok: true, status: lastStatus, effective_status: lastEffective };
    }
  }
  return {
    type: type,
    id: id,
    name: (verified && verified.name) || name,
    ok: false,
    error: 'Meta chưa apply sau 3 lần verify: status=' + (lastStatus || '—') + ' (cần ' + nextStatus + '), effective=' + (lastEffective || '—')
  };
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
    for (const ad of adRows) results.push(await updateMetaObjectStatus('ad', ad.id, ad.name, nextStatus));
    if (explicitAd) results.push(await updateMetaObjectStatus('ad', explicitAd.id, explicitAd.name, nextStatus));
    for (const adset of adsetRows) results.push(await updateMetaObjectStatus('adset', adset.id, adset.name, nextStatus));
    results.push(await updateMetaObjectStatus('campaign', campaignId, before.name, nextStatus));
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
async function route(text, chatId, ctx) {
  const rawText = String(text || '').trim();
  ctx = ctx || {};
  const replyText = String(ctx.replyText || '').trim();
  const lookupText = replyText ? rawText + '\n\n' + replyText : rawText;
  const tLower = rawText.toLowerCase();
  const compactText = normalizeLookupText(rawText);
  const cmd = rawText.split(/\s+/)[0].toLowerCase();
  if (cmd === '/myid' || cmd === '/me' || cmd === '/chatid') return '🆔 Chat ID của bạn: <code>' + chatId + '</code>\n\n<i>Copy số trên paste vào Vercel env <b>TELEGRAM_ALLOWED_CHAT_IDS</b> để giới hạn ai dùng được bot.</i>';
  if (cmd === '/clear' || cmd === '/reset' || cmd === '/quenhet' || /^(quên\s*hết|xóa\s*lịch\s*sử)/i.test(tLower)) { await clearConversation(chatId); return '🧹 Đã xóa lịch sử conversation. AI sẽ không nhớ context cũ.'; }
  if (cmd === '/start' || cmd === '/help') return capabilitiesText();
  if (/(bot|bạn|ban|trợ\s*lý|tro\s*ly|mày|may|em|mình|minh).*(làm|lam|giúp|giup|hỗ\s*trợ|ho\s*tro).*(gì|gi|được|duoc|nào|nao)/i.test(tLower) || /(có\s*thể|co\s*the).*(làm|lam).*(gì|gi)/i.test(tLower)) return capabilitiesText();
  if (cmd === '/chitieu' || cmd === '/spend') return await spendToday();
  if (cmd === '/canhbao' || cmd === '/alert') return await balanceAlerts();
  if (cmd === '/canthu' || cmd === '/unpaid') return await unpaidClients();
  // ═══ A. Mở rộng regex: nhận diện nhiều biến thể tự nhiên ═══
  // Pattern chung "đối tượng": ads | quảng cáo | qc | camp(aign) | chiến dịch | cd
  const objPat = '(ads?|qu[ảa]ng\\s*c[áa]o|qc|camp(aign)?|chi[ếe]n\\s*d[ịi]ch|cd)';

  if (cmd === '/setads' || /^sét\s*ads?\s*[:.]?/i.test(tLower) || /^set\s*ads?\s*[:.]?/i.test(tLower) || /^tạo\s*(quảng\s*cáo|ads|qc)/i.test(tLower) || /^tao\s*(quang\s*cao|ads|qc)/i.test(tLower)) return await handleSetAds(rawText, chatId);
  const asksCampaignList = (
    cmd === '/camps' || cmd === '/campaigns' || cmd === '/chiendich' ||
    /^(chiến|chien)\s*(dịch|dich)/i.test(tLower) ||
    /(list|liệt\s*kê|liet\s*ke|xem|danh\s*sách|danh\s*sach|có\s*những|co\s*nhung)\s+(camp|campaign|chiến|chien|chiến\s*dịch|chien\s*dich|qc|quảng\s*cáo|quang\s*cao)/i.test(tLower) ||
    /(camp|campaign|chiến\s*dịch|chien\s*dich|quảng\s*cáo|quang\s*cao).*(của|cua)\s+/i.test(tLower) ||
    /(?:tài\s*khoản|tai\s*khoan|tkqc|account|ad\s*account)\s+.+(?:có|co|gồm|gom|đang|dang).*(camp|campaign|chiến\s*dịch|chien\s*dich|quảng\s*cáo|quang\s*cao)/i.test(tLower)
  );
  const asksCampaignSpendMess = /(chiendich|campaign|camp)/.test(compactText) && /(chitieu|dangchi|spend|giamess|costmess|mess)/.test(compactText);
  if (asksCampaignSpendMess) {
    const spendMessReply = await handleNaturalAccountCampaignSpendMess(lookupText);
    if (spendMessReply) return spendMessReply;
  }
  if (asksCampaignList) {
    const naturalCampaignReply = await handleNaturalListCampaigns(lookupText);
    if (naturalCampaignReply) return naturalCampaignReply;
    if (cmd === '/camps' || cmd === '/campaigns' || cmd === '/chiendich' || parseAdAccountId(lookupText)) {
      return await handleListCampaigns(lookupText);
    }
    return [
      'Mình hiểu bạn muốn xem danh sách chiến dịch.',
      'Bạn gửi thêm tên TKQC hoặc ID tài khoản quảng cáo nhé.',
      '',
      'Ví dụ: <code>Livefit 03 VAT có những chiến dịch nào?</code>'
    ].join('\n');
  }
  // /tkqc: bắt nhiều cách hỏi tự nhiên — danh sách, liệt kê, có những, xem, list, tất cả
  // KHÔNG match nếu câu chứa keyword action (tắt/bật/sửa/đổi/tạo) — tránh xung đột
  const isListAccQuery = (
    cmd === '/tkqc' || cmd === '/taikhoan' || cmd === '/accounts' ||
    /^(tài|tai)\s*khoản?/i.test(tLower) ||
    /^(id|mã|ma)\s+(tkqc|tài\s*khoản|tai\s*khoan|ad\s*account|account)/i.test(tLower) ||
    /(danh\s*sách|danh\s*sach|liệt\s*kê|liet\s*ke|xem|show|có\s*những|co\s*nhung|có\s*bao\s*nhiêu|co\s*bao\s*nhieu|list|tất\s*cả|tat\s*ca|all|các)\s+(tkqc|tài\s*khoản|tai\s*khoan|ad\s*account|account)/i.test(tLower)
  );
  if (isListAccQuery && !/(tắt|bật|sửa|đổi|tạo|set|tat|bat|sua|doi)/i.test(tLower)) {
    return await handleListAccounts(extractAccountHintFromNaturalAccountQuestion(rawText));
  }
  if (cmd === '/camp' || cmd === '/campaign' || /^(chi\s*tiết|chi\s*tiet)\s*(camp|chiến|chien)/i.test(tLower)) return await handleCampaignDetail(lookupText);
  if (cmd === '/luupreset' || cmd === '/savepreset' || /^(lưu|luu)\s*(preset|công\s*thức|cong\s*thuc)/i.test(tLower)) return await handleSavePreset(rawText, chatId);
  if (cmd === '/presets' || cmd === '/listpresets' || cmd === '/congthuc' || /^(xem|list|danh\s*sách|danh\s*sach)\s*(preset|công\s*thức|cong\s*thuc)/i.test(tLower)) return await handleListPresets();
  // TẮT: tắt | dừng | stop | pause | dung + đối tượng
  if (cmd === '/tatads' || cmd === '/pauseads' || cmd === '/pause' || new RegExp('^(t[ắa]t|d[ừu]ng|stop|pause)\\s+' + objPat, 'i').test(tLower)) return await handleToggleCampaign(lookupText, 'PAUSED');
  // BẬT: bật | mở | on | resume | start | active + đối tượng
  if (cmd === '/batads' || cmd === '/resumeads' || cmd === '/activeads' || cmd === '/resume' || new RegExp('^(b[ậa]t|m[ởo]|on|resume|start|active|chạy\\s*lại|chay\\s*lai)\\s+' + objPat, 'i').test(tLower)) return await handleToggleCampaign(lookupText, 'ACTIVE');
  // KIỂM TRA: kiểm tra | xem | trạng thái | status | check + đối tượng
  if (cmd === '/checkads' || cmd === '/statusads' || cmd === '/check' || new RegExp('^(ki[ểe]m\\s*tra|xem|tr[ạa]ng\\s*th[áa]i|status|check)\\s+' + objPat, 'i').test(tLower)) return await handleCheckAdsStatus(lookupText);
  // ĐẶT NGÂN SÁCH: ngân sách | budget | đặt ngân sách | set budget
  if (cmd === '/nsads' || cmd === '/budgetads' || cmd === '/setbudget' || /^(ng[âa]n\s*s[áa]ch|budget|đặt\s*ng[âa]n\s*s[áa]ch|dat\s*ngan\s*sach|set\s*budget)/i.test(tLower)) return await handleCampaignBudget(rawText, 'set');
  // TĂNG NGÂN SÁCH: tăng ns | tăng ngân sách | increase | thêm budget
  if (cmd === '/tangns' || cmd === '/increasebudget' || /^(t[ăa]ng|th[êe]m|increase|raise)\s*(ns|ng[âa]n\s*s[áa]ch|budget)/i.test(tLower)) return await handleCampaignBudget(rawText, 'increase');
  // GIẢM NGÂN SÁCH: giảm ns | giảm ngân sách | decrease | bớt budget
  if (cmd === '/giamns' || cmd === '/decreasebudget' || /^(gi[ảa]m|b[ớo]t|hạ|ha|decrease|lower)\s*(ns|ng[âa]n\s*s[áa]ch|budget)/i.test(tLower)) return await handleCampaignBudget(rawText, 'decrease');
  if (cmd === '/clonecamp' || cmd === '/duplicate' || cmd === '/nhanban' || /^(nhân\s*bản|nhan\s*ban|clone|copy|duplicate|sao\s*chép|sao\s*chep)\s+(campaign|camp|ads?|chiến\s*dịch|chien\s*dich|qc)/i.test(tLower)) {
    const m = lookupText.match(/\b(\d{10,})\b/);
    if (!m) return '❌ Format: <code>/clonecamp &lt;campaign_id&gt; [budget]</code>\n\nVD: <code>/clonecamp 120249707557470404 200K</code>';
    const parts = rawText.trim().split(/\s+/);
    const budgetStr = parts.find(function(p, i){ return i > 0 && p !== m[1] && parseBudget(p) >= 50000; });
    return await handleDuplicateCampaign({ source_campaign_id: m[1], budget: budgetStr || null });
  }
  // ═══ Cấp 3: AI Agent multi-turn với memory + DB query + Meta live ═══
  // Mọi câu không match command đều qua agent. Agent tự quyết khi nào cần query DB,
  // khi nào trả lời text, khi nào trigger action. Có context conversation per chat_id.
  const agentQuestion = replyText ? 'Ngữ cảnh tin nhắn được reply:\n' + replyText + '\n\nCâu hỏi user:\n' + rawText : rawText;
  const agentReply = await askAIAgent(agentQuestion, chatId);
  if (agentReply) return agentReply;
  // Fallback cuối nếu agent fail
  return await askAI(agentQuestion);
}

// ═══ ENTRY ═══
module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).send('Method not allowed');

  if (TELEGRAM_WEBHOOK_SECRET && req.headers['x-telegram-bot-api-secret-token'] !== TELEGRAM_WEBHOOK_SECRET) {
    return res.status(401).send('Unauthorized');
  }

  const update = req.body || {};
  const msg = update.message || update.edited_message;
  if (!msg || !msg.chat) return res.status(200).send('ok');

  const chatId = String(msg.chat.id);
  const text = getTelegramMessageText(msg);
  const replyText = getTelegramMessageText(msg.reply_to_message);
  if (!text) return res.status(200).send('ok');

  if (ALLOWED_CHAT_IDS.length && ALLOWED_CHAT_IDS.indexOf(chatId) < 0) {
    await sendMessage(chatId, '❌ Bot này dành riêng cho HC Agency.\nChat ID của bạn: <code>' + chatId + '</code>');
    return res.status(200).send('ok');
  }

  try {
    const reply = await route(text, chatId, { replyText: replyText });
    await sendMessage(chatId, reply, {reply_to_message_id: msg.message_id});
  } catch (e) {
    console.error('[Telegram route error]', e);
    await sendMessage(chatId, '❌ Lỗi xử lý: ' + (e.message || 'Không rõ'));
  }

  return res.status(200).send('ok');
};
