-- Server-side Meta sync jobs and account access diagnostics.
-- UI starts/polls jobs through /api/meta-sync; the browser no longer fans out Meta calls.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.meta_sync_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scope text NOT NULL DEFAULT 'auto',
  status text NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued','running','success','partial_error','failed')),
  date_from date,
  date_to date,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  requested_by uuid,
  requested_email text,
  source text DEFAULT 'ui',
  total_accounts integer NOT NULL DEFAULT 0,
  ok_accounts integer NOT NULL DEFAULT 0,
  error_accounts integer NOT NULL DEFAULT 0,
  saved_rows integer NOT NULL DEFAULT 0,
  error_rows integer NOT NULL DEFAULT 0,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  error_samples jsonb NOT NULL DEFAULT '[]'::jsonb,
  error_message text,
  locked_until timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS meta_sync_jobs_started_idx
  ON public.meta_sync_jobs (started_at DESC);

CREATE INDEX IF NOT EXISTS meta_sync_jobs_scope_period_idx
  ON public.meta_sync_jobs (scope, date_from, date_to, status, locked_until DESC);

ALTER TABLE public.meta_sync_jobs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "meta_sync_jobs_authenticated_read" ON public.meta_sync_jobs;
CREATE POLICY "meta_sync_jobs_authenticated_read"
  ON public.meta_sync_jobs FOR SELECT
  TO authenticated
  USING (true);

GRANT SELECT ON public.meta_sync_jobs TO authenticated;
GRANT ALL ON public.meta_sync_jobs TO service_role;

ALTER TABLE public.ad_account
  ADD COLUMN IF NOT EXISTS meta_access_status text DEFAULT 'unknown',
  ADD COLUMN IF NOT EXISTS last_meta_error_code integer,
  ADD COLUMN IF NOT EXISTS last_meta_error_message text,
  ADD COLUMN IF NOT EXISTS last_successful_sync_at timestamptz;

CREATE OR REPLACE FUNCTION public.touch_meta_sync_jobs_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_meta_sync_jobs_updated_at ON public.meta_sync_jobs;
CREATE TRIGGER trg_meta_sync_jobs_updated_at
  BEFORE UPDATE ON public.meta_sync_jobs
  FOR EACH ROW
  EXECUTE FUNCTION public.touch_meta_sync_jobs_updated_at();
