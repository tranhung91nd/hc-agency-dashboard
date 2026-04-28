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
- **Backend:** Supabase (Postgres + Auth + Storage + RPC)
- **Hosting:** Vercel (auto-deploy từ GitHub main)
- **Meta API:** Graph API v25.0 (insights + adaccounts + adsets)
