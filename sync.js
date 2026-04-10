const { createClient } = require('@supabase/supabase-js');

const SB_URL = process.env.SUPABASE_URL;
const SB_KEY = process.env.SUPABASE_KEY;
const META_TOKEN = process.env.META_TOKEN;

if (!SB_URL || !SB_KEY || !META_TOKEN) {
  console.error('Missing env vars: SUPABASE_URL, SUPABASE_KEY, META_TOKEN');
  process.exit(1);
}

const sb = createClient(SB_URL, SB_KEY);

// Vietnamese timezone (UTC+7)
function vnDate(offset) {
  const d = new Date();
  const u = d.getTime() + d.getTimezoneOffset() * 60000 + 25200000 + (offset || 0);
  const v = new Date(u);
  return v.getFullYear() + '-' + ('0' + (v.getMonth() + 1)).slice(-2) + '-' + ('0' + v.getDate()).slice(-2);
}

const today = vnDate(0);
const yesterday = vnDate(-86400000);

// Determine which date to sync based on VN hour
const vnHour = (() => {
  const d = new Date();
  const u = d.getTime() + d.getTimezoneOffset() * 60000 + 25200000;
  return new Date(u).getHours();
})();

// 7h sáng → sync ngày hôm qua (dữ liệu đã chốt)
// 23h đêm → sync ngày hôm nay (dữ liệu gần cuối ngày)
const syncDate = vnHour < 12 ? yesterday : today;

console.log(`[HC Sync] VN time: ${vnHour}h | Sync date: ${syncDate}`);

async function main() {
  let saved = 0, errors = 0;

  // Load staff, clients, ad accounts
  const [staffRes, clientRes, adRes] = await Promise.all([
    sb.from('staff').select('*'),
    sb.from('client').select('*'),
    sb.from('ad_account').select('*').not('fb_account_id', 'is', null)
  ]);

  if (staffRes.error || clientRes.error || adRes.error) {
    console.error('DB error:', staffRes.error || clientRes.error || adRes.error);
    process.exit(1);
  }

  const staff = staffRes.data;
  const clients = clientRes.data;
  const adAccounts = adRes.data;
  const normal = adAccounts.filter(a => !a.is_shared);
  const shared = adAccounts.filter(a => a.is_shared);

  console.log(`[HC Sync] ${adAccounts.length} TK (${normal.length} riêng + ${shared.length} chung)`);

  // ═══ BATCH API: 50 TK thường / batch ═══
  for (let b = 0; b < normal.length; b += 50) {
    const chunk = normal.slice(b, b + 50);
    const batchReqs = chunk.map(a => ({
      method: 'GET',
      relative_url: `${a.fb_account_id}/insights?fields=spend&time_range={"since":"${syncDate}","until":"${syncDate}"}`
    }));

    try {
      const resp = await fetch('https://graph.facebook.com/v25.0/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `batch=${encodeURIComponent(JSON.stringify(batchReqs))}&access_token=${META_TOKEN}&include_headers=false`
      });
      const results = await resp.json();

      // Parallel DB writes (10 at a time)
      const tasks = [];
      for (let j = 0; j < results.length; j++) {
        const idx = j;
        const a = chunk[idx];
        tasks.push((async () => {
          try {
            const body = JSON.parse(results[idx].body || '{}');
            let spend = 0;
            if (body.data && body.data.length) spend = Math.round(parseFloat(body.data[0].spend));

            await sb.from('daily_spend').delete()
              .eq('ad_account_id', a.id).eq('report_date', syncDate).is('staff_id', null);
            const r = await sb.from('daily_spend').insert({
              ad_account_id: a.id, report_date: syncDate, spend_amount: spend
            });
            if (!r.error) saved++; else errors++;
          } catch (e) { errors++; }
        })());

        if (tasks.length >= 10 || j === results.length - 1) {
          await Promise.all(tasks);
          tasks.length = 0;
        }
      }
    } catch (e) {
      console.error(`Batch error: ${e.message}`);
      errors += chunk.length;
    }
  }

  // ═══ TK dùng chung: song song 5 TK ═══
  const sharedFns = shared.map(a => async () => {
    try {
      const url = `https://graph.facebook.com/v25.0/${a.fb_account_id}/insights?level=campaign&fields=campaign_name,spend&time_range={"since":"${syncDate}","until":"${syncDate}"}&limit=500&access_token=${META_TOKEN}`;
      const resp = await fetch(url);
      const data = await resp.json();
      if (data.error) { errors++; return; }

      await sb.from('daily_spend').delete()
        .eq('ad_account_id', a.id).eq('report_date', syncDate).not('staff_id', 'is', null);

      const combo = {};
      (data.data || []).forEach(c => {
        const spend = Math.round(parseFloat(c.spend || 0));
        if (!spend) return;
        const parts = (c.campaign_name || '').split('_');
        const staffPart = (parts[0] || '').trim();
        const clientPart = (parts[2] || '').trim();
        const ms = staff.find(s => s.campaign_keyword && staffPart.toLowerCase() === s.campaign_keyword.toLowerCase());
        const mc = clients.find(cl => cl.campaign_keyword && clientPart.toLowerCase().indexOf(cl.campaign_keyword.toLowerCase()) >= 0);
        if (ms) {
          const key = ms.id + '|' + (mc ? mc.id : '');
          if (!combo[key]) combo[key] = { sid: ms.id, cid: mc ? mc.id : null, spend: 0 };
          combo[key].spend += spend;
        }
      });

      for (const k of Object.keys(combo)) {
        const cb = combo[k];
        const r = await sb.from('daily_spend').insert({
          ad_account_id: a.id, report_date: syncDate,
          spend_amount: cb.spend, staff_id: cb.sid, matched_client_id: cb.cid
        });
        if (!r.error) saved++; else errors++;
      }
    } catch (e) { errors++; }
  });

  for (let s = 0; s < sharedFns.length; s += 5) {
    await Promise.all(sharedFns.slice(s, s + 5).map(fn => fn()));
  }

  console.log(`[HC Sync] Done! ${saved} saved, ${errors} errors`);
  if (errors > 0) process.exit(1);
}

main().catch(e => { console.error(e); process.exit(1); });
