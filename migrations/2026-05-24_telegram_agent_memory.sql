-- ═══════════════════════════════════════════════════════════════
-- Migration: Conversation memory cho Telegram AI Agent (Cấp 3)
--
-- Mỗi chat_id có 1 row chứa history messages (JSONB).
-- Trim còn 20 messages gần nhất để tránh context bloat.
-- Tự xóa sau 24h không hoạt động (qua cron hoặc TTL trigger).
--
-- Cách chạy: Supabase SQL Editor → paste → Run
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS telegram_conversation (
  chat_id text PRIMARY KEY,
  messages jsonb NOT NULL DEFAULT '[]'::jsonb,
  total_turns integer DEFAULT 0,
  total_tokens integer DEFAULT 0,
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_telegram_conv_updated ON telegram_conversation(updated_at);

-- RLS — chỉ service role được access (bot dùng service key)
ALTER TABLE telegram_conversation ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "telegram_conv_service_only" ON telegram_conversation;
-- (Không tạo policy nào → mặc định block hết, service role bypass tự động)

-- Function: xóa conversation cũ >24h (chạy thủ công hoặc cron)
CREATE OR REPLACE FUNCTION cleanup_old_telegram_conversations()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE deleted_count integer;
BEGIN
  DELETE FROM telegram_conversation WHERE updated_at < now() - interval '24 hours';
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$;

GRANT EXECUTE ON FUNCTION cleanup_old_telegram_conversations() TO service_role;
