-- State nho cho cac canh bao Telegram outbound.
-- Dung de tranh spam lai cung mot canh bao theo tung ky/thang.

CREATE TABLE IF NOT EXISTS public.telegram_alert_state (
  key text PRIMARY KEY,
  status text NOT NULL DEFAULT 'ok',
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  last_checked_at timestamptz,
  last_notified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS telegram_alert_state_status_idx
  ON public.telegram_alert_state (status, updated_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.telegram_alert_state TO authenticated;
GRANT ALL ON public.telegram_alert_state TO service_role;
