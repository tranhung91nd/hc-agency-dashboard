-- ═══════════════════════════════════════════════════════════════
-- Migration phụ: Bật RLS + thêm policy cho 2 bảng đối soát VCB
--
-- Vấn đề: Supabase project bật RLS mặc định cho table mới → admin
-- đã login vẫn bị chặn insert vì không có policy.
--
-- Fix: cho phép authenticated user (admin đã login dashboard) full
-- quyền (select/insert/update/delete) trên 2 bảng này.
--
-- Cách chạy:
--   Supabase Dashboard → SQL Editor → New query → paste → Run
-- ═══════════════════════════════════════════════════════════════

-- bank_reconcile
ALTER TABLE bank_reconcile ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "bank_reconcile_authenticated_all" ON bank_reconcile;
CREATE POLICY "bank_reconcile_authenticated_all" ON bank_reconcile
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- bank_import_log
ALTER TABLE bank_import_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "bank_import_log_authenticated_all" ON bank_import_log;
CREATE POLICY "bank_import_log_authenticated_all" ON bank_import_log
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- ═══ KIỂM TRA ═══
-- Sau khi chạy, query này phải trả về 2 dòng (1 policy / table):
-- SELECT tablename, policyname, roles FROM pg_policies
-- WHERE tablename IN ('bank_reconcile','bank_import_log');
