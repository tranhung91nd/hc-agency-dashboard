-- ═══════════════════════════════════════════════════════════════
-- Migration: Sổ phạt CHUNG team — 1 link, tất cả nhân sự cùng xem
--
-- Pivot từ migration 2026-05-07_staff_penalty_share.sql:
-- - Trước: mỗi nhân sự 1 link riêng (?penalty=<staff_id>&token=<x>)
-- - Sau: 1 link chung cho cả team (?team_penalty=<token>)
--
-- Quyết định:
-- - DROP RPC cũ get_public_staff_penalty — không dùng nữa, tránh leak.
-- - GIỮ cột staff.share_token — không dùng cho penalty nhưng có thể
--   dùng tương lai cho feature khác, không phá data.
-- - Token chung lưu trong app_settings, key='TEAM_PENALTY_TOKEN'.
--   App sinh UUID khi admin bấm "Sao chép link" lần đầu.
--
-- URL pattern: <app-url>/?team_penalty=<token>
-- ═══════════════════════════════════════════════════════════════

-- 1. Drop RPC cũ
DROP FUNCTION IF EXISTS get_public_staff_penalty(uuid, text, text);

-- 2. RPC trả về sổ phạt cho cả team (verify token chung)
CREATE OR REPLACE FUNCTION get_public_team_penalty(p_token text, p_month text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_stored_token text;
  v_penalties jsonb;
  v_per_staff jsonb;
  v_months jsonb;
  v_total numeric;
  v_count int;
  v_month_filter text;
BEGIN
  -- 1. Verify token (so với app_settings.TEAM_PENALTY_TOKEN)
  SELECT value INTO v_stored_token
  FROM app_settings
  WHERE key = 'TEAM_PENALTY_TOKEN';

  IF v_stored_token IS NULL OR v_stored_token = '' OR v_stored_token <> p_token THEN
    RAISE EXCEPTION 'Invalid token' USING ERRCODE = 'P0001';
  END IF;

  -- 2. Tháng filter — nếu null thì lấy tháng hiện tại theo VN time
  v_month_filter := COALESCE(p_month, to_char((now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date, 'YYYY-MM'));

  -- 3. Danh sách phạt chi tiết (join staff để lấy tên + màu)
  SELECT
    coalesce(jsonb_agg(jsonb_build_object(
      'id', p.id,
      'penalty_date', p.penalty_date,
      'amount', p.amount,
      'reason', p.reason,
      'staff_id', p.staff_id,
      'staff_name', coalesce(s.full_name, p.staff_name_raw, '(không rõ)'),
      'staff_short', coalesce(s.short_name, p.staff_name_raw, '?'),
      'staff_initials', coalesce(s.avatar_initials, '?'),
      'staff_color', coalesce(s.color_code, 'blue')
    ) ORDER BY p.penalty_date DESC, p.created_at DESC), '[]'::jsonb),
    coalesce(sum(p.amount), 0),
    count(*)::int
  INTO v_penalties, v_total, v_count
  FROM penalty p
  LEFT JOIN staff s ON s.id = p.staff_id
  WHERE to_char(p.penalty_date, 'YYYY-MM') = v_month_filter;

  -- 4. Tổng theo nhân sự (cho bảng tóm tắt)
  SELECT coalesce(jsonb_agg(row_to_json(t)), '[]'::jsonb) INTO v_per_staff
  FROM (
    SELECT
      p.staff_id,
      coalesce(s.full_name, p.staff_name_raw, '(không rõ)') AS full_name,
      coalesce(s.avatar_initials, '?') AS avatar_initials,
      coalesce(s.color_code, 'blue') AS color_code,
      count(*)::int AS pen_count,
      sum(p.amount) AS pen_total
    FROM penalty p
    LEFT JOIN staff s ON s.id = p.staff_id
    WHERE to_char(p.penalty_date, 'YYYY-MM') = v_month_filter
    GROUP BY p.staff_id, s.full_name, p.staff_name_raw, s.avatar_initials, s.color_code
    ORDER BY sum(p.amount) DESC
  ) t;

  -- 5. Tập tháng có dữ liệu (cho dropdown chọn tháng)
  SELECT coalesce(jsonb_agg(DISTINCT to_char(penalty_date, 'YYYY-MM') ORDER BY to_char(penalty_date, 'YYYY-MM') DESC), '[]'::jsonb)
  INTO v_months
  FROM penalty;

  RETURN jsonb_build_object(
    'month', v_month_filter,
    'penalties', v_penalties,
    'per_staff', v_per_staff,
    'total', v_total,
    'count', v_count,
    'available_months', v_months,
    'fetched_at', now()
  );
END;
$$;

GRANT EXECUTE ON FUNCTION get_public_team_penalty(text, text) TO anon, authenticated;

-- ═══ KIỂM TRA ═══
-- 1. Sinh token (admin chạy thủ công, hoặc app tự sinh khi bấm "Sao chép link"):
--    INSERT INTO app_settings(key, value) VALUES ('TEAM_PENALTY_TOKEN', gen_random_uuid()::text)
--    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;
-- 2. Lấy token:
--    SELECT value FROM app_settings WHERE key = 'TEAM_PENALTY_TOKEN';
-- 3. Test RPC:
--    SELECT get_public_team_penalty('<token>', '2026-05');
