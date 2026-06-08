// Cron job: quét camp vi phạm mess/form → ghi phạt 10K vào bảng penalty.
// Chạy 10h30 VN mỗi ngày (T2-T7) qua GitHub Action scan-penalty.yml.
// Logic chi tiết: xem migrations/2026-05-12_auto_penalty_camp.sql

const { createDbClient } = require('../api/_lib/db');

const db = createDbClient();

function vnDateToday() {
  const d = new Date();
  const u = d.getTime() + d.getTimezoneOffset() * 60000 + 25200000;
  const v = new Date(u);
  return v.getFullYear() + '-' + ('0' + (v.getMonth() + 1)).slice(-2) + '-' + ('0' + v.getDate()).slice(-2);
}

(async () => {
  const scanDate = process.env.SCAN_DATE || vnDateToday();
  console.log(`[scan-penalty] scan_date=${scanDate}`);

  const { data, error } = await db.rpc('auto_scan_camp_penalty', { p_scan_date: scanDate });
  if (error) {
    console.error('[scan-penalty] RPC error:', error.message);
    process.exit(1);
  }
  console.log(`[scan-penalty] inserted=${data}`);
})();
