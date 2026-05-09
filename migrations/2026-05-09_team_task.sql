-- ═══════════════════════════════════════════════════════════════
-- Migration: Quản trị công việc — bảng team_task
--
-- 1 bảng task instance đơn giản. Recurring xử lý client-side:
--   khi load page, copy các task có is_recurring=true của ngày
--   gần nhất (chưa có instance hôm nay) → insert hôm nay status=todo.
--
-- Section UI tự phân loại theo priority + due_at:
--   - "Hằng ngày" = is_recurring=true (group theo nhân sự)
--   - "Phát sinh" = is_recurring=false, priority cao trở lên
--   - "Trễ hạn"   = task_date < today AND status != 'done'
--
-- Cách chạy:
--   Supabase Dashboard → SQL Editor → New query → paste → Run
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS team_task (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_date         date NOT NULL DEFAULT CURRENT_DATE,
  title             text NOT NULL,
  description       text,
  assignee_staff_id uuid REFERENCES staff(id) ON DELETE SET NULL,
  due_at            timestamptz,
  priority          text NOT NULL DEFAULT 'thap',  -- khan|cao|vua|thap
  status            text NOT NULL DEFAULT 'todo',  -- todo|doing|done
  is_recurring      boolean NOT NULL DEFAULT false,
  recurring_key     text,                           -- để link instance ↔ template gốc
  notes             text,
  created_by        text,
  created_at        timestamptz DEFAULT now(),
  completed_at      timestamptz,
  completed_by      text,
  CONSTRAINT team_task_priority_chk CHECK (priority IN ('khan','cao','vua','thap')),
  CONSTRAINT team_task_status_chk   CHECK (status   IN ('todo','doing','done'))
);

CREATE INDEX IF NOT EXISTS idx_team_task_date_assignee
  ON team_task (task_date DESC, assignee_staff_id);
CREATE INDEX IF NOT EXISTS idx_team_task_recurring_key
  ON team_task (recurring_key) WHERE recurring_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_team_task_status
  ON team_task (status) WHERE status <> 'done';

-- RLS: cho phép authenticated user (admin/staff đã login) full quyền
ALTER TABLE team_task ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "team_task_authenticated_all" ON team_task;
CREATE POLICY "team_task_authenticated_all" ON team_task
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

COMMENT ON TABLE team_task IS
  'Task hằng ngày của team. Mỗi ngày 1 task = 1 row. Recurring tasks copy client-side khi load page.';
COMMENT ON COLUMN team_task.recurring_key IS
  'Khóa nhóm các instance cùng template (UUID hoặc slug). Dùng để tránh sinh trùng khi auto-copy.';
COMMENT ON COLUMN team_task.is_recurring IS
  'true = task này nên xuất hiện hằng ngày (template). Khi load page, FE auto-copy sang ngày mới nếu thiếu.';

-- ═══ KIỂM TRA ═══
-- Insert thử 1 task hôm nay:
--   INSERT INTO team_task(task_date, title, assignee_staff_id, priority, status, is_recurring, recurring_key, created_by)
--   VALUES (current_date, 'Họp đầu ngày với team', '<staff-uuid>', 'cao', 'todo', true, 'hop-dau-ngay', 'admin');
--
-- Kiểm tra:
--   SELECT task_date, title, status, priority, is_recurring FROM team_task ORDER BY task_date DESC, priority;
