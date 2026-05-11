-- ═══════════════════════════════════════════════════════════════
-- Migration: Liên kết tài khoản login với nhân sự (user_roles.staff_id)
--
-- Mục tiêu: Khi 1 tài khoản đăng nhập được gán với 1 staff record,
-- các view "Nhân sự" (Lương, Sổ phạt, Công việc) chỉ hiển thị dữ liệu
-- của chính staff đó. Admin (userRole='admin' hoặc không có entry
-- trong user_roles) vẫn full view.
--
-- staff_id = NULL → không restrict (default cho kế toán, viewer...).
--
-- Cách chạy:
--   Supabase Dashboard → SQL Editor → New query → paste → Run
-- ═══════════════════════════════════════════════════════════════

ALTER TABLE user_roles
  ADD COLUMN IF NOT EXISTS staff_id uuid REFERENCES staff(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_user_roles_staff_id
  ON user_roles (staff_id) WHERE staff_id IS NOT NULL;

COMMENT ON COLUMN user_roles.staff_id IS
  'Nếu set, các view Nhân sự (p2.*) chỉ hiển thị dữ liệu của staff này cho user đó. NULL = không restrict.';

-- ═══ KIỂM TRA ═══
-- SELECT ur.email, ur.display_name, s.short_name AS linked_staff
--   FROM user_roles ur LEFT JOIN staff s ON s.id = ur.staff_id
--   ORDER BY ur.created_at DESC;
