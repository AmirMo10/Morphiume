# اجرای مستقل runtime لینوکس

مشاهدهٔ واقعی۱۳اکتبر۲۰۲۶؛ این گزارش آماده‌سازی و build است، نه پذیرش مرورگر/تصویر یا ظرفیت. [موجودی و دانلود ابزار](LINUX_NATIVE_ENVIRONMENT.md) به‌صورت مستقل ثبت شده است.

Root برای workspace خصوصی Ubuntu24.04، سه فایل0600 زیر پوشه0700 آماده کرد: کلید اختصاصی deployment، فقط hostkey دارای اثرانگشت تأییدشده و تنظیم runtime با اعتبار **DML** پایگاه dedicated. هیچ اعتبار owner/migration/bootstrap یا کلید سرویس واقعی منتقل نشد. SSH فقط alias/مقصد مصوب را با StrictHostKeyChecking و کلید Ed25519 تأییدشده، بدون agent/config عمومی، وصل می‌کند؛ forward فقط127.0.0.1:15433 است. probe واقعی TCP موفق شد؛ این probe SQL نبود.

پروف بعدی روی snapshot دقیق `db928f4b5a84f65ac24be5257f43ca5b90c8bddd` واقعاً در63.826323ms موفق شد: transaction فقط‌خواندنی،۱۳ checksum canonical،۵۳ جدول public، نقش برنامه بدون CREATE/SUPER/CREATEDB/CREATEROLE. SQLmutation/migration/seed انجام نشد. فایل محیط تازهٔ0600 فقط تنظیم runtime دارد؛ اصل محیط Windows، پایگاه‌های قدیمی و مالی/صف/limiter محفوظ‌اند.

چهار تلاش نخست پیش از Next متوقف شدند و captureهای جدا محفوظ‌اند:

| تلاش | دیوارزمان ثانیه | نتیجهٔ واقعی |
|---|---:|---|
|۱|0.7168095|PATH فاقد pnpm برای self-spawn؛ ENOENT، exit1|
|۲|4.9382781|تنظیم نصب/store منطبق نبود؛ pnpm درخواست نصب را بدون TTY متوقف کرد، exit1؛ purge انجام نشد|
|۳|1.319711728|گزینهٔ store-dir برای دستور run پذیرفته نشد، exit1|
|۴|0.868928612|بررسی سخت‌گیرانه خطا داد: enableGlobalVirtualStore با context نصب تفاوت داشت، exit1|

تنظیم واقعی نصب از metadata/tooling مشاهده شد: pnpm11.25.0، Node24.21.0، store خصوصی و CI=true هنگام نصب. syntax عمومی `--config.store-dir` با query بدون mutation تأیید شد؛ رفتار `verifyDepsBeforeRun=error` در کد نصب‌شدهٔ همان11.25 بررسی شد. تلاش۵ با context نصب یکسان و guard سخت‌گیرانه، **build production را در37.67842981s با exit0** گذراند. هیچ confirmModulesPurge، حذف/reinstall، تغییر lock، bypass یکپارچگی یا تغییر منطق برنامه برای موفقیت به‌کار نرفت. [مرجع رسمی تنظیمات pnpm](https://pnpm.io/settings) تنظیم CLI/env را توضیح می‌دهد؛ نسخهٔ نصب‌شده مرجع دقیق guard است.

source تازه و snapshot پیشینD7 جدا و محفوظ‌اند. این build سرور یا browser/OTP/MFA/worker را شروع نکرد. cache مرورگر رسمی هنوز در محیط Linux وارد/اجرا نشده و آماده‌سازی mirror مستقل ادامه دارد. پذیرش native/full78، packaged image، سازگاری سرور، backup/restore تازه و۲۰۰VU/RPS همچنان gates جدا هستند. credentialها، تنظیم واقعی، لاگ‌ها و tracebackهای خام وارد این گزارش یا Git نشده‌اند.
