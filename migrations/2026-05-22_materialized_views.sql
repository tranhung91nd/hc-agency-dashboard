-- ═══════════════════════════════════════════════════════════════
-- Migration: Materialized view aggregate spend theo (TKQC, tháng)
--
-- Mục đích: thay vì client phải load 60-180 ngày daily_spend rồi
-- aggregate trong browser, view này pre-aggregate sẵn → chỉ load
-- 1 dòng/TKQC/tháng (giảm 30-180×). Dùng cho:
--   - Tổng quan tháng (p0)
--   - Báo cáo khách hàng theo tháng (p3)
--   - RPC get_dashboard_overview (phase 2.2)
--
-- Refresh: cron sync 15p sẽ chạy REFRESH CONCURRENTLY (không block read)
--
-- Cách chạy:
--   SQL console hoặc psql → paste → Run
-- ═══════════════════════════════════════════════════════════════

-- View 1: Spend theo (TKQC, tháng). Có cả staff_id (cho shared accounts)
CREATE MATERIALIZED VIEW IF NOT EXISTS ad_account_month_spend AS
SELECT
  ad_account_id,
  date_trunc('month', report_date::date)::date AS month,
  staff_id,
  COALESCE(matched_client_id, NULL) AS matched_client_id,
  SUM(spend_amount)::bigint AS spend
FROM daily_spend
GROUP BY 1, 2, 3, 4;

-- Unique index BẮT BUỘC cho REFRESH CONCURRENTLY
CREATE UNIQUE INDEX IF NOT EXISTS uniq_aams
  ON ad_account_month_spend(ad_account_id, month, COALESCE(staff_id, '00000000-0000-0000-0000-000000000000'::uuid), COALESCE(matched_client_id, '00000000-0000-0000-0000-000000000000'::uuid));

CREATE INDEX IF NOT EXISTS idx_aams_month ON ad_account_month_spend(month);
CREATE INDEX IF NOT EXISTS idx_aams_client ON ad_account_month_spend(matched_client_id) WHERE matched_client_id IS NOT NULL;

-- Cho phép anon/authenticated SELECT (RLS off cho view — view không có RLS, kế thừa từ base table)
GRANT SELECT ON ad_account_month_spend TO anon, authenticated;

-- Refresh lần đầu (sau migration phải chạy thêm câu này 1 lần để có data)
REFRESH MATERIALIZED VIEW ad_account_month_spend;

-- RPC wrapper cho cron sync gọi qua Local DB client.
CREATE OR REPLACE FUNCTION refresh_ad_account_month_spend()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  t0 timestamptz := clock_timestamp();
  row_count bigint;
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY ad_account_month_spend;
  SELECT count(*) INTO row_count FROM ad_account_month_spend;
  RETURN jsonb_build_object(
    'ok', true,
    'rows', row_count,
    'ms', round(EXTRACT(EPOCH FROM (clock_timestamp() - t0)) * 1000)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION refresh_ad_account_month_spend() TO service_role, authenticated;

-- ═══ KIỂM TRA ═══
-- SELECT COUNT(*), MIN(month), MAX(month) FROM ad_account_month_spend;
-- SELECT ad_account_id, month, SUM(spend) FROM ad_account_month_spend WHERE month='2026-04-01' GROUP BY 1,2 LIMIT 5;
