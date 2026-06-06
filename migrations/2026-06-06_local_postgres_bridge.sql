-- Local PostgreSQL compatibility fixes for the Supabase bridge.

CREATE UNIQUE INDEX IF NOT EXISTS uniq_aams_refresh
ON public.ad_account_month_spend (ad_account_id, month, staff_id, matched_client_id) NULLS NOT DISTINCT;
