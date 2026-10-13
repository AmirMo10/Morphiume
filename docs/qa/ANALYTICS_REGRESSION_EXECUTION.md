# اجرای واقعی regression آماری — ۱۳ اکتبر ۲۰۲۶

همهٔ **۱۵ آزمون تعریف‌شده و کشف‌شدهٔ فایل analytics، ۱۵/۱۵ موفق** شدند؛ failed/pending/skipped صفر و exit فرایند Vitest صفر بود. مدت child با clock یکنواخت **38.8106368 ثانیه**، از UTC **12:16:16.430 تا12:16:55.242** ثبت شد. آزمون موفق دوباره اجرا نشد. [شاهد امن JSON](analytics-regression-safe.json) هویت منبع، hashها و شمارش‌ها را ثبت می‌کند.

## هدف، منبع و محدوده

اجرا پس از مجوز صریح Root، با runtime DML و migration owner جداگانهٔ غیرsuperuser، روی **`morphiume_staging` از loopback15433** انجام شد. نقش runtime فاقد SUPERUSER، CREATEDB، CREATEROLE، BYPASSRLS و CREATE پایگاه/public بود. اعتبار bootstrap، target ظرفیت/runtime، پایگاه تازهٔ دیگر یا provider واقعی استفاده نشد.

فقط `tests/integration/backend/analytics.test.ts` با `ANONYMOUS_ANALYTICS_PG_TESTS=true` انتخاب شد. `createIsolatedDatabase`، schema موقت با نامِ generated مجاز ساخت؛ همهٔ fixtureها، actor/sessionهای domain، analytics و checkout آزمایشی در همان schema بودند. این actorها شاهد ورود native OTP/MFA نیستند. مرورگر، HTTP برنامه، SSH یا load اجرا نشد.

HEAD شروع `8f8c3e3810fb07acc29888497e8ab305241eaf7a` و پایان `fbefdc0793e7ba0ad985b90033316c11edd5c440` بود؛ Root در حین اجرا فقط مستندات SRE را منتشر کرد. byte hash فایل آزمون، سرویس analytics و helper isolation قبل/بعد یکسان بود. فایل آزمون در هر دو commit دقیقاً۱۵ declaration داشت؛ reporter نیز۱۵ مورد کشف کرد. برنامهٔ deployed همچنان E4 است؛ این regression موجب تغییر سرویس deployed نشد.

## اصلاح fixture و حدود تشخیص

در CIهای قبلی با برچسب‌های a063/5d7، case «reuse کلید dedup منقضی بدون حذف فیزیکی» search=2 انتظار داشت اما search=1 و zeroResultSearch=1 مشاهده شد. fixture، `expires_at` را فقط یک میکروثانیه قبل از `clock_timestamp()` می‌گذاشت.

parser واقعاً نصب‌شدهٔ `pg-types2.2.0/OID1184`، timestamp با fraction123456µs را به Date با123000µs تبدیل می‌کند؛ outbound Date هم دقت میلی‌ثانیه‌ای دارد. بنابراین نمونهٔ بعدیِ پایگاه در123900µs می‌تواند هنوز123000µs به SQL bind کند، که قبل از expiry123455µs است. **این سازوکار به‌طور آفلاین نشان داده شد؛ clockهای دقیق آن CIها ثبت نشده و علت قطعی همهٔ شکست‌های گذشته اثبات نشده است.** capture آمار همچنان best effort است.

اصلاح فقط fixture است: expiry **یک ثانیه در گذشته**، با `UPDATE.rowCount=1` برای اثبات باقی‌بودن همان ردیف پیش از reuse. expected search=2، zeroResultSearch=1 و seen-row=1 حفظ شدند. sleep، retry، تغییر quota یا ضعیف‌کردن assertion اضافه نشد؛ `src/server/commerce/analytics.ts` تغییر نکرد. همین case در اجرای واقعی فعلی موفق بود.

چهار بررسی آفلاین parser/Date-binding/fixture و محدودبودن diff موفق بودند، ازجمله۱۰۰۰ offset زیرمیلی‌ثانیه؛ مدت277.1815ms. lint محدود، TypeScript و whitespace نیز پیش از run موفق بودند. این بررسی‌های آفلاین با count۱۵ اجرای PG جمع زده نشده‌اند.

## پاک‌سازی و guard شمارش

snapshotهای خواندنی قبل/بعد، count و fingerprint ردیف‌های **هر۴۹ جدول public** را یکسان یافتند. helper isolation نیز وضعیت صف/رزرو عمومی را مقایسه کرد. generated schemaها **۰ قبل و۰ پس از cleanup** بودند؛ schema دقیقاً متعلق به fixture حذف شد. دادهٔ عمومی، runtime و تاریخچهٔ مالی برای رفع failure دست‌کاری نشدند. raw report/log و snapshotها خصوصی ماندند؛ ACL پوشه فقط Admin جاری و SYSTEM را مجاز کرد.

dispatch ابتدا۱۶ مورد درخواست کرده بود، اما منبع و discovery۱۵ مورد داشتند. **outer evidence guard با انتظار۱۶، پس از موفقیت child با exit0، بسته و parent با exit1 پایان یافت**؛ این خطای شمارش evidence بود، نه failure آزمون محصول. capture نخست محفوظ ماند. Root شمارش۱۵ را تأیید کرد و یک companion تازه و immutable به declarationهای هر دو commit و reporter۱۵/۱۵ bind شد؛ هیچ PG یا آزمون موفق برای «سبزکردن» این guard تکرار نشد.

یک inspection اولیه نیز پیش از اجرای JavaScript به‌علت syntax متوقف شد؛ credential یا PG خوانده نشد. پس از اصلاح inspection، همان یک اجرای واقعیِ کل فایل انجام شد. پنجره پس از cleanup و audit موفق به Root آزاد شد؛ درخواست PG/native دیگری برای تهیهٔ گزارش اجرا نشد.

این نتیجه regression مستقل domain/پایگاه analytics است. پذیرش native مرورگر، اشباع RPS، دقت clock در حد میکروثانیه یا تضمین ثبت همهٔ eventهای best-effort را ادعا نمی‌کند.
