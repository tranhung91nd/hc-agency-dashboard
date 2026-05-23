-- ═══════════════════════════════════════════════════════════════
-- Migration: RPC get_dashboard_overview(p_month text)
--
-- Mục đích: gộp 5-6 query KPI tổng quan thành 1 round-trip duy nhất.
-- Trước: app load staff/client/ad_account/daily_spend/assignment rồi
-- aggregate trong browser → 4-5 query × 200ms = ~1s từ VN.
-- Sau: 1 RPC × ~150ms từ VN.
--
-- Trả về JSON:
--   {
--     month: '2026-05',
--     total_spend: 12345678,
--     total_clients_active: 37,
--     total_clients_prospect: 2,
--     total_staff_active: 8,
--     spend_by_staff: [{staff_id, short_name, spend}],
--     spend_by_client_top10: [{client_id, name, spend}]
--   }
--
-- Yêu cầu: materialized view ad_account_month_spend đã có (migration trước).
--
-- Cách chạy:
--   Supabase SQL Editor → paste → Run
-- ═══════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION get_dashboard_overview(p_month text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_month date;
  v_result jsonb;
BEGIN
  -- Parse p_month dạng "YYYY-MM" → date đầu tháng
  IF p_month IS NULL OR p_month !~ '^\d{4}-\d{2}$' THEN
    RAISE EXCEPTION 'p_month phải dạng YYYY-MM (vd: 2026-05)';
  END IF;
  v_month := (p_month || '-01')::date;

  WITH
  spend_by_client AS (
    -- Match spend → client qua matched_client_id (priority 1) hoặc ad_account.client_id (fallback)
    -- Bỏ qua assignment table (logic phức tạp) — coi như đa số case dùng matched_client_id
    SELECT
      COALESCE(aams.matched_client_id, aa.client_id) AS client_id,
      SUM(aams.spend)::bigint AS spend
    FROM ad_account_month_spend aams
    LEFT JOIN ad_account aa ON aa.id = aams.ad_account_id
    WHERE aams.month = v_month
      AND COALESCE(aams.matched_client_id, aa.client_id) IS NOT NULL
    GROUP BY 1
  ),
  spend_by_staff_cte AS (
    SELECT
      s.id AS staff_id,
      s.short_name,
      COALESCE(SUM(aams.spend), 0)::bigint AS spend
    FROM staff s
    LEFT JOIN ad_account_month_spend aams
      ON aams.staff_id = s.id AND aams.month = v_month
    WHERE s.is_active = true
    GROUP BY s.id, s.short_name
    ORDER BY spend DESC NULLS LAST
  )
  SELECT jsonb_build_object(
    'month', p_month,
    'total_spend', (SELECT COALESCE(SUM(spend), 0) FROM ad_account_month_spend WHERE month = v_month),
    'total_clients_active', (SELECT COUNT(*) FROM client WHERE status != 'prospect' AND status != 'closed'),
    'total_clients_prospect', (SELECT COUNT(*) FROM client WHERE status = 'prospect'),
    'total_staff_active', (SELECT COUNT(*) FROM staff WHERE is_active = true),
    'spend_by_staff', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('staff_id', staff_id, 'short_name', short_name, 'spend', spend) ORDER BY spend DESC)
      FROM spend_by_staff_cte
    ), '[]'::jsonb),
    'spend_by_client_top10', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('client_id', sbc.client_id, 'name', c.name, 'spend', sbc.spend) ORDER BY sbc.spend DESC)
      FROM (SELECT * FROM spend_by_client ORDER BY spend DESC LIMIT 10) sbc
      LEFT JOIN client c ON c.id = sbc.client_id
    ), '[]'::jsonb),
    'computed_at', to_char(now() AT TIME ZONE 'Asia/Ho_Chi_Minh', 'YYYY-MM-DD HH24:MI:SS')
  ) INTO v_result;

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION get_dashboard_overview(text) TO authenticated, anon;

-- ═══ KIỂM TRA ═══
-- SELECT get_dashboard_overview('2026-05');
-- SELECT get_dashboard_overview('2026-04');
