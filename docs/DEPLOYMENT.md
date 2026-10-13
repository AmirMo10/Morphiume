# مسیر استقرار اجراپذیر

وضعیت جاری ۱۳ اکتبر ۲۰۲۶: تصویر پذیرفتهٔ E4 واقعاً روی سرور فعال است؛ checkout برنامهٔ سرور عمداً روی همان منبع پذیرفته ثابت می‌ماند، درحالی‌که main شامل ابزارها و گزارش‌های جدید نیز هست. [قرارداد staging](ops/STAGING_CONTRACT.md)، [اجرای انتقال E4](ops/E4_RUNTIME_CUTOVER_EXECUTION.md)، [پذیرش IP خصوصی](qa/E4_PRIVATE_PREVIEW_EXECUTION.md) و [زمان‌بندی پذیرفته](ops/E4_SCHEDULE_EXECUTION.md) مرجع عملیات جاری‌اند. دستورهای عمومی پایین مربوط به مسیر اولیه‌اند؛ آن‌ها را برای جایگزینی خودکار تصویر/پروژه/پروفایل فعال اجرا نکنید.

میزبان فعلی `192.168.240.51` با SSH alias `morphiume-deploy` و host key تأییدشده متصل است؛ جزئیات اولیه در [سند اتصال](../DEPLOYMENT.md) ثبت‌اند. محیط staging زیر `/srv/morphiume/staging` و secretها در `/etc/morphiume-staging` جدا هستند؛ mount قدیمی `/srv/morphiume/postgres` حفظ می‌شود و دادهٔ فروش واقعی ندارد.

CI در `.github/workflows/verify.yml` source `main` را با PostgreSQL موقت، آزمون‌ها و مرورگرها بررسی می‌کند. تصویر Linux از `deploy/staging/Dockerfile` خارج از میزبان فروش ساخته و با revision source برچسب می‌خورد. Gitleaks/Grype و dependency audit gate هستند؛ وجود فایل workflow به معنی اجرای موفق نیست. تصویر تأییدشده با digest/ID ثابت در فایل خصوصی deploy.env قرار می‌گیرد.

اجرای مجاز روی میزبان staging پس از تأیید همان source/image:

```sh
cd /opt/morphiume
MORPHIUME_KEEP_DB_TUNNEL=1 bash deploy/staging/deploy.sh "$VERIFIED_SOURCE_COMMIT" "$IMMUTABLE_IMAGE"
```

اسکریپت Compose را اعتبارسنجی، نسخهٔ قبل را نگه‌داری، backup، migration و readiness برنامه/worker را بررسی می‌کند. دو متغیر دستور باید commit کامل و digest/ID تصویرِ تأییدشده باشند؛ revision تصویر با checkout تطبیق داده می‌شود. گزینهٔ tunnel فقط DB روی loopback را برای آزمون نگه می‌دارد. health زیرساخت `/healthz` با readiness برنامه `/api/health/ready` یکی نیست. [قرارداد runtime و شبکه](ops/STAGING_CONTRACT.md)، [runbook](ops/RUNBOOK.md) و [release](ops/CI_RELEASE.md) جزئیات secret، uid، محدودیت منابع و rollback را دارند.

برای مشاهدهٔ staging از این رایانه:

```powershell
ssh -N -L 127.0.0.1:3100:127.0.0.1:3001 morphiume-deploy
```

سپس `http://localhost:3100`؛ listener برنامه فقط loopback سرور است. دسترسی از IP پورت ۸۰ به محیط فروش واقعی هنوز فعال نیست. expose کردن mock/پنل از HTTP عمومی مجاز نیست. TLS/domain/PSP/SMS و هویت قانونی باید پیش از فعال‌سازی live تأیید شوند؛ startup gate کنونی live صریح است.
