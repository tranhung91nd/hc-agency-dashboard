-- ═══════════════════════════════════════════════════════════════
-- Migration: penalty.excluded_from_fund — đánh dấu phạt KHÔNG vào quỹ
--
-- Use case: Phạt nhân sự đúng (vẫn trừ lương) nhưng tiền đó agency
-- phải bù cho khách → không cộng vào quỹ team.
--   VD: Nhi set cam lỗi, khách thiệt 500k → phạt Nhi 500k (trừ lương)
--       nhưng 500k đó agency bù khách, KHÔNG vào quỹ liên hoan.
--
-- Logic:
--   - excluded_from_fund=false (default): vào quỹ + trừ lương (như cũ)
--   - excluded_from_fund=true: trừ lương + KHÔNG vào quỹ
--   - "Hủy phạt sai sót" → xóa record luôn (không cần status riêng)
--
-- Update RPC get_public_team_penalty:
--   - fund_*: chỉ tính WHERE excluded_from_fund=false
--   - penalties response trả thêm field excluded_from_fund để FE hiện badge
--
-- Cách chạy:
--   Supabase Dashboard → SQL Editor → New query → paste → Run
-- ═══════════════════════════════════════════════════════════════

ALTER TABLE penalty ADD COLUMN IF NOT EXISTS excluded_from_fund boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_penalty_excluded_from_fund
  ON penalty(excluded_from_fund) WHERE excluded_from_fund = true;

COMMENT ON COLUMN penalty.excluded_from_fund IS
  'true = phạt vẫn trừ lương nhưng KHÔNG cộng vào quỹ team (VD: bồi thường khách)';

-- RPC public — tính fund chỉ trên penalty NOT excluded
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
  v_withdrawals jsonb;
  v_total numeric;
  v_count int;
  v_month_filter text;
  v_today date;
  v_year_start date;
  v_quarter_start date;
  v_total_collected numeric;
  v_total_withdrawn numeric;
  v_year_collected numeric;
  v_quarter_collected numeric;
BEGIN
  SELECT value INTO v_stored_token FROM app_settings WHERE key = 'TEAM_PENALTY_TOKEN';
  IF v_stored_token IS NULL OR v_stored_token = '' OR v_stored_token <> p_token THEN
    RAISE EXCEPTION 'Invalid token' USING ERRCODE = 'P0001';
  END IF;

  v_month_filter := COALESCE(p_month, to_char((now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date, 'YYYY-MM'));
  v_today := (now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date;
  v_year_start := date_trunc('year', v_today)::date;
  v_quarter_start := date_trunc('quarter', v_today)::date;

  -- Danh sách phạt chi tiết (tất cả — FE tự render badge cho excluded)
  SELECT
    coalesce(jsonb_agg(jsonb_build_object(
      'id', p.id,
      'penalty_date', p.penalty_date,
      'amount', p.amount,
      'reason', p.reason,
      'excluded_from_fund', coalesce(p.excluded_from_fund, false),
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

  -- Tổng theo nhân sự (tháng đang xem) — vẫn tính tất cả vì cả 2 đều trừ lương
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

  -- Tập tháng có dữ liệu
  SELECT coalesce(jsonb_agg(DISTINCT to_char(penalty_date, 'YYYY-MM') ORDER BY to_char(penalty_date, 'YYYY-MM') DESC), '[]'::jsonb)
  INTO v_months FROM penalty;

  -- Quỹ: CHỈ tính phạt NOT excluded_from_fund
  SELECT coalesce(sum(amount), 0) INTO v_total_collected
  FROM penalty WHERE coalesce(excluded_from_fund, false) = false;

  SELECT coalesce(sum(amount), 0) INTO v_total_withdrawn FROM team_fund_withdrawal;

  SELECT coalesce(sum(amount), 0) INTO v_year_collected
  FROM penalty
  WHERE penalty_date >= v_year_start AND penalty_date <= v_today
    AND coalesce(excluded_from_fund, false) = false;

  SELECT coalesce(sum(amount), 0) INTO v_quarter_collected
  FROM penalty
  WHERE penalty_date >= v_quarter_start AND penalty_date <= v_today
    AND coalesce(excluded_from_fund, false) = false;

  -- Lịch sử trích quỹ
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'id', w.id,
    'withdrawal_date', w.withdrawal_date,
    'amount', w.amount,
    'category', w.category,
    'purpose', w.purpose,
    'note', w.note
  ) ORDER BY w.withdrawal_date DESC, w.created_at DESC), '[]'::jsonb)
  INTO v_withdrawals FROM team_fund_withdrawal w;

  RETURN jsonb_build_object(
    'month', v_month_filter,
    'penalties', v_penalties,
    'per_staff', v_per_staff,
    'total', v_total,
    'count', v_count,
    'available_months', v_months,
    'fund_balance', v_total_collected - v_total_withdrawn,
    'fund_total_collected', v_total_collected,
    'fund_total_withdrawn', v_total_withdrawn,
    'fund_year_collected', v_year_collected,
    'fund_quarter_collected', v_quarter_collected,
    'withdrawals', v_withdrawals,
    'fetched_at', now()
  );
END;
$$;

GRANT EXECUTE ON FUNCTION get_public_team_penalty(text, text) TO anon, authenticated;

-- ═══ KIỂM TRA ═══
-- 1. Đánh dấu 1 phạt là bồi thường khách (không vào quỹ):
--    UPDATE penalty SET excluded_from_fund=true WHERE id='<uuid>';
-- 2. Đảo lại:
--    UPDATE penalty SET excluded_from_fund=false WHERE id='<uuid>';
-- 3. Check số liệu:
--    SELECT
--      excluded_from_fund,
--      count(*) AS lan,
--      sum(amount) AS tien
--    FROM penalty GROUP BY excluded_from_fund;
