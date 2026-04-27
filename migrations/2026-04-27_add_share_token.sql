-- ═══════════════════════════════════════════════════════════════
-- Migration: thêm cột share_token vào bảng client
--   - Token random để khách rental xem Sổ rental qua URL public
--   - URL: index.html?ledger=<client_id>&token=<share_token>
--   - App tự generate token random 24 hex (12 bytes) khi admin bấm
--     "🔗 Sao chép link" lần đầu cho khách đó
--
-- Cách chạy:
--   Vào Supabase Dashboard → SQL Editor → New query → paste → Run
-- ═══════════════════════════════════════════════════════════════

ALTER TABLE client
  ADD COLUMN IF NOT EXISTS share_token text UNIQUE;

CREATE INDEX IF NOT EXISTS idx_client_share_token
  ON client (share_token);

COMMENT ON COLUMN client.share_token IS
  'Token public cho khách xem Sổ rental qua URL ?ledger=<id>&token=<token>. NULL = chưa share.';

-- ═══ KIỂM TRA ═══
-- SELECT name, services, share_token IS NOT NULL AS has_share_link
-- FROM client
-- WHERE 'tkqc_rental' = ANY(services);
