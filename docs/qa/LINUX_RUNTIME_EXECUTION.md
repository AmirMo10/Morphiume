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

## اجرای نسخهٔ دقیق e4bed69

در13 اکتبر، sourceمنتشرشدهٔ e4bed691dc938a9c0f79022696d24f063ad97724 از Gitarchive جدا وارد همان workspaceخصوصی Linux شد:802عضو،686فایل،7864320بایت، SHA256 af7fbdcb7a467dad96e4595e7f6ae629d05723b57a1bb52a605fd2e1a10e724f. snapshotهای قبلی محفوظ‌اند. نصب frozen در4.426383921ثانیه/exit0 انجام شد؛ هر686فایل پیش و پس از build بدون تغییر، lockSHA36e3b10b709b0f61e2a99831ca79b3d87c296b316a37363e5c02f63aed21566f.

پروف تازهٔ RR فقط‌خواندنی با نقش DML همان dedicatedQA،13checksumcanonical/53table/فاقدCREATE و ownercredential، در65.099142ms موفق و ROLLBACK شد. فقط envجدید0600 و logهای خصوصی در snapshotتازه ساخته شدند. buildواقعی production همان نسخه در39.488284907ثانیه/exit0 موفق شد؛ تنظیم pnpm دقیقاً با contextنصب برابر و verifyDepsBeforeRun=error بود. هیچ reset/reinstall/purge،migration/seed/SQLmutation، شروع app/worker یا browser اجرا نشد.

مرحلهٔ واقعی CI همینsource، initializeنقش محدود، migrateباowner، readbackDML و seedرا موفق گذراند؛ این اجرای CI با پروف فقط‌خواندنی Linux محلی یکی نیست. nativeCI هنوز در اجرا و packagedimageاین نسخه پذیرفته نشده؛ cacheproducer همینsource پس از download با lexicalguard متوقف شد. build موفق به‌تنهایی native/auth/privacy/capacity یا استقرار را ثابت نمی‌کند.
