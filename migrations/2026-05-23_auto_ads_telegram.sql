-- ═══════════════════════════════════════════════════════════════
-- Migration: Telegram bot "Set Ads" tự động
--
-- 2 bảng:
-- 1. auto_ads_preset — "Công thức" (A1, B2,...) chứa page + TKQC + targeting
-- 2. auto_ads_log — Lịch sử mọi lần bot tạo ads (để audit + debug)
--
-- Sau khi migration, vào Telegram gõ:
--   /luupreset A1 <campaign_id_cũ_để_clone>   → tạo preset từ campaign Meta
--   Sét Ads:
--   <link post>
--   Công thức: A1
--   Ngân sách: 200K
-- → bot tự chạy
--
-- Cách chạy:
--   SQL console hoặc psql → paste → Run
-- ═══════════════════════════════════════════════════════════════

-- 1. auto_ads_preset
CREATE TABLE IF NOT EXISTS auto_ads_preset (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,                -- "A1", "B2", "Mom_Mess_HCM"
  page_id text NOT NULL,                    -- Facebook Page ID
  ad_account_id text NOT NULL,              -- act_xxx (Meta format)
  destination_type text NOT NULL DEFAULT 'MESSENGER', -- MESSENGER | WHATSAPP | INSTAGRAM_DIRECT | ON_AD
  default_budget bigint NOT NULL DEFAULT 200000,      -- VNĐ/ngày
  targeting jsonb NOT NULL DEFAULT '{}',    -- {age_min, age_max, genders, geo_locations, flexible_spec, custom_audiences, saved_audience_id}
  source_campaign_id text,                  -- Campaign Meta gốc clone từ (debug)
  source_page_name text,                    -- Hiển thị "Page: HC Quảng Cáo" trong preview (cache, không dùng để chạy)
  source_account_name text,                 -- Hiển thị "TKQC: TK Main"
  note text,                                -- Ghi chú free text
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_auto_ads_preset_name ON auto_ads_preset(name);

-- 2. auto_ads_log
CREATE TABLE IF NOT EXISTS auto_ads_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  preset_name text,
  post_id text,
  post_url text,
  budget bigint,
  campaign_id text,                          -- Meta returns sau khi tạo
  adset_id text,
  creative_id text,
  ad_id text,
  source text NOT NULL DEFAULT 'telegram',   -- 'telegram' | 'web'
  chat_id text,                              -- nếu source=telegram
  status text NOT NULL,                      -- 'success' | 'failed' | 'pending'
  error_message text,
  error_step text,                           -- bước nào fail (campaign/adset/creative/ad)
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_auto_ads_log_created ON auto_ads_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_auto_ads_log_preset ON auto_ads_log(preset_name);

-- 3. Trigger auto-update updated_at
CREATE OR REPLACE FUNCTION update_auto_ads_preset_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

DROP TRIGGER IF EXISTS trg_auto_ads_preset_updated_at ON auto_ads_preset;
CREATE TRIGGER trg_auto_ads_preset_updated_at
  BEFORE UPDATE ON auto_ads_preset
  FOR EACH ROW EXECUTE FUNCTION update_auto_ads_preset_updated_at();

-- 4. RLS
ALTER TABLE auto_ads_preset ENABLE ROW LEVEL SECURITY;
ALTER TABLE auto_ads_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "auto_ads_preset auth all" ON auto_ads_preset;
CREATE POLICY "auto_ads_preset auth all" ON auto_ads_preset
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "auto_ads_log auth read" ON auto_ads_log;
CREATE POLICY "auto_ads_log auth read" ON auto_ads_log
  FOR SELECT TO authenticated USING (true);

-- Service role bypass RLS tự động (dùng cho Telegram bot từ /api/telegram)

-- ═══ KIỂM TRA ═══
-- SELECT name, page_id, ad_account_id, default_budget FROM auto_ads_preset;
-- SELECT preset_name, status, created_at, error_message FROM auto_ads_log ORDER BY created_at DESC LIMIT 10;
