-- ═══════════════════════════════════════════════════════════════
-- Migration: dedupe daily_spend + UNIQUE constraint để dùng UPSERT
--
-- Vấn đề hiện tại:
--   - daily_spend KHÔNG có khóa tự nhiên → cron phải DELETE rồi INSERT
--   - Có race condition nhỏ + tốn 2× query
--
-- Giải pháp:
--   1. Xóa các dòng trùng (giữ dòng có id lớn nhất cho mỗi natural key)
--   2. Tạo UNIQUE constraint NULLS NOT DISTINCT (Postgres 15+)
--      → coi NULL = NULL trong staff_id / matched_client_id
--      → cron switch sang upsert(onConflict='ad_account_id,report_date,staff_id,matched_client_id')
--      → chạy lại bao nhiêu lần cũng không trùng
--
-- Cách chạy:
--   Supabase Dashboard → SQL Editor → New query → paste → Run
-- ═══════════════════════════════════════════════════════════════

-- ═══ BƯỚC 1: Dedupe ═══
-- Giữ dòng id lớn nhất cho mỗi (TKQC, ngày, NV?, khách?)
WITH dups AS (
  SELECT
    id,
    row_number() OVER (
      PARTITION BY
        ad_account_id,
        report_date,
        COALESCE(staff_id::text, ''),
        COALESCE(matched_client_id::text, '')
      ORDER BY id DESC
    ) AS rn
  FROM daily_spend
)
DELETE FROM daily_spend WHERE id IN (SELECT id FROM dups WHERE rn > 1);

-- ═══ BƯỚC 2: UNIQUE constraint với NULLS NOT DISTINCT ═══
-- Postgres 15+ syntax — Supabase đều >= 15
ALTER TABLE daily_spend
  DROP CONSTRAINT IF EXISTS daily_spend_natural_uniq;

ALTER TABLE daily_spend
  ADD CONSTRAINT daily_spend_natural_uniq
  UNIQUE NULLS NOT DISTINCT (ad_account_id, report_date, staff_id, matched_client_id);

-- ═══ KIỂM TRA sau khi chạy ═══
-- 1. Đếm tổng (sau dedupe):
--    SELECT COUNT(*) FROM daily_spend;
--
-- 2. Verify không còn trùng (phải = 0 dòng):
--    SELECT ad_account_id, report_date, staff_id, matched_client_id, COUNT(*)
--    FROM daily_spend
--    GROUP BY 1,2,3,4
--    HAVING COUNT(*) > 1;
--
-- 3. Verify constraint đã tồn tại:
--    SELECT conname FROM pg_constraint WHERE conname = 'daily_spend_natural_uniq';
