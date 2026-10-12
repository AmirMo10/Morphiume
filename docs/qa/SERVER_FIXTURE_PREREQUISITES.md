# پیش‌نیاز fixture سرور

اجرای آیندهٔ restore/load روی app و تصویر واقعاً پذیرفته‌شدهٔ staging، به env همان app و DB role مخصوص runtime نیاز دارد؛ نتایج localhost به server تعمیم داده نمی‌شوند. مقادیر protected staging-app.json و staging-connections.json باید خصوصی بار شوند؛ کنترل mock و auth secret محلی را به‌جای کلید stage استفاده نکنید.

هماهنگ‌کننده guard جدید را جداگانه مجاز کرد و code اکنون در `tests/helpers/qa-target.mjs` فعال است: نام رمزگشایی‌شده فقط `morphiume_staging` یا `morphiume_staging_runtime`، protocol PostgreSQL، host فقط localhost/127.0.0.1، محیط test/staging و هر دو provider mock. مسیر اصلی URL باید دقیقاً یک segment داشته باشد؛ query/fragment حتی delimiter خالی رد می‌شوند. substring، suffix عمومی، wildcard یا DB/host دیگری پذیرفته نمی‌شود. private env پیش از check بار می‌شود و مقدارهای صریح محیط را بازنویسی نمی‌کند.

هستهٔ نام مجاز در guard فعال:

```ts
const databaseName = decodeURIComponent(target.pathname.slice(1));
const allowedTestDatabases = new Set(["morphiume_staging", "morphiume_staging_runtime"]);
if (!allowedTestDatabases.has(databaseName)) throw new Error("Unapproved QA database");
```

guard یکسان در config/fixtureهای e2e، full-purchase/gallery، prepare load، ledger و metrics اعمال شده؛ هماهنگ‌کننده runner `scripts/run-load.mjs` را نیز بعد از dotenv و قبل از fixture/k6 به آن متصل کرد. بررسی source نصب‌شدهٔ `pg-connection-string` ثابت کرد query `host` می‌تواند host ظاهری URL را عوض کند. یک آزمون خالص همین رفتار parser واقعی را نشان می‌دهد؛ query host/database/options/user/port/SSL همگی از سمت QA رد می‌شوند. private config فعلی query/fragment ندارد؛ مقدار محرمانه‌ای چاپ نشد.

اجرای هدفمند مستقل **۴۸/۴۸ در۳۲۷ms**، scoped lint و TypeScript موفق شدند. نام‌های دوگانه و percent-encoding صحیح قبول، نام live/مشابه/uppercase، slash/dot-segment/double-encoding/NUL/malformed و host دیگر رد شدند. نتیجهٔ global۲۲۸/۲۲۸ هماهنگ‌کننده پیش از کشف این فایل جدید بود؛ عدد۴۸ به آن اضافه یا به‌عنوان اجرای کل suite معرفی نشده است. فعال‌شدن guard، اتصال واقعی role runtime یا سازگاری source جدید با image قدیمی را ثابت نمی‌کند.

پیش از هر اجرای واقعی server: actual accepted immutable image/SHA/schema و app سلامت۳۱۰۰، env/کلیدهای همان app و slot صریح DB لازم‌اند. سپس proof native مشتری و مالکیت سفارش، media digest، fixture retained و restore۳۱۰۱، بعد۲۰۰حساب/۲۰۰محصول و ledger واقعی. backup/restore/load تا اجرای واقعی، unrun می‌مانند؛ DB role یا ظرفیت با تغییر نام guard ثابت نمی‌شود. تصویر قدیمی d7 هنوز پذیرش کامل image/browser ندارد؛ source جدید uncommitted به‌جای آن فرض نمی‌شود.
