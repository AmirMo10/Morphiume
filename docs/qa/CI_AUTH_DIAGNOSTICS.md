# تشخیص محدودیت احراز هویت در CI

هماهنگ‌کننده خروجی واقعی [run38266486931](https://github.com/AmirMo10/Morphiume/actions/runs/38266486931) برای checkpoint `76dfcd1` را بررسی کرد: **۱۵۰/۱۵۰ آزمون واحد و DB موفق، سپس۱۱/۱۸ مرورگر موفق و۷شکست درحدود۲٫۲دقیقه**. image job به‌علت شکست verify اجرا نشد؛ تصویر پذیرفته‌شده‌ای از این run موجود نیست. این شمار از بررسی CI هماهنگ‌کننده است؛ QA آن را اجرای محلی Linux معرفی نمی‌کند.

| شکست گزارش‌شدهٔ CI | شاهد فعلی |
|---|---|
| gallery در Chromium و WebKit | در login ماند؛ وضعیت HTTP آن شکست‌ها ثبت نشده و علت هنوز قطعی نیست |
| inventory permissions در هر سه موتور | heading راه‌اندازی MFA نیامد؛ وضعیت HTTP آن شکست‌ها ثبت نشده و علت هنوز قطعی نیست |
| catalog در Firefox | renewal بومی صریحاً429 گرفت؛ پاسخ200 مورد انتظار آزمون نبود |
| full purchase در Firefox | در login ماند؛ وضعیت HTTP آن شکست ثبت نشده و علت هنوز قطعی نیست |

بررسی source نصب‌شدهٔ BetterAuth۱٫۷٫۷: `dist/api/rate-limiter/index.mjs` برای sign-in حداکثر۳در۱۰ثانیه تعیین می‌کند؛ plugin دو مرحله‌ای نیز برای مسیرهای two-factor همان قاعده را تعیین می‌کند. کلید storage از **مسیر درخواست و IP واقعی یا fallback مشترکِ همان مسیر** ساخته می‌شود؛ محدودیت یک bucket ترکیبیِ همهٔ مسیرهای two-factor نیست. پاسخ استاندارد این نسخه زمان را در `X-Retry-After` می‌فرستد. helper پیشین فقط `Retry-After` را می‌دید و بعضی ورود/enroll/renewها اصلاً از helper عبور نمی‌کردند.

بازآزمایی مستقل روی Chrome۱۵۴٫۰٫۸۰۳۷٫۹۳ Windows و runtime منجمد `48583` واقعاً موفق شد. سه حساب مصنوعی متفاوت، sign-in معتبر200 داشتند؛ ورود UI بعدی429 با X-Retry-After10 گرفت و heading MFA صفر بود. action اصلاح‌شده429 را مشاهده کرد،۱۰٫۲۵ثانیه منتظر ماند و پاسخ بومی200 و heading واقعی MFA گرفت. چهار حساب fixture غیرفعال، سشن‌های fixture صفر و limiter records دست‌نخورده بودند. `native-auth-rate-window-reproduction.json` فقط status/timing/count امن نگه می‌دارد. این آزمایش سازوکار نبود heading بر اثر429 را ثابت می‌کند؛ علت شش شکست بدون status در CI را به‌تنهایی ثابت نمی‌کند.

اصلاح فقط در QA: `native-auth-actions.ts` پیش از action منتظر پاسخ POST همان دستهٔ مسیر ثابت می‌شود و stage/category/status و زمان عددی Retry-After یا X-Retry-After را ثبت می‌کند. URL/query، email، body، cookie، password، OTP، TOTP URI یا recovery code در diagnostics نیستند. فقط پاسخ واقعی429 یک retry محدود اجازه می‌دهد؛ زمان اعلام‌شده با۲۵۰ms حاشیه رعایت و TOTP قبل از هر تلاش تازه محاسبه می‌شود. در نبود هر دو header، بازهٔ کامل۶۰ثانیه‌ای guard سراسری برنامه محافظه‌کارانه رعایت می‌شود؛ سایر وضعیت‌ها و assertionها retry خودکار ندارند. sign-in، enable، enrollment و renewal در همهٔ specها همین helper را استفاده می‌کنند. annotationهای امن با whitelist مستقل وارد sanitizer می‌شوند.

runtime، محدودیت‌ها، IP/header semantics و ساعت تغییر نکردند؛ رکوردهای limiter توسط QA پاک یا بازنشانی نشدند. عامل/grant موفق با SQL جعل نشد؛ enrollment و صدور proof از handler بومی واقعی‌اند و زمان proof تنها در سناریوی fixture قدیمی‌کردن عمدی برای اثبات403 استفاده می‌شود. دو migration0008/0009 پیش از بازآزمایی بومی به shared staging DB اضافه شدند: registry نامک/trigger، collection.updated_at و جدول خالی تصمیم شکست refund. هماهنگ‌کننده تأیید کرد آن migrationها auth/limiter/payment/queue/reservation تغییر ندادند؛ هیچ علت احراز هویت به این schema delta نسبت داده نشده است.

Windows Firefox همچنان در launcher در دسترس نیست؛ Linux یا CI دوباره اجرا نشده و نتیجه‌ای برای آن جعل نمی‌شود. اجرای کامل محلی Chrome/WebKit با helper اصلاح‌شده روی runtime منجمد `48583`، **۱۲/۱۲ در۲۷۲٫۹۸۴۴۸۹ثانیه موفق، unexpected/skipped/flaky و Playwright retries صفر** بود. cleanup fixtureها و سیاست ارسال بدون خطا تمام شد. sanitizer واقعاً۴۶ event بومی whitelist کرد: Chrome enrollment429 باX-Retry-After8، انتظار۸٫۲۵ثانیه و TOTP تازه200؛ WebKit renewal429 باX-Retry-After3، انتظار۳٫۲۵ثانیه و TOTP تازه200. بقیهٔ statusهای ثبت‌شده200 بودند. نتیجهٔ قبلی۱۲/۱۲ در `browser-checkpoint-76df-local.json` محفوظ و `browser-summary.json` اکنون همین اجرای تازه با diagnostics امن است. این نتیجهٔ محلی جانشین پذیرش دوبارهٔ سه موتور Linux نمی‌شود.
