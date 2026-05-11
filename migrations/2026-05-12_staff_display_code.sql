-- ═══════════════════════════════════════════════════════════════
-- Migration: Mã nhân sự ngắn (staff.display_code)
--
-- Thay vì UUID dài, mỗi nhân sự có 1 mã ngắn dạng "001", "002", "003"...
-- để dễ đọc, dễ nhớ, dễ tham chiếu trong báo cáo / lương / phạt.
--
-- Cách chạy:
--   Supabase Dashboard → SQL Editor → New query → paste → Run
-- ═══════════════════════════════════════════════════════════════

ALTER TABLE staff
  ADD COLUMN IF NOT EXISTS display_code text;

CREATE UNIQUE INDEX IF NOT EXISTS idx_staff_display_code
  ON staff (display_code)
  WHERE display_code IS NOT NULL;

COMMENT ON COLUMN staff.display_code IS
  'Mã NS ngắn dạng "001", "002"... — dùng hiển thị thay UUID. Unique nếu có giá trị.';

-- ═══ BACKFILL — gán mã 001, 002, 003... theo thứ tự created_at ═══
-- Chạy 1 lần sau khi tạo column. Chỉ điền vào row chưa có display_code.
WITH numbered AS (
  SELECT id, LPAD(ROW_NUMBER() OVER (ORDER BY created_at)::text, 3, '0') AS new_code
  FROM staff
  WHERE display_code IS NULL
)
UPDATE staff s
  SET display_code = n.new_code
  FROM numbered n
  WHERE s.id = n.id;

-- ═══ KIỂM TRA ═══
-- SELECT display_code, short_name, full_name, is_active
--   FROM staff ORDER BY display_code;
