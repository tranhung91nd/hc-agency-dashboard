-- ═══════════════════════════════════════════════════════════════
-- Migration: thêm cột rental_fee_pct vào bảng client
--   - Phí dịch vụ Cho thuê TKQC = % spend hàng tháng (3-4% tuỳ khách)
--   - Lưu dạng decimal phân số: 0.03 = 3%, 0.04 = 4%
--   - Chỉ tính khi services chứa 'tkqc_rental' VÀ rental_fee_pct > 0
--
-- Cách chạy:
--   1) Vào Supabase Dashboard → SQL Editor → New query
--   2) Paste toàn bộ file này → Run
--   3) Reload app, mở Modal sửa khách hàng → tick "Cho thuê TKQC"
--      → ô % Phí thuê hiện ra → nhập 3 hoặc 4 → Lưu
-- ═══════════════════════════════════════════════════════════════

-- 1. Thêm cột (idempotent)
ALTER TABLE client
  ADD COLUMN IF NOT EXISTS rental_fee_pct numeric(5,4) DEFAULT NULL;

COMMENT ON COLUMN client.rental_fee_pct IS
  'Tỷ lệ phí thuê TKQC trên spend (decimal phân số): 0.03 = 3%, 0.04 = 4%. NULL = không thuê / dùng phí cố định.';

-- 2. (Không cần backfill — khách hiện tại đều dùng phí cố định, để NULL.)

-- ═══ KIỂM TRA ═══
-- SELECT name, services, service_fee, rental_fee_pct
-- FROM client
-- WHERE 'tkqc_rental' = ANY(services)
-- ORDER BY created_at DESC;
