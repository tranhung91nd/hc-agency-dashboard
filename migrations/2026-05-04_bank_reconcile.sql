-- ═══════════════════════════════════════════════════════════════
-- Migration: Đối soát giao dịch VCB với Meta
--
-- Lưu giao dịch trừ tiền VCB (Meta Ads + Meta Verified), cho phép
-- admin nhập tay Link + Số tiền bên Meta để đối soát.
-- Tolerance khớp ngầm định 1.1% (phí ngân hàng + phí thẻ).
--
-- Cách chạy:
--   Vào Supabase Dashboard → SQL Editor → New query → paste → Run
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS bank_reconcile (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bank_date date NOT NULL,
  bank_amount numeric NOT NULL,
  bank_doc_no text NOT NULL,
  bank_desc text,
  meta_invoice_code text,
  category text NOT NULL CHECK (category IN ('ads_meta','meta_verified','other')),
  meta_link text,
  meta_amount numeric,
  notes text,
  imported_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (bank_date, bank_doc_no)
);

CREATE INDEX IF NOT EXISTS idx_bank_reconcile_month ON bank_reconcile (bank_date);
CREATE INDEX IF NOT EXISTS idx_bank_reconcile_category ON bank_reconcile (category);

-- Trigger update updated_at khi sửa
CREATE OR REPLACE FUNCTION bank_reconcile_set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

DROP TRIGGER IF EXISTS trg_bank_reconcile_updated ON bank_reconcile;
CREATE TRIGGER trg_bank_reconcile_updated
  BEFORE UPDATE ON bank_reconcile
  FOR EACH ROW EXECUTE FUNCTION bank_reconcile_set_updated_at();

-- Log lịch sử các lần import file VCB (để admin trace back nguồn data)
CREATE TABLE IF NOT EXISTS bank_import_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  file_name text NOT NULL,
  file_size integer,
  uploaded_at timestamptz NOT NULL DEFAULT now(),
  uploaded_by text,
  period_from date,
  period_to date,
  total_rows integer NOT NULL DEFAULT 0,
  ads_rows integer NOT NULL DEFAULT 0,
  verified_rows integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'success' CHECK (status IN ('success','partial','failed')),
  error_message text
);

CREATE INDEX IF NOT EXISTS idx_bank_import_log_uploaded ON bank_import_log (uploaded_at DESC);
