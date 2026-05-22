// HC Agency — Public lead form receiver
// Vercel Serverless Function tại /api/trial
//
// Nhận POST từ landing page (zalo.hc-agency.online, v.v.) → gọi RPC
// submit_public_lead (SECURITY DEFINER, anti-dup theo phone) → ghi client
// vào DB với status='prospect', care_status='new'.
//
// ENV cần (đã có sẵn cho /api/telegram, /api/meta):
//   SUPABASE_URL
//   SUPABASE_SERVICE_ROLE_KEY

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

module.exports = async (req, res) => {
  // CORS — form có thể chạy ở subdomain khác (zalo.hc-agency.online)
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' });

  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    console.error('[trial] Supabase env chưa đầy đủ');
    return res.status(500).json({ error: 'server_misconfigured' });
  }

  const body = req.body || {};
  const name = (body.name || '').trim();
  const phone = (body.phone || '').trim();
  if (!name || !phone) {
    return res.status(400).json({ error: 'name_and_phone_required' });
  }

  // Chỉ pass qua các field RPC hỗ trợ — tránh ghi tạp data
  const payload = {
    name: name,
    phone: phone,
    email: (body.email || '').trim() || null,
    zalo: (body.zalo || '').trim() || null,
    company_name: (body.company_name || '').trim() || null,
    industry: (body.industry || '').trim() || null,
    services: Array.isArray(body.services) ? body.services : undefined,
    message: (body.message || '').trim() || null,
    monthly_budget: (body.monthly_budget || '').trim() || null,
    source: (body.source || '').trim() || 'web_form',
  };

  try {
    const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, { auth: { persistSession: false } });
    const { data, error } = await sb.rpc('submit_public_lead', { p_data: payload });
    if (error) {
      console.error('[trial] RPC error:', error.message);
      return res.status(500).json({ error: error.message });
    }
    return res.status(200).json({ ok: true, id: data && data.id, duplicate: !!(data && data.duplicate) });
  } catch (e) {
    console.error('[trial] exception:', e.message || e);
    return res.status(500).json({ error: String(e.message || e) });
  }
};
