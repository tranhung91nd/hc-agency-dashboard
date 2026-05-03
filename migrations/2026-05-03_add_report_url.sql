-- ═══════════════════════════════════════════════════════════════
-- Migration: thêm cột report_url vào bảng client
--   - report_url — TEXT — link Google Sheet / Drive báo cáo riêng cho từng khách
--
-- Cách chạy:
--   1) Vào Supabase Dashboard → SQL Editor → New query
--   2) Paste toàn bộ file này → Run
--   3) Reload app, vào Khách hàng → Báo cáo, bấm "+ Thêm link" hoặc ✏ trên khách bất kỳ
-- ═══════════════════════════════════════════════════════════════

ALTER TABLE client ADD COLUMN IF NOT EXISTS report_url TEXT;

-- ═══ KIỂM TRA ═══
-- SELECT name, report_url FROM client WHERE report_url IS NOT NULL;
