-- ═══════════════════════════════════════════════════════════════
-- Migration: Lịch bài đăng theo nhân sự (staff_post_schedule)
--
-- Thay thế Google Sheet "TIMELINE CHECK LIST CÔNG VIỆC HƯNG COACHING".
-- Mỗi staff có 1 lịch bài đăng riêng. Mỗi ngày 2 slot mặc định (11h30/20h),
-- nhưng time_slot là text tự do nên về sau có thể nhập custom (vd "21h30").
--
-- Khánh Linh sẽ bắt đầu nhập từ 2026-05-11. Các nhân sự khác để trống.
--
-- Cách chạy:
--   SQL console hoặc psql → paste → Run
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS staff_post_schedule (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id    uuid NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
  post_date   date NOT NULL,
  time_slot   text NOT NULL DEFAULT '11h30',   -- '11h30' | '20h' | custom
  category    text,                             -- video | anh_ai | anh_thuong | cap_nhat | story | ban_hang
  title       text,
  link        text,
  status      text NOT NULL DEFAULT 'cho_duyet',-- cho_duyet | da_duyet | da_post
  notes       text,
  created_at  timestamptz DEFAULT now(),
  updated_at  timestamptz DEFAULT now(),
  created_by  text
);

CREATE INDEX IF NOT EXISTS idx_staff_post_schedule_staff_date
  ON staff_post_schedule (staff_id, post_date DESC);
CREATE INDEX IF NOT EXISTS idx_staff_post_schedule_date
  ON staff_post_schedule (post_date DESC);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION set_staff_post_schedule_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS trg_staff_post_schedule_updated_at ON staff_post_schedule;
CREATE TRIGGER trg_staff_post_schedule_updated_at
  BEFORE UPDATE ON staff_post_schedule
  FOR EACH ROW EXECUTE FUNCTION set_staff_post_schedule_updated_at();

-- RLS: authenticated user full quyền (admin / staff đã login)
ALTER TABLE staff_post_schedule ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "staff_post_schedule_authenticated_all" ON staff_post_schedule;
CREATE POLICY "staff_post_schedule_authenticated_all" ON staff_post_schedule
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

COMMENT ON TABLE staff_post_schedule IS
  'Lịch bài đăng nội bộ — mỗi nhân sự 1 lịch. Tab "Công việc" trong page Nhân sự (p2).';
COMMENT ON COLUMN staff_post_schedule.category IS
  'Loại nội dung: video | anh_ai | anh_thuong | cap_nhat | story | ban_hang. NULL = chưa chọn.';
COMMENT ON COLUMN staff_post_schedule.status IS
  'cho_duyet (mặc định, vừa lên kế hoạch) → da_duyet (admin duyệt) → da_post (đã đăng). "Trễ" tính runtime.';

-- ═══ KIỂM TRA ═══
-- SELECT COUNT(*) FROM staff_post_schedule;
-- SELECT s.short_name, p.post_date, p.time_slot, p.title, p.status
--   FROM staff_post_schedule p JOIN staff s ON s.id=p.staff_id
--   ORDER BY p.post_date DESC, p.time_slot LIMIT 30;
