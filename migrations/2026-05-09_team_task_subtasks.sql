-- ═══════════════════════════════════════════════════════════════
-- Migration: team_task.subtasks — đầu việc nhỏ trong 1 task
--
-- Use case: Task "Rà soát khách yếu" → bên trong có nhiều khách
-- (Getfit, Hibou, Mysterise...) cần tick từng cái.
--
-- Format jsonb: [{"title":"Getfit","done":false},{"title":"Hibou","done":true}]
-- App tự render checkbox inline + tính progress 2/5 hoàn thành.
--
-- Cách chạy:
--   SQL console hoặc psql → paste → Run
-- ═══════════════════════════════════════════════════════════════

ALTER TABLE team_task ADD COLUMN IF NOT EXISTS subtasks jsonb NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN team_task.subtasks IS
  'Mảng đầu việc nhỏ: [{"title":"Getfit","done":false}, ...]. App tick inline.';
