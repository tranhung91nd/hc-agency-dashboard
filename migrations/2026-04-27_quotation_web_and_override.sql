-- ═══════════════════════════════════════════════════════════════
-- Migration: bổ sung gói Web App + cho phép sửa giá tay
--
-- - quotation.web_fee: phí Lập trình Web App (VNĐ)
-- - quotation.web_note: phạm vi Web App (text mô tả tự do)
-- - quotation.fanpage_price_override: ghi đè giá Fanpage (NULL = dùng
--   giá theo bậc FANPAGE_PACKAGES gốc)
--
-- Cách chạy:
--   Vào Supabase Dashboard → SQL Editor → New query → paste → Run
-- ═══════════════════════════════════════════════════════════════

ALTER TABLE quotation
  ADD COLUMN IF NOT EXISTS web_fee bigint DEFAULT 0,
  ADD COLUMN IF NOT EXISTS web_note text,
  ADD COLUMN IF NOT EXISTS fanpage_price_override bigint;

COMMENT ON COLUMN quotation.web_fee IS 'Phí Lập trình Web App (VNĐ), 0 nếu không có gói này';
COMMENT ON COLUMN quotation.web_note IS 'Mô tả phạm vi Web App: tính năng, công nghệ, thời gian bàn giao';
COMMENT ON COLUMN quotation.fanpage_price_override IS 'Ghi đè giá Fanpage (VNĐ). NULL = dùng giá gói chuẩn (Gói 1 / Gói 2)';

-- ═══ KIỂM TRA ═══
-- SELECT quote_number, package_type, web_fee, web_note IS NOT NULL AS has_web_note,
--        fanpage_price_override
-- FROM quotation ORDER BY created_at DESC LIMIT 10;
