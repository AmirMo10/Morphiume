# Morphiume

فروشگاه و پنل فارسی Morphiume با Next.js، BetterAuth و PostgreSQL. سند اجرایی، نقش عامل‌های واقعی، مالکیت فایل‌ها و محدودیت‌ها در [برنامهٔ اجرا](docs/IMPLEMENTATION_PLAN.md) و [وضعیت جاری](docs/STATUS.md) ثبت هستند. پرداخت و پیامک فعلی کنترل‌شده و آزمایشی‌اند؛ فروش واقعی فعال نشده است.

Node `24.21.0` و pnpm `11.25.0` پین شده‌اند. برای توسعه، `.env.example` را به `.env.local` کپی کنید و secretهای مستقل و اتصال DB آزمایشی خود را تنظیم کنید. کلیدها را از محیط واقعی کپی نکنید. سپس:

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

آزمون‌های DB تنها با محیط جدا و تنظیمات معتبر اجرا می‌شوند؛ skipped با passed یکی نیست. مرورگرها باید با `pnpm exec playwright install` تأمین شوند. در این میزبان دانلود Chromium با 403 مواجه شد و Chrome نصب‌شده برای آزمون همان موتور استفاده شد؛ خطای اجرای Firefox هنوز نتیجهٔ قبولی ندارد.

سرور `192.168.240.51` دارای Docker، Nginx و PostgreSQL staging جدا است. دسترسی برنامهٔ staging از SSH tunnel حفاظت می‌شود. پورت ۸۰ زیرساخت تا استقرار برنامه مسیر فروش فعال ندارد.

- Infrastructure health: [http://192.168.240.51/healthz](http://192.168.240.51/healthz)
- SSH from the configured computer: `ssh morphiume-deploy`
- Deployment instructions and verified server state: [DEPLOYMENT.md](DEPLOYMENT.md)
- Repeatable server setup: [deploy/provision.sh](deploy/provision.sh)
- Staging image and services: [deploy/staging/Dockerfile](deploy/staging/Dockerfile), [Compose](deploy/staging/compose.yaml)
- Browser/financial evidence: [docs/qa/ACCEPTANCE_MATRIX.md](docs/qa/ACCEPTANCE_MATRIX.md)
- Actual backend checks: [docs/backend/CHECKS.md](docs/backend/CHECKS.md)

لینک‌های اجرایی: [معماری](docs/ARCHITECTURE.md)، [پیش‌نیازهای مالک](docs/OWNER_INPUTS.md)، [طراحی و دارایی‌ها](docs/design/ASSETS.md)، [زیرساخت](docs/ops/RUNBOOK.md). وجود CI یا runbook به معنای اجرا یا آمادگی فروش واقعی نیست؛ نتیجهٔ واقعی در گزارش آزمون ثبت می‌شود.

Completed repository changes are committed and pushed directly to GitHub `main`, as requested by the owner.
