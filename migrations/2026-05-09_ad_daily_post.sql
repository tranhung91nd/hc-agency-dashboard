-- ═══════════════════════════════════════════════════════════════
-- Migration: Báo cáo theo bài chạy (post Facebook)
--
-- Pull dữ liệu Meta Insights ở mức level=ad (mỗi ad = 1 dòng/ngày).
-- Mỗi ad gắn với 1 post Facebook qua creative.effective_object_story_id.
-- Trong báo cáo, gom theo post_id để biết bài nào hiệu quả nhất.
--
-- Khác biệt với campaign_daily_mess:
--   - campaign_daily_mess: 1 dòng = 1 campaign × ngày
--   - ad_daily_post:       1 dòng = 1 ad      × ngày (chi tiết hơn)
--
-- Cách chạy:
--   SQL console hoặc psql → paste → Run
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS ad_daily_post (
  ad_account_id   uuid NOT NULL REFERENCES ad_account(id) ON DELETE CASCADE,
  ad_id           text NOT NULL,
  report_date     date NOT NULL,
  ad_name         text,
  campaign_id     text,
  campaign_name   text,
  post_id         text,                 -- effective_object_story_id (vd "100093056073018_878940138551181")
  post_url        text,                 -- https://facebook.com/{page_id}/posts/{post_id}
  thumbnail_url   text,
  spend           numeric(14,2) NOT NULL DEFAULT 0,
  mess_count      integer       NOT NULL DEFAULT 0,
  comment_count   integer       NOT NULL DEFAULT 0,
  lead_count      integer       NOT NULL DEFAULT 0,
  checkout_count  integer       NOT NULL DEFAULT 0,
  ad_status       text,                  -- ACTIVE | PAUSED
  synced_at       timestamptz DEFAULT now(),
  PRIMARY KEY (ad_account_id, ad_id, report_date)
);

CREATE INDEX IF NOT EXISTS idx_ad_daily_post_account_date
  ON ad_daily_post (ad_account_id, report_date DESC);
CREATE INDEX IF NOT EXISTS idx_ad_daily_post_post_id
  ON ad_daily_post (post_id) WHERE post_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_ad_daily_post_campaign
  ON ad_daily_post (campaign_id) WHERE campaign_id IS NOT NULL;

-- RLS: cho phép authenticated user (admin/staff đã login) full quyền
ALTER TABLE ad_daily_post ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ad_daily_post_authenticated_all" ON ad_daily_post;
CREATE POLICY "ad_daily_post_authenticated_all" ON ad_daily_post
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

COMMENT ON TABLE ad_daily_post IS
  'Insights Meta ở mức ad × ngày. Gom theo post_id để báo cáo hiệu quả từng bài chạy.';
COMMENT ON COLUMN ad_daily_post.post_id IS
  'Format: {page_id}_{post_id}. Có thể NULL nếu ad không gắn post (vd dynamic creative).';
COMMENT ON COLUMN ad_daily_post.ad_id IS
  'Meta ad id. Cùng 1 post có thể được boost bởi nhiều ad — primary key key theo ad_id để không trùng.';

-- ═══ KIỂM TRA sau khi chạy ═══
-- SELECT COUNT(*) FROM ad_daily_post;  -- ban đầu = 0
-- SELECT post_id, post_name, COUNT(*) AS days, SUM(spend) AS total
--   FROM ad_daily_post WHERE post_id IS NOT NULL
--   GROUP BY post_id, post_name ORDER BY total DESC LIMIT 20;
