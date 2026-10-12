# پیش‌نیاز fixture سرور

اجرای آیندهٔ restore/load روی app و تصویر واقعاً پذیرفته‌شدهٔ staging، به env همان app و DB role مخصوص runtime نیاز دارد؛ نتایج localhost به server تعمیم داده نمی‌شوند. مقادیر protected staging-app.json و staging-connections.json باید خصوصی بار شوند؛ کنترل mock و auth secret محلی را به‌جای کلید stage استفاده نکنید.

DBname آینده `morphiume_staging_runtime` است؛ guard فعلی QA/load هنوز آن را نمی‌پذیرد. تغییر آمادهٔ بررسی، مقایسهٔ دقیق نام استخراج‌شدهٔ URL با مجموعهٔ تنها دو نام `morphiume_staging` و `morphiume_staging_runtime` است، همراه loopback tunnel و محیط test/staging/mock. substring، suffix عمومی، wildcard یا اجازهٔ DB دیگری کافی نیست. این اصلاح guard تا تأیید و checks جداگانهٔ هماهنگ‌کننده در code فعال نمی‌شود و بخشی از checkpoint صرفاً رفع OTP نیست.

هستهٔ تغییر پیشنهادی برای review، هنوز فعال‌نشده:

```ts
const databaseName = decodeURIComponent(target.pathname.slice(1));
const allowedTestDatabases = new Set(["morphiume_staging", "morphiume_staging_runtime"]);
if (!allowedTestDatabases.has(databaseName)) throw new Error("Unapproved QA database");
```

پیش از فعال‌سازی، همان check همراه guardهای موجود host/environment/mock در fixtureهای e2e، آماده‌سازی load، ledger validation و metrics collector باید یکسان بررسی شود؛ rejected DBهای live، نام‌های صرفاً مشابه و path اضافی نباید پذیرفته شوند.

پس از آن تأیید: actual accepted image/SHA و app سلامت۳۱۰۰، proof native مشتری و مالکیت سفارش، media digest، fixture retained و restore۳۱۰۱، سپس۲۰۰حساب/۲۰۰محصول با کلیدهای همان stage و ledger واقعی. backup/restore/load تا اجرای واقعی، unrun می‌مانند؛ DB role یا ظرفیت با تغییر نام guard ثابت نمی‌شود.
