-- ═══════════════════════════════════════════════════════════════
-- Migration: cơ chế phạt tự động 10K/camp vượt ngưỡng mess/form
-- ═══════════════════════════════════════════════════════════════
-- Quy luật:
--   • Quét 10h30 VN mỗi ngày (T2-T7), Chủ nhật KHÔNG quét
--   • Mỗi camp ACTIVE có spend ≥ 3 ngày trong cửa sổ D-1/D-2/D-3
--     mà cost/mess hoặc cost/form vượt ngưỡng max_*_cost của TKQC
--     → ghi 1 dòng phạt 10K cho nhân sự đang quản lý TKQC tại ngày quét.
--   • Mỗi camp chỉ bị phạt 1 lần/ngày (chống trùng bằng auto_key UNIQUE).
--   • Spend ngày Chủ nhật vẫn được dùng để tính trung bình cho T2/T3/T4 —
--     chỉ riêng job 10h30 CN bị bỏ.
--
-- Cách chạy: SQL console hoặc psql → paste → Run
-- ═══════════════════════════════════════════════════════════════

-- ═══ BƯỚC 1: Cột chống trùng + index ═══
ALTER TABLE penalty
  ADD COLUMN IF NOT EXISTS auto_key text;

CREATE UNIQUE INDEX IF NOT EXISTS penalty_auto_key_uniq
  ON penalty (auto_key)
  WHERE auto_key IS NOT NULL;

COMMENT ON COLUMN penalty.auto_key IS
  'Khoá chống trùng cho phạt auto (định dạng: YYYY-MM-DD|type|campaign_id). NULL = phạt thủ công.';

-- ═══ BƯỚC 2: RPC dry-run (xem trước, không insert) ═══
-- Dùng để test: SELECT * FROM preview_camp_penalty('2026-05-11');
CREATE OR REPLACE FUNCTION preview_camp_penalty(p_scan_date date DEFAULT CURRENT_DATE)
RETURNS TABLE(
  ad_account_id uuid,
  account_name text,
  campaign_id text,
  campaign_name text,
  campaign_type text,
  spend_3d numeric,
  events_3d bigint,
  cost_per_event int,
  threshold int,
  staff_id uuid,
  staff_short_name text,
  has_staff boolean,
  reason text
)
LANGUAGE sql
STABLE
AS $$
  WITH d_window AS (
    SELECT (p_scan_date - 1) AS d1, (p_scan_date - 2) AS d2, (p_scan_date - 3) AS d3
  ),
  latest_status AS (
    SELECT DISTINCT ON (ad_account_id, campaign_id)
      ad_account_id, campaign_id, campaign_status
    FROM campaign_daily_mess
    ORDER BY ad_account_id, campaign_id, report_date DESC
  ),
  agg AS (
    SELECT
      m.ad_account_id,
      m.campaign_id,
      max(m.campaign_name) AS campaign_name,
      max(m.campaign_type) AS campaign_type,
      sum(m.spend)::numeric AS spend,
      sum(m.mess_count)::bigint AS mess_count,
      sum(m.lead_count)::bigint AS lead_count,
      count(*) FILTER (WHERE m.spend > 0) AS days_with_spend
    FROM campaign_daily_mess m
    JOIN latest_status ls
      ON ls.ad_account_id = m.ad_account_id AND ls.campaign_id = m.campaign_id
    CROSS JOIN d_window w
    WHERE m.report_date IN (w.d1, w.d2, w.d3)
      AND COALESCE(ls.campaign_status, 'ACTIVE') = 'ACTIVE'
    GROUP BY m.ad_account_id, m.campaign_id
  ),
  violations AS (
    SELECT
      a.ad_account_id,
      ac.account_name,
      a.campaign_id,
      a.campaign_name,
      a.campaign_type,
      a.spend AS spend_3d,
      CASE a.campaign_type WHEN 'mess' THEN a.mess_count ELSE a.lead_count END AS events_3d,
      CASE
        WHEN a.campaign_type = 'mess' AND a.mess_count > 0
          THEN round(a.spend / a.mess_count)::int
        WHEN a.campaign_type = 'form' AND a.lead_count > 0
          THEN round(a.spend / a.lead_count)::int
      END AS cost_per_event,
      CASE a.campaign_type WHEN 'mess' THEN ac.max_mess_cost ELSE ac.max_lead_cost END AS threshold
    FROM agg a
    JOIN ad_account ac ON ac.id = a.ad_account_id
    WHERE a.days_with_spend >= 3
      AND a.campaign_type IN ('mess', 'form')
      AND (
        (a.campaign_type = 'mess'
          AND ac.max_mess_cost IS NOT NULL
          AND a.mess_count > 0
          AND round(a.spend / a.mess_count)::int > ac.max_mess_cost)
        OR
        (a.campaign_type = 'form'
          AND ac.max_lead_cost IS NOT NULL
          AND a.lead_count > 0
          AND round(a.spend / a.lead_count)::int > ac.max_lead_cost)
      )
  )
  SELECT
    v.ad_account_id,
    v.account_name,
    v.campaign_id,
    v.campaign_name,
    v.campaign_type,
    v.spend_3d,
    v.events_3d,
    v.cost_per_event,
    v.threshold,
    s.staff_id,
    st.short_name AS staff_short_name,
    (s.staff_id IS NOT NULL) AS has_staff,
    ('Auto: Camp "' || v.campaign_name || '" vượt ngưỡng '
       || CASE v.campaign_type WHEN 'mess' THEN 'giá Mess' ELSE 'giá Form' END
       || ' — ' || v.cost_per_event || 'đ > ' || v.threshold || 'đ (TB 3 ngày D-1→D-3)') AS reason
  FROM violations v
  LEFT JOIN LATERAL (
    SELECT a.staff_id
    FROM assignment a
    WHERE a.ad_account_id = v.ad_account_id
      AND a.start_date <= p_scan_date
    ORDER BY
      CASE WHEN (a.end_date IS NULL OR a.end_date >= p_scan_date) THEN 0 ELSE 1 END,
      a.start_date DESC
    LIMIT 1
  ) s ON true
  LEFT JOIN staff st ON st.id = s.staff_id
  ORDER BY v.account_name, v.campaign_name;
