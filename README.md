# HC Agency Dashboard

Hệ thống quản trị nội bộ cho HC Agency — Quảng cáo Facebook · Cho thuê TKQC · Lập trình Web App.

🌐 **Production:** [hc-agency-dashboard.vercel.app](https://hc-agency-dashboard.vercel.app)

---

## Cấu trúc thư mục

```
hc-agency-dashboard/
├── index.html               App chính — toàn bộ tính năng quản trị
├── nghiep.html              App phụ — "Quản Trị Kết Quả · 8 Quy Luật"
├── manifest.json            PWA manifest (cài app trên điện thoại)
├── sw.js                    Service Worker — cache offline
│
├── assets/                  Icon PWA + apple-touch-icon
├── demos/                   File mockup HTML standalone xem trực tiếp
│   ├── demo-rental.html
│   └── demo-prospect-table.html
│
├── migrations/              SQL migration theo ngày — chạy trên Supabase
│   └── YYYY-MM-DD_*.sql
│
├── scripts/                 Dev / cron scripts
│   ├── push.sh              Helper local sync Downloads → repo → push
│   └── sync.js              GitHub Action cron job sync Meta API
│
└── .github/workflows/
    └── sync.yml             Cron 2 lần/ngày (7h VN + 23h VN)
```

---

## Trang công khai

| URL | Dùng để | Ai xem |
|---|---|---|
| `/` (index.html) | App admin chính | Admin login |
| `/?form=lead` | Form thu lead công khai | Khách điền |
| `/?form=lead&source=fbpage` | Form có track nguồn | Khách FB Page |
| `/?ledger=<id>&token=<token>` | Sổ rental cho khách thuê TKQC | Khách rental |
| `/demos/demo-rental.html` | Mockup Sổ rental | Nội bộ test |
| `/demos/demo-prospect-table.html` | Mockup bảng Tiềm năng | Nội bộ test |

---

## Triển khai migration

Mỗi file trong `/migrations/` chạy 1 lần trên Supabase:

1. Mở Supabase Dashboard → SQL Editor → New query
2. Paste nội dung file → Run

Thứ tự ngày trong tên file = thứ tự nên chạy.

Tất cả migration đều **idempotent** (chạy lại không lỗi nhờ `IF NOT EXISTS`).

---

## Cron sync Meta tự động

GitHub Action `.github/workflows/sync.yml` chạy 2 lần/ngày:

- **07:00 VN** — đồng bộ chi tiêu ngày hôm qua (lần 1)
- **23:00 VN** — đồng bộ chi tiêu ngày hôm qua (chốt số chính xác)

Cần secrets trong GitHub Settings:
- `SUPABASE_URL`
- `SUPABASE_KEY`
- `META_TOKEN`

---

## Push thay đổi local

```bash
./scripts/push.sh "Mô tả thay đổi"
```

Script tự sync `~/Downloads/{index,nghiep}.html` → repo → commit → push.

---

## Stack

- **Frontend:** Vanilla HTML/CSS/JS — single-page (`index.html` ~5500 dòng, không build step)
- **Backend:** Supabase (Postgres + Auth + Storage + RPC) + Vercel Serverless `/api/telegram` (bot) + `/api/meta` (Meta proxy)
- **Hosting:** Vercel (auto-deploy từ GitHub main)
- **Meta API:** Graph API v25.0 (insights + adaccounts + adsets) — gọi qua `/api/meta` proxy, token KHÔNG lộ ở client

---

## Meta API Proxy (`/api/meta`)

Token Meta là secret — không bao giờ load vào browser nữa. Mọi call từ dashboard đi qua proxy serverless này.

### Setup 1 lần

**Env vars trên Vercel:**

| Key | Value | Ghi chú |
|---|---|---|
| `META_TOKEN` | Meta access token (system user) | bắt buộc, **giữ kín** |
| `SUPABASE_URL` | đã có sẵn | dùng để verify JWT |
| `SUPABASE_SERVICE_ROLE_KEY` | đã có sẵn | dùng để verify JWT |

**Sau khi đổi token:** Vercel → Project → Deployments → Redeploy (env mới chỉ áp dụng cho deploy mới).

**Whitelist path** (sửa trong `api/meta.js` nếu cần thêm endpoint Meta mới):
- `me/permissions`, `me/adaccounts`, `debug_token`
- `act_{id}` (GET/POST: rename, spend_cap)
- `act_{id}/(transactions|insights|adsets|campaigns)` (GET)
- Batch endpoint (root) — server validate từng `relative_url`

**Migration cũ:** row `META_TOKEN` trong bảng `app_settings` không còn được đọc nữa. Có thể xoá thủ công bằng:
```sql
DELETE FROM app_settings WHERE key = 'META_TOKEN';
```

---

## Telegram Bot

Webhook serverless tại `/api/telegram.js` — kết nối HC AI qua Telegram.

### Setup 1 lần

**1. Tạo bot:**
- Mở Telegram, chat với [@BotFather](https://t.me/BotFather) → `/newbot` → đặt tên + username
- Lưu `BOT_TOKEN` (vd `123456:AAH...`)

**2. Lấy chat_id của anh:**
- Chat với bot 1 câu bất kỳ → mở `https://api.telegram.org/bot<BOT_TOKEN>/getUpdates` xem `chat.id` (số nguyên)
- Hoặc chat với [@userinfobot](https://t.me/userinfobot)

**3. Thêm env vars trên Vercel:**
| Key | Value | Ghi chú |
|---|---|---|
| `TELEGRAM_BOT_TOKEN` | từ BotFather | bắt buộc |
| `TELEGRAM_ALLOWED_CHAT_IDS` | chat_id anh, ngăn cách dấu phẩy | whitelist |
| `TELEGRAM_WEBHOOK_SECRET` | chuỗi random 32 ký tự | bảo vệ webhook |
| `SUPABASE_URL` | URL Supabase project | đã có sẵn |
| `SUPABASE_SERVICE_ROLE_KEY` | service role key (bypass RLS) | **giữ kín** |
| `OPENAI_API_KEY` | `sk-proj-...` | cho free-text AI |
| `OPENAI_MODEL` | `gpt-4o-mini` (mặc định) | tuỳ chọn |

**4. Deploy lên Vercel:**
```bash
git push origin main
```
Vercel tự build, endpoint thành `https://<your-domain>.vercel.app/api/telegram`.

**5. Đăng ký webhook với Telegram:**
```bash
curl "https://api.telegram.org/bot<BOT_TOKEN>/setWebhook" \
  -d "url=https://<your-domain>.vercel.app/api/telegram" \
  -d "secret_token=<TELEGRAM_WEBHOOK_SECRET>"
```
Trả về `{"ok":true,"result":true,"description":"Webhook was set"}` là OK.

### Lệnh bot

| Lệnh | Tác dụng |
|---|---|
| `/help` | Menu lệnh |
| `/chitieu` | Spend hôm nay theo nhân sự |
| `/canhbao` | TKQC sắp hết tiền (≥80%) |
| `/canthu` | Khách chưa thanh toán + đã gửi phiếu |
| Câu hỏi tự nhiên | Bot dựng context dashboard → trả lời qua OpenAI |

### Debug

- Vercel Dashboard → Project → Deployments → click deployment → Functions → `api/telegram` → xem logs
- Test webhook handshake: `curl https://api.telegram.org/bot<BOT_TOKEN>/getWebhookInfo`
