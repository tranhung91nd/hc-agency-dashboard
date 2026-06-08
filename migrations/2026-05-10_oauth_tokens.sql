-- 2026-05-10 — Bảng lưu OAuth token cho ChatGPT Plus (qua PKCE flow của Codex CLI)
-- Cho phép gọi /codex/responses bằng subscription thay vì trả tiền API key.
-- Singleton: 1 row duy nhất với provider = 'openai-codex'.
-- Service role mới đọc/ghi được; client (anon/authenticated) tuyệt đối không truy cập trực tiếp.

create table if not exists oauth_tokens (
  provider       text primary key,
  access_token   text not null,
  refresh_token  text not null,
  expires_at     timestamptz not null,
  account_id     text,
  plan_type      text,
  scopes         text,
  updated_at     timestamptz not null default now()
);

alter table oauth_tokens enable row level security;
-- Không tạo policy cho anon/authenticated → mặc định deny.
-- Service role bypass RLS nên backend API đọc/ghi bình thường.
