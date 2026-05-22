-- ═══════════════════════════════════════════════════════════════
-- Migration: Bật Supabase Realtime cho table client
--
-- Mục đích: khi lead mới insert qua /api/trial (form công khai),
-- dashboard tự nhận event qua postgres_changes channel → push vào
-- clientList → re-render tab Tiềm năng mà không cần F5.
--
-- Cũng nhận UPDATE (đổi care_status, payment_status...) và DELETE.
--
-- Cách chạy:
--   Vào Supabase Dashboard → SQL Editor → New query → paste → Run
-- ═══════════════════════════════════════════════════════════════

ALTER PUBLICATION supabase_realtime ADD TABLE public.client;

-- Kiểm tra: SELECT * FROM pg_publication_tables WHERE pubname='supabase_realtime' AND tablename='client';