$$;

-- ═══ BƯỚC 3: RPC quét thật — insert vào penalty ═══
-- Dùng cho cron 10h30. Trả về số dòng phạt đã thêm.
-- Bỏ qua nếu scan_date là Chủ nhật.
-- Tham số:
--   p_scan_date — ngày quét (mặc định hôm nay)
--   p_amount    — số tiền phạt mỗi camp lỗi (mặc định 10000)
CREATE OR REPLACE FUNCTION auto_scan_camp_penalty(
  p_scan_date date DEFAULT CURRENT_DATE,
  p_amount int DEFAULT 10000
)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_inserted int := 0;
BEGIN
  -- DOW: 0=Sunday, 6=Saturday → bỏ Chủ nhật
  IF EXTRACT(DOW FROM p_scan_date)::int = 0 THEN
    RAISE NOTICE 'Skip Sunday scan: %', p_scan_date;
    RETURN 0;
  END IF;

  INSERT INTO penalty (staff_id, penalty_date, amount, reason, auto_key, created_by)
  SELECT
    p.staff_id,
    p_scan_date,
    p_amount,
    p.reason,
    to_char(p_scan_date, 'YYYY-MM-DD') || '|' || p.campaign_type || '|' || p.campaign_id,
    'auto-scan-10h30'
  FROM preview_camp_penalty(p_scan_date) p
  WHERE p.has_staff = true
  ON CONFLICT (auto_key) WHERE auto_key IS NOT NULL DO NOTHING;

  GET DIAGNOSTICS v_inserted = ROW_COUNT;
  RETURN v_inserted;
END;
$$;

-- ═══ KIỂM TRA sau khi chạy ═══
-- 1. Dry-run xem có camp nào lỗi (không ghi DB):
--    SELECT * FROM preview_camp_penalty('2026-05-11');
--
-- 2. Quét thật cho 1 ngày (idempotent, chạy lại không trùng):
--    SELECT auto_scan_camp_penalty('2026-05-11');
--
-- 3. Xem các phạt auto đã ghi:
--    SELECT penalty_date, staff_id, amount, reason, auto_key
--    FROM penalty WHERE auto_key IS NOT NULL ORDER BY penalty_date DESC LIMIT 50;
--
-- 4. Rollback 1 ngày (nếu cần xóa phạt auto đã ghi cho 1 ngày):
--    DELETE FROM penalty
--    WHERE auto_key IS NOT NULL
--      AND auto_key LIKE '2026-05-11|%';
