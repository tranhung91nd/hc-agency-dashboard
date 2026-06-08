-- ═══════════════════════════════════════════════════════════════
-- Migration: Quỹ team — bảng trích quỹ + update RPC public
--
-- Logic:
--   Quỹ chung = Σ tất cả phạt − Σ tất cả lần trích quỹ
--   Mỗi lần trích = 1 dòng team_fund_withdrawal (liên hoan, thưởng,
--   team building, quà, khác...) với purpose mô tả tự do.
--
-- RPC get_public_team_penalty được mở rộng để trả thêm:
--   - fund_balance, fund_total_collected, fund_total_withdrawn
--   - fund_quarter_collected, fund_year_collected (kỳ hiện tại VN tz)
--   - withdrawals (toàn bộ lịch sử)
--
-- Cách chạy:
--   SQL console hoặc psql → paste → Run
-- ═══════════════════════════════════════════════════════════════

-- 1. Bảng trích quỹ
CREATE TABLE IF NOT EXISTS team_fund_withdrawal (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  withdrawal_date date NOT NULL,
  amount          bigint NOT NULL CHECK (amount > 0),
  category        text NOT NULL DEFAULT 'khac',  -- lien_hoan|thuong|team_building|qua|khac
  purpose         text NOT NULL,                  -- VD: "Liên hoan Q2/2026"
  note            text,
  created_at      timestamptz DEFAULT now(),
  created_by      text
);

CREATE INDEX IF NOT EXISTS idx_team_fund_withdrawal_date
  ON team_fund_withdrawal (withdrawal_date DESC);

COMMENT ON TABLE team_fund_withdrawal IS
  'Lịch sử trích quỹ team. Quỹ = Σ penalty.amount − Σ team_fund_withdrawal.amount.';
COMMENT ON COLUMN team_fund_withdrawal.category IS
  'Phân loại mục đích: lien_hoan, thuong, team_building, qua, khac';
COMMENT ON COLUMN team_fund_withdrawal.purpose IS
  'Mô tả ngắn (hiển thị cho team), VD "Liên hoan Q2/2026"';

-- 2. RPC public — trả thêm fund info
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
  -- Verify token
  SELECT value INTO v_stored_token
  FROM app_settings
  WHERE key = 'TEAM_PENALTY_TOKEN';

  IF v_stored_token IS NULL OR v_stored_token = '' OR v_stored_token <> p_token THEN
    RAISE EXCEPTION 'Invalid token' USING ERRCODE = 'P0001';
  END IF;

  -- Tháng filter
  v_month_filter := COALESCE(p_month, to_char((now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date, 'YYYY-MM'));
  v_today := (now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date;
  v_year_start := date_trunc('year', v_today)::date;
  v_quarter_start := date_trunc('quarter', v_today)::date;

  -- Danh sách phạt chi tiết tháng đang xem
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

  -- Tổng theo nhân sự (tháng đang xem)
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
  INTO v_months
  FROM penalty;

  -- Quỹ: tổng all-time
  SELECT coalesce(sum(amount), 0) INTO v_total_collected FROM penalty;
  SELECT coalesce(sum(amount), 0) INTO v_total_withdrawn FROM team_fund_withdrawal;

  -- Quỹ: theo năm/quý hiện tại
  SELECT coalesce(sum(amount), 0) INTO v_year_collected
  FROM penalty WHERE penalty_date >= v_year_start AND penalty_date <= v_today;

  SELECT coalesce(sum(amount), 0) INTO v_quarter_collected
  FROM penalty WHERE penalty_date >= v_quarter_start AND penalty_date <= v_today;

  -- Lịch sử trích quỹ (toàn bộ, mới nhất trước)
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'id', w.id,
    'withdrawal_date', w.withdrawal_date,
    'amount', w.amount,
    'category', w.category,
    'purpose', w.purpose,
    'note', w.note
  ) ORDER BY w.withdrawal_date DESC, w.created_at DESC), '[]'::jsonb)
  INTO v_withdrawals
  FROM team_fund_withdrawal w;

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
-- 1. Insert thử 1 lần trích:
--    INSERT INTO team_fund_withdrawal(withdrawal_date, amount, category, purpose, note, created_by)
--    VALUES (current_date, 500000, 'lien_hoan', 'Liên hoan Q2/2026', 'Bún đậu mắm tôm', 'admin');
-- 2. Test RPC:
--    SELECT get_public_team_penalty('<token>', '2026-05');
-- 3. Check số dư:
--    SELECT
--      (SELECT coalesce(sum(amount),0) FROM penalty) AS thu,
--      (SELECT coalesce(sum(amount),0) FROM team_fund_withdrawal) AS chi,
--      (SELECT coalesce(sum(amount),0) FROM penalty) - (SELECT coalesce(sum(amount),0) FROM team_fund_withdrawal) AS quy;
