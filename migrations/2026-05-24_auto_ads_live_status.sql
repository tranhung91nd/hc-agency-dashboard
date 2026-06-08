-- ═══════════════════════════════════════════════════════════════
-- Migration: Cache live status từ Meta cho auto_ads_log
--
-- Mỗi lần user mở tab "Lịch sử Auto Ads", batch GET từ Meta cho
-- tất cả campaign_id chưa refresh > 5 phút. Lưu vào 2 cột mới:
--   live_status (ACTIVE/PAUSED/ARCHIVED/DELETED/...)
--   live_status_updated_at (timestamp)
--
-- UI hiển thị live_status thay vì bot status (success/failed).
-- Nút action thay đổi theo: ACTIVE → "Tắt", PAUSED → "Bật".
--
-- Cách chạy: SQL console hoặc psql → paste → Run
-- ═══════════════════════════════════════════════════════════════

ALTER TABLE auto_ads_log ADD COLUMN IF NOT EXISTS live_status text;
ALTER TABLE auto_ads_log ADD COLUMN IF NOT EXISTS live_status_updated_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_auto_ads_log_campaign ON auto_ads_log(campaign_id);

COMMENT ON COLUMN auto_ads_log.live_status IS
  'Trạng thái LIVE từ Meta (ACTIVE/PAUSED/ARCHIVED/DELETED). Refresh khi mở tab Lịch sử.';
