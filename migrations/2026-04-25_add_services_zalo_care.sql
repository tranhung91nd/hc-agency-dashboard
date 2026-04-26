-- ═══════════════════════════════════════════════════════════════
-- Migration: thêm 3 trường vào bảng client
--   1. services      — TEXT[]  → mảng mã dịch vụ (fb_ads, tkqc_rental, web_dev, …)
--   2. zalo          — TEXT    → số phone / username / link đầy đủ
--   3. care_status   — TEXT    → trạng thái CSKH (new, contacting, sent_quote, negotiating, won, lost)
--
-- Cách chạy:
--   1) Vào Supabase Dashboard → SQL Editor → New query
--   2) Paste toàn bộ file này → Run
--   3) Reload app, mở khách hàng bất kỳ và bấm ✏️ để sửa
-- ═══════════════════════════════════════════════════════════════

-- 1. Thêm cột (idempotent — chạy lại không lỗi)
ALTER TABLE client ADD COLUMN IF NOT EXISTS services      TEXT[]  DEFAULT ARRAY['fb_ads']::TEXT[];
ALTER TABLE client ADD COLUMN IF NOT EXISTS zalo          TEXT;
ALTER TABLE client ADD COLUMN IF NOT EXISTS care_status   TEXT    DEFAULT 'new';

-- 2. Backfill cho khách hàng đã có
--   - Tất cả khách cũ → mặc định services = ['fb_ads'] (vì lịch sử bên mình toàn FB Ads)
UPDATE client SET services    = ARRAY['fb_ads']::TEXT[] WHERE services IS NULL;

--   - Khách CHÍNH THỨC (status='active' hoặc 'paused' hoặc 'stopped') → care_status = 'won' (đã chốt ký)
UPDATE client SET care_status = 'won' WHERE care_status IS NULL AND COALESCE(status,'active') <> 'prospect';

--   - Khách TIỀM NĂNG (status='prospect') → care_status = 'new'
UPDATE client SET care_status = 'new' WHERE care_status IS NULL AND status = 'prospect';

-- 3. Index nhẹ để filter nhanh hơn (tùy chọn)
CREATE INDEX IF NOT EXISTS idx_client_care_status ON client(care_status);
CREATE INDEX IF NOT EXISTS idx_client_services    ON client USING GIN(services);

-- ═══ KIỂM TRA ═══
-- SELECT name, status, services, zalo, care_status FROM client ORDER BY created_at DESC LIMIT 20;
