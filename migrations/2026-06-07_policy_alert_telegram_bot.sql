-- Bot Telegram rieng cho canh bao bai Meta bi tu choi.
-- Cot nay giup job scan khong gui lap lai cung mot alert moi 10 phut.

ALTER TABLE public.ad_policy_alert
  ADD COLUMN IF NOT EXISTS telegram_notified_at timestamptz;

CREATE INDEX IF NOT EXISTS ad_policy_alert_telegram_notified_idx
  ON public.ad_policy_alert (telegram_notified_at);
