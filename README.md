# Morphiume

## Replacement VPS handoff — 20 October 2026

OVF/OVA is canceled. Follow the [clean Ubuntu VPS migration](docs/ops/NEW_VPS_MIGRATION.md), [machine-readable requirements](deploy/vps/requirements.json), [dependency matrix](docs/ops/VPS_DEPENDENCY_MATRIX.md) and [fresh source inventory/sizing](docs/ops/VPS_SOURCE_INVENTORY.md). The owner requested package upgrades and full source/image acceptance before migration. This replica preserves the complete current staging data/media/accounts/history; the separate public real-sales plan has different gates. No destination deployment is implied.

وضعیت جاری در ۱۳ اکتبر ۲۰۲۶: فروشگاه و پنل روی [IP خصوصی](http://192.168.240.51) با حفاظت HTTP و محدودیت شبکه فعال‌اند. منبع مستقر E4، پایگاه با ۱۳ مهاجرت و ۵۳ جدول، مسیر خرید واقعی آزمایشی، بازیابی جدا و زمان‌بندی سلامت/پشتیبان پذیرفته شده‌اند. [گزارش پیشرفت](docs/PROJECT_PROGRESS_20261013.md) و [وضعیت](docs/STATUS.md) مرجع نتیجه‌های فعلی‌اند. برای عملیات جاری، [قرارداد استقرار](docs/ops/STAGING_CONTRACT.md) را بخوانید.

حساب شخصی مالک در staging ساخته شده و تنظیم MFA در نخستین ورود او باقی است. اطلاعات ورود فقط در فایل محلی حفاظت‌شده نگه‌داری می‌شوند؛ [راهنمای ورود مالک](docs/ops/STAGING_OWNER_HANDOFF.md) فاقد رمز و اطلاعات شخصی است. پرداخت و پیامک فعلی آزمایشی‌اند؛ اتصال سرویس‌های واقعی و فروش عمومی هنوز فعال نیستند.

فروشگاه و پنل فارسی Morphiume با Next.js، BetterAuth و PostgreSQL. سند اجرایی، نقش عامل‌های واقعی، مالکیت فایل‌ها و محدودیت‌ها در [برنامهٔ اجرا](docs/IMPLEMENTATION_PLAN.md) و [وضعیت جاری](docs/STATUS.md) ثبت هستند. پرداخت و پیامک فعلی کنترل‌شده و آزمایشی‌اند؛ فروش واقعی فعال نشده است.

Node `24.22.0` و pnpm `12.14.0` پین شده‌اند. برای توسعه، `.env.example` را به `.env.local` کپی کنید و secretهای مستقل و اتصال DB آزمایشی خود را تنظیم کنید. کلیدها را از محیط واقعی کپی نکنید. سپس:

```powershell
pnpm install --frozen-lockfile
pnpm db:migrate
pnpm db:seed
pnpm dev
```

seed فقط در test/staging مجاز است؛ رمز حساب آزمایشی از متغیر خصوصی `BOOTSTRAP_ADMIN_PASSWORD` خوانده می‌شود و رمز پیش‌فرض ثابت وجود ندارد. در `/admin/login` ورود و TOTP یا recovery بومی را کامل کنید. درگاه آزمایشی هیچ پولی جابه‌جا نمی‌کند. صندوق OTP ابزار خصوصی آزمون است و SMS واقعی محسوب نمی‌شود.

پس از نصب وابستگی‌ها و تنظیم env، دستور یک‌مرحله‌ای `pnpm setup:dev` مهاجرت، seed و اجرای dev را به ترتیب انجام می‌دهد؛ فقط برای محیط test مجاز است و هیچ DB موجودی را پاک نمی‌کند.

```powershell
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm test:e2e
pnpm audit --prod
```

آزمون‌های DB تنها با محیط جدا و تنظیمات معتبر اجرا می‌شوند؛ skipped با passed یکی نیست. مرورگرها باید با `pnpm exec playwright install` تأمین شوند. محدودیت‌های قدیمی دانلود و اجرای مرورگر در ویندوز محفوظ‌اند؛ هر سه موتور Linux برای E4 واقعاً اجرا و پذیرفته شدند. نتیجه و حدود هر محیط در [گزارش آزمون](docs/TEST_REPORT.md) ثبت‌اند؛ viewport موبایل آزمون دستگاه واقعی نیست.

سرور `192.168.240.51` دارای Docker، Nginx و PostgreSQL staging جدا است. برنامهٔ E4 از IP خصوصی با حفاظت HTTP و محدودیت شبکه قابل دسترسی است؛ تونل SSH نیز برای عملیات و آزمون‌های مجاز باقی است. پورت برنامه و پایگاه مستقیماً در شبکه منتشر نشده‌اند.

- Infrastructure health: [http://192.168.240.51/healthz](http://192.168.240.51/healthz)
- SSH from the configured computer: `ssh morphiume-deploy`
- Deployment instructions and verified server state: [DEPLOYMENT.md](DEPLOYMENT.md)
- Repeatable server setup: [deploy/provision.sh](deploy/provision.sh)
- Staging image and services: [deploy/staging/Dockerfile](deploy/staging/Dockerfile), [Compose](deploy/staging/compose.yaml)
- Browser/financial evidence: [docs/qa/ACCEPTANCE_MATRIX.md](docs/qa/ACCEPTANCE_MATRIX.md)
- Actual backend checks: [docs/backend/CHECKS.md](docs/backend/CHECKS.md)

لینک‌های اجرایی: [معماری](docs/ARCHITECTURE.md)، [پیش‌نیازهای مالک](docs/OWNER_INPUTS.md)، [طراحی و دارایی‌ها](docs/design/ASSETS.md)، [زیرساخت](docs/ops/RUNBOOK.md). وجود CI یا runbook به معنای اجرا یا آمادگی فروش واقعی نیست؛ نتیجهٔ واقعی در گزارش آزمون ثبت می‌شود.

Completed repository changes are committed and pushed directly to GitHub `main`, as requested by the owner.
