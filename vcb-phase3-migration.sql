-- ═══════════════════════════════════════════════════════════════════════════
-- VCB Phase 3: Append-only model
-- ═══════════════════════════════════════════════════════════════════════════
-- Mục đích:
--   1. Cho phép xoá 1 vcb_statement (audit log) mà không mất giao dịch
--   2. Nhiều lần upload có thể cùng nhau bổ sung vào bảng vcb_transaction
-- Idempotent: chạy nhiều lần cũng OK.
-- ═══════════════════════════════════════════════════════════════════════════

-- 1. Drop cascade, chuyển sang set null khi xoá statement
alter table vcb_transaction drop constraint if exists vcb_transaction_statement_id_fkey;
alter table vcb_transaction alter column statement_id drop not null;
alter table vcb_transaction add constraint vcb_transaction_statement_id_fkey
  foreign key (statement_id) references vcb_statement(id) on delete set null;

-- 2. Bỏ unique constraint file_md5 trên vcb_statement (re-upload cùng file OK)
alter table vcb_statement drop constraint if exists vcb_statement_user_id_file_md5_key;

-- 3. Index tăng tốc dedupe + load accumulated data
create index if not exists idx_vcb_txn_dedupe
  on vcb_transaction (user_id, tx_date_iso, ref_code, debit);

create index if not exists idx_vcb_txn_user_date
  on vcb_transaction (user_id, tx_date_iso desc);

-- 4. Backfill card_last4 từ description (fix bug: trước đây lấy nhầm doc prefix "5254" làm đuôi thẻ)
-- Pattern thực: "...NNNN.YYYYMMDD.DG:FACEBK" → NNNN là 4 số đuôi thẻ thật
-- VD: "UHHT..703557..20260330.      .222806...1796.20260331.DG:FACEBK" → 1796
update vcb_transaction
set card_last4 = substring(description from '\.{3}(\d{4})\.')
where description ~ '\.{3}\d{4}\.';
