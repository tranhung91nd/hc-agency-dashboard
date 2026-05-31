-- ═══════════════════════════════════════════════════════════════
-- Omni AI Marketing trial + paid license automation
--
-- Chạy 1 lần trên Supabase trước khi bật /api/omni/*:
--   1. omni_license_orders  — lead/order/license/payment state
--   2. omni_payment_events   — raw SePay webhook + idempotency
--   3. omni_delivery_log     — email/Zalo/manual delivery audit + retry
--
-- Các API dùng service role key nên RLS không cần public policy.
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS omni_license_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product text NOT NULL DEFAULT 'omni-ai-marketing',
  order_code text NOT NULL UNIQUE,
  payment_code text NOT NULL UNIQUE,
  source text,

  name text NOT NULL,
  phone text NOT NULL,
  phone_clean text NOT NULL,
  email text NOT NULL,

  status text NOT NULL DEFAULT 'trial_pending'
    CHECK (status IN ('trial_pending','trial_active','trial_expired','payment_pending','paid_active','failed')),

  license_app_id text NOT NULL DEFAULT 'hc-zalo-agent',
  max_machines integer NOT NULL DEFAULT 1 CHECK (max_machines >= 1),
  trial_license_key text,
  trial_license_expires_at timestamptz,
  paid_license_key text,
  paid_license_expires_at timestamptz,

  amount_due integer NOT NULL DEFAULT 1000000 CHECK (amount_due >= 0),
  paid_amount integer,
  currency text NOT NULL DEFAULT 'VND',
  payment_bank text NOT NULL DEFAULT 'Techcombank',
  payment_account_no text NOT NULL DEFAULT '9188899999',
  payment_account_name text NOT NULL DEFAULT 'TRAN TRUC HUNG',
  paid_at timestamptz,
  last_payment_event_id uuid,

  download_links jsonb NOT NULL DEFAULT '{}'::jsonb,
  zalo_followup_url text,

  last_trial_email_sent_at timestamptz,
  reminder_24h_sent_at timestamptz,
  renewal_email_sent_at timestamptz,
  paid_email_sent_at timestamptz,
  trial_expired_at timestamptz,

  last_error text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS omni_license_orders_phone_product_uniq
  ON omni_license_orders (phone_clean, product);

CREATE UNIQUE INDEX IF NOT EXISTS omni_license_orders_email_product_uniq
  ON omni_license_orders (email, product);

CREATE INDEX IF NOT EXISTS omni_license_orders_status_idx
  ON omni_license_orders (status, trial_license_expires_at);

CREATE TABLE IF NOT EXISTS omni_payment_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL DEFAULT 'sepay',
  provider_event_id text NOT NULL,
  reference_code text,
  order_id uuid REFERENCES omni_license_orders(id) ON DELETE SET NULL,
  order_code text,
  payment_code text,

  transfer_type text,
  amount integer NOT NULL DEFAULT 0,
  content text,
  account_number text,
  gateway text,
  transaction_date_text text,

  raw_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  signature_status text NOT NULL DEFAULT 'unchecked',
  processing_status text NOT NULL DEFAULT 'received'
    CHECK (processing_status IN ('received','ignored','unmatched','underpaid','processed','license_failed','email_failed')),
  error text,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider, provider_event_id)
);

CREATE INDEX IF NOT EXISTS omni_payment_events_order_idx
  ON omni_payment_events (order_id, created_at DESC);

CREATE INDEX IF NOT EXISTS omni_payment_events_status_idx
  ON omni_payment_events (processing_status, created_at DESC);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'omni_license_orders_last_payment_event_fk'
      AND conrelid = 'omni_license_orders'::regclass
  ) THEN
    ALTER TABLE omni_license_orders
      ADD CONSTRAINT omni_license_orders_last_payment_event_fk
      FOREIGN KEY (last_payment_event_id)
      REFERENCES omni_payment_events(id)
      ON DELETE SET NULL
      NOT VALID;
  END IF;

  ALTER TABLE omni_license_orders VALIDATE CONSTRAINT omni_license_orders_last_payment_event_fk;
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

CREATE TABLE IF NOT EXISTS omni_delivery_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid REFERENCES omni_license_orders(id) ON DELETE SET NULL,
  channel text NOT NULL CHECK (channel IN ('email','zalo','manual','admin','system')),
  kind text NOT NULL CHECK (kind IN ('trial','reminder','renewal','paid','followup','resend')),
  recipient text,
  subject text,
  body_preview text,
  status text NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued','sent','failed','skipped')),
  provider_id text,
  error text,
  attempt_count integer NOT NULL DEFAULT 0,
  next_retry_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS omni_delivery_log_order_idx
  ON omni_delivery_log (order_id, created_at DESC);

CREATE INDEX IF NOT EXISTS omni_delivery_log_retry_idx
  ON omni_delivery_log (status, next_retry_at)
  WHERE status = 'failed';

CREATE OR REPLACE FUNCTION omni_set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_omni_license_orders_updated ON omni_license_orders;
CREATE TRIGGER trg_omni_license_orders_updated
  BEFORE UPDATE ON omni_license_orders
  FOR EACH ROW EXECUTE FUNCTION omni_set_updated_at();

DROP TRIGGER IF EXISTS trg_omni_payment_events_updated ON omni_payment_events;
CREATE TRIGGER trg_omni_payment_events_updated
  BEFORE UPDATE ON omni_payment_events
  FOR EACH ROW EXECUTE FUNCTION omni_set_updated_at();

DROP TRIGGER IF EXISTS trg_omni_delivery_log_updated ON omni_delivery_log;
CREATE TRIGGER trg_omni_delivery_log_updated
  BEFORE UPDATE ON omni_delivery_log
  FOR EACH ROW EXECUTE FUNCTION omni_set_updated_at();

ALTER TABLE omni_license_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE omni_payment_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE omni_delivery_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS omni_license_orders_service_only ON omni_license_orders;
DROP POLICY IF EXISTS omni_payment_events_service_only ON omni_payment_events;
DROP POLICY IF EXISTS omni_delivery_log_service_only ON omni_delivery_log;

CREATE POLICY omni_license_orders_service_only ON omni_license_orders
  FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

CREATE POLICY omni_payment_events_service_only ON omni_payment_events
  FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

CREATE POLICY omni_delivery_log_service_only ON omni_delivery_log
  FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

-- Kiểm tra nhanh:
-- SELECT order_code, payment_code, status, email FROM omni_license_orders ORDER BY created_at DESC LIMIT 10;
-- SELECT provider_event_id, processing_status, amount, content FROM omni_payment_events ORDER BY created_at DESC LIMIT 10;
