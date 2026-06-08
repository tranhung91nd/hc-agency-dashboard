-- Cảnh báo quảng cáo Facebook bị từ chối.
-- Chỉ quét các ad_account được bật policy_reject_watch.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

ALTER TABLE public.ad_account
  ADD COLUMN IF NOT EXISTS policy_reject_watch boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS policy_reject_watch_note text;

CREATE TABLE IF NOT EXISTS public.ad_policy_alert (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ad_account_id uuid NOT NULL REFERENCES public.ad_account(id) ON DELETE CASCADE,
  fb_account_id text NOT NULL,
  ad_id text NOT NULL,
  ad_name text,
  campaign_id text,
  campaign_name text,
  adset_id text,
  adset_name text,
  effective_status text,
  configured_status text,
  meta_status text,
  status text NOT NULL DEFAULT 'open'
    CHECK (status IN ('open','resolved','ignored')),
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  ignored_at timestamptz,
  raw jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (ad_account_id, ad_id)
);

CREATE INDEX IF NOT EXISTS ad_policy_alert_status_idx
  ON public.ad_policy_alert (status, last_seen_at DESC);

CREATE INDEX IF NOT EXISTS ad_policy_alert_account_idx
  ON public.ad_policy_alert (ad_account_id, status);

ALTER TABLE public.ad_policy_alert ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ad_policy_alert_authenticated_all" ON public.ad_policy_alert;
CREATE POLICY "ad_policy_alert_authenticated_all" ON public.ad_policy_alert
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.ad_policy_alert TO authenticated;
GRANT ALL ON public.ad_policy_alert TO service_role;

CREATE OR REPLACE FUNCTION public.touch_ad_policy_alert_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_ad_policy_alert_updated_at ON public.ad_policy_alert;
CREATE TRIGGER trg_ad_policy_alert_updated_at
  BEFORE UPDATE ON public.ad_policy_alert
  FOR EACH ROW
  EXECUTE FUNCTION public.touch_ad_policy_alert_updated_at();

