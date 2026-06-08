-- ═══════════════════════════════════════════════════════════════
-- Migration: Lưu ad_account_id vào auto_ads_log
--
-- Lý do: link "Mở Ads Manager" cần biết TKQC để build URL đầy đủ
--   https://adsmanager.facebook.com/adsmanager/manage/campaigns
--     ?act=<TKQC_ID>&selected_campaign_ids=<CAMP_ID>
-- Trước đây link không có act= → mở vào TKQC mặc định, không trỏ
-- đúng vào campaign cần xem.
--
-- Row cũ → ad_account_id = NULL, UI fallback lookup từ preset.
-- Row mới (từ api/telegram.js + api/auto-ads-create.js) sẽ lưu trực tiếp.
--
-- Cách chạy: SQL console hoặc psql → paste → Run
-- ═══════════════════════════════════════════════════════════════

ALTER TABLE auto_ads_log ADD COLUMN IF NOT EXISTS ad_account_id text;

COMMENT ON COLUMN auto_ads_log.ad_account_id IS
  'act_xxx — TKQC chạy campaign này. Dùng để build link Ads Manager đầy đủ.';
