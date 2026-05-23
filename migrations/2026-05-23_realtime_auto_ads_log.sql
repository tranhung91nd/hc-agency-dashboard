-- ═══════════════════════════════════════════════════════════════
-- Migration: Bật Supabase Realtime cho auto_ads_log
-- Khi bot tạo ads → insert log → dashboard tự refresh bảng Lịch sử
-- + show toast notification cho admin đang mở trang
--
-- Cách chạy: Supabase SQL Editor → paste → Run
-- ═══════════════════════════════════════════════════════════════

ALTER PUBLICATION supabase_realtime ADD TABLE public.auto_ads_log;
