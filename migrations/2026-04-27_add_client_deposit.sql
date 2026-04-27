-- ═══════════════════════════════════════════════════════════════
-- Migration: bảng client_deposit — lịch sử tiền nạp của khách rental
--
-- Khách thuê TKQC nạp tiền vào HC Agency theo từng đợt.
-- Mỗi lần nạp = 1 dòng. Tiền chạy lấy từ daily_spend đã có sẵn,
-- phí thuê = % spend × rental_fee_pct.
-- Số dư = Σ deposits − Σ spend − Σ phí thuê
--
-- Cách chạy:
--   Vào Supabase Dashboard → SQL Editor → New query → paste → Run
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS client_deposit (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id     uuid NOT NULL REFERENCES client(id) ON DELETE CASCADE,
  deposit_date  date NOT NULL,
  amount        bigint NOT NULL CHECK (amount > 0),
  note          text,
  created_at    timestamptz DEFAULT now(),
  created_by    text
);

CREATE INDEX IF NOT EXISTS idx_client_deposit_client_date
  ON client_deposit (client_id, deposit_date DESC);

COMMENT ON TABLE client_deposit IS
  'Lịch sử tiền nạp của khách thuê TKQC. Spend lấy từ daily_spend.';
COMMENT ON COLUMN client_deposit.amount IS 'Số tiền nạp, đơn vị VNĐ.';

-- ═══ KIỂM TRA ═══
-- INSERT INTO client_deposit (client_id, deposit_date, amount, note)
-- VALUES ('<uuid-trong-toan>', '2026-04-01', 2000000, 'CK Vietcombank lần đầu');
--
-- SELECT c.name, d.deposit_date, d.amount, d.note
-- FROM client_deposit d JOIN client c ON c.id = d.client_id
-- ORDER BY d.deposit_date DESC LIMIT 20;
