-- ═══════════════════════════════════════════════════════════════
-- Migration: Sổ phạt nhân sự — share link riêng cho từng nhân sự xem
--
-- - Cột staff.share_token: random UUID, dùng làm key trong URL public
--   (admin sinh khi cần share, lưu DB để client (browser) verify)
-- - RPC get_public_staff_penalty(staff_id, token, month) — SECURITY DEFINER:
--   verify token rồi trả về JSON gồm tên nhân sự + danh sách phạt + tổng.
--   KHÔNG trả lương/hoa hồng/thưởng (chỉ phạt — đúng như user yêu cầu).
--
-- URL pattern: <vercel-url>/?penalty=<staff_id>&token=<share_token>
--
-- Cách chạy: Supabase Dashboard → SQL Editor → New query → paste → Run
-- ═══════════════════════════════════════════════════════════════

-- 1. Cột staff.share_token
ALTER TABLE staff ADD COLUMN IF NOT EXISTS share_token text UNIQUE;

CREATE INDEX IF NOT EXISTS idx_staff_share_token ON staff(share_token);

COMMENT ON COLUMN staff.share_token IS
  'Token random sinh khi admin bấm "Sao chép link sổ phạt". Dùng cho URL ?penalty=<id>&token=<x>. NULL = chưa từng share.';

-- 2. RPC trả về sổ phạt cho 1 nhân sự (public, có verify token)
CREATE OR REPLACE FUNCTION get_public_staff_penalty(p_staff_id uuid, p_token text, p_month text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_staff jsonb;
  v_penalties jsonb;
  v_months jsonb;
  v_total numeric;
  v_count int;
  v_month_filter text;
BEGIN
  -- 1. Verify token + lấy info nhân sự (chỉ trả các field cần thiết, KHÔNG trả share_token)
  SELECT jsonb_build_object(
    'id', s.id,
    'full_name', s.full_name,
    'short_name', s.short_name,
    'avatar_initials', s.avatar_initials,
    'color_code', s.color_code
  ) INTO v_staff
  FROM staff s
  WHERE s.id = p_staff_id
    AND s.share_token IS NOT NULL
    AND s.share_token = p_token;

  IF v_staff IS NULL THEN
    RAISE EXCEPTION 'Invalid token or staff not found' USING ERRCODE = 'P0001';
  END IF;

  -- 2. Tháng filter — nếu null thì lấy tháng hiện tại theo VN time
  v_month_filter := COALESCE(p_month, to_char((now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date, 'YYYY-MM'));

  -- 3. Danh sách phạt trong tháng (sort theo ngày DESC)
  SELECT
    coalesce(jsonb_agg(jsonb_build_object(
      'id', p.id,
      'penalty_date', p.penalty_date,
      'amount', p.amount,
      'reason', p.reason
    ) ORDER BY p.penalty_date DESC, p.created_at DESC), '[]'::jsonb),
    coalesce(sum(p.amount), 0),
    count(*)::int
  INTO v_penalties, v_total, v_count
  FROM penalty p
  WHERE p.staff_id = p_staff_id
    AND to_char(p.penalty_date, 'YYYY-MM') = v_month_filter;

  -- 4. Tập tháng có dữ liệu (cho dropdown chọn tháng)
  SELECT coalesce(jsonb_agg(DISTINCT to_char(penalty_date, 'YYYY-MM') ORDER BY to_char(penalty_date, 'YYYY-MM') DESC), '[]'::jsonb)
  INTO v_months
  FROM penalty
  WHERE staff_id = p_staff_id;

  RETURN jsonb_build_object(
    'staff', v_staff,
    'month', v_month_filter,
    'penalties', v_penalties,
    'total', v_total,
    'count', v_count,
    'available_months', v_months,
    'fetched_at', now()
  );
END;
$$;

GRANT EXECUTE ON FUNCTION get_public_staff_penalty(uuid, text, text) TO anon, authenticated;

-- ═══ KIỂM TRA ═══
-- 1. Sinh share_token cho 1 nhân sự (admin chạy):
--    UPDATE staff SET share_token = gen_random_uuid()::text WHERE id = '<staff_uuid>' AND share_token IS NULL;
-- 2. Lấy token vừa sinh:
--    SELECT id, full_name, share_token FROM staff WHERE id = '<staff_uuid>';
-- 3. Test RPC:
--    SELECT get_public_staff_penalty('<staff_uuid>', '<share_token>', '2026-05');
