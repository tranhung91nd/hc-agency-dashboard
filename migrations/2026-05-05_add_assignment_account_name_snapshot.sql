-- Snapshot tên TKQC vào assignment để báo cáo cũ giữ nguyên tên dù admin đổi tên TKQC trên Meta sau này.
-- Use case: TK "Trọng Toàn 02" cho khách Trọng Toàn thuê tháng 4 → ngắt thuê → đổi tên Meta thành "TK Khách Mới ABC" → khách Trọng Toàn xem lại Sổ rental tháng 4 vẫn thấy "Trọng Toàn 02" thay vì tên mới.

ALTER TABLE assignment ADD COLUMN IF NOT EXISTS account_name_snapshot TEXT;

-- Backfill: assignment hiện có lấy tên TKQC HIỆN TẠI làm snapshot. Không hoàn hảo cho các TKQC đã đổi tên, nhưng là tốt nhất với data lịch sử.
UPDATE assignment a
SET account_name_snapshot = ac.account_name
FROM ad_account ac
WHERE a.ad_account_id = ac.id
  AND a.account_name_snapshot IS NULL;

-- Index nhẹ cho query Sổ rental theo client + ad_account
CREATE INDEX IF NOT EXISTS idx_assignment_client_acc ON assignment(client_id, ad_account_id) WHERE client_id IS NOT NULL;
