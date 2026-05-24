-- ═══════════════════════════════════════════════════════════════
-- Migration: ad_account_id của auto_ads_preset thành OPTIONAL
--
-- Lý do: preset bây giờ là template thuần (target + page + destination +
-- default budget). TKQC sẽ chỉ định khi user gõ lệnh Sét Ads → 1 preset
-- dùng được cho nhiều TKQC khác nhau.
--
-- Preset cũ có ad_account_id → vẫn giữ làm metadata (source clone).
-- Preset mới có thể tạo không cần TKQC.
--
-- Cách chạy: Supabase SQL Editor → paste → Run
-- ═══════════════════════════════════════════════════════════════

ALTER TABLE auto_ads_preset ALTER COLUMN ad_account_id DROP NOT NULL;

-- Comment cập nhật ý nghĩa cột
COMMENT ON COLUMN auto_ads_preset.ad_account_id IS
  'TKQC nguồn clone từ (optional — chỉ để metadata). Khi run lệnh phải chỉ định TKQC riêng.';
COMMENT ON COLUMN auto_ads_preset.source_account_name IS
  'Tên TKQC nguồn clone từ (cache, không dùng để chạy ads).';
