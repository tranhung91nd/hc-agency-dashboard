-- Thêm cột platform để phân biệt Meta vs TikTok
-- 'meta' = Facebook Ads (mặc định cho data hiện tại)
-- 'tiktok' = TikTok Ads

alter table ad_account
  add column if not exists platform text not null default 'meta';

alter table daily_spend
  add column if not exists platform text not null default 'meta';

-- Index để filter platform nhanh
create index if not exists idx_ad_account_platform on ad_account(platform);
create index if not exists idx_daily_spend_platform on daily_spend(platform, report_date desc);

-- Lưu advertiser_id TikTok riêng (vì TikTok dùng số 19 chữ số, không cùng dạng FB id)
alter table ad_account
  add column if not exists tiktok_advertiser_id text;

create unique index if not exists ux_ad_account_tiktok_advertiser_id
  on ad_account(tiktok_advertiser_id)
  where tiktok_advertiser_id is not null;
