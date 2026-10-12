# آزمون‌های واقعاً اجراشده

تاریخ: ۲۰۲۶-۱۰-۱۲. برنامهٔ اصلی در `7f403a9834aee3f392d182d58f37b1ee12cb56a0` روی main منتشر شد؛ اجرای CI همان منبع جدا ثبت شده است. بازبینی جدید گالری/مهاجرت/بستهٔ اجرایی در working tree جاری است. نتیجهٔ زیر خروجی واقعی ابزار است، نه برآورد یا گواهی آمادگی فروش.

| بررسی | نتیجهٔ موجود |
|---|---|
| سند اجرایی و native agents | فایل ۵۷۵خطی کامل؛ CLI 0.162.0-alpha.17.2؛ desktop 26.1007.21434؛ اجرای واقعی نقش‌ها |
| Skillها | ۱۰ entrypoint؛ validator پروژه و quick_validate رسمی موفق |
| DB | PostgreSQL 18.6 staging؛ migrationهای 0001–0007 واقعاً اعمال شدند؛ checksumها LF بودند و به تعمیر نیاز نداشتند |
| suite کامل واحد/DB/auth | اجرای تازهٔ root: ۸۵ آزمون، هفت فایل، exit0؛ 128.55s؛ گالری و checksum audit نیز آزموده شدند |
| auth | OTP هم‌زمان/انقضا/replay/بودجهٔ تلاش، identity واحد، MFA TOTP/recovery بومی و نقش لغوشده |
| مالی و انبار | رقابت آخرین واحد/کوپن، idempotency actor/payload، verify/double receipt، refund budget، late payment، outbox retry، bulk/نسخه/رزرو، shipping threshold |
| نوع و lint | TypeScript و ESLint یکپارچه موفق |
| build | Next16.4 optimized production build موفق؛ اصلاح CSP/image در build 52517 نیز موفق |
| مرورگر پیش از اصلاح CSP | چهار مورد Chrome154.0.8037.93/WebKit27.2 موفق؛ 20.1s و 30.5s برای مسیر کامل |
| T25/T17/T19/T12/T05 | MFA/UIproduct/upload/publish، guestOTP، حفظ فرم در 503، unknown سپس paid، receipt1/shipment1/stock3→2، tracking، دسترسی customer دیگر رد؛ بدون انتقال پول واقعی |
| RTL و accessibility | 320px سفارش پس از اصلاح موفق؛ axe صفحهٔ محصول/سفارش و سه صفحهٔ عمومی صفر violation در دو موتور |
| CSP | CspImage و دو hash ثابت اعلان مسیر اصلاح شدند؛ Chrome baseline صفر و اعلان دسترس‌پذیری صحیح؛ هشدار Windows WebKit27.2 با select بومی در HTML جدا، بدون کد/سبک برنامه بازتولید شد. مرتب‌سازی در دو موتور قبول شد؛ سبک دلخواه همچنان رد شد |
| dependency | pnpm audit --prod پس از override محدود esbuild: صفر advisory |
| secret | Gitleaks8.30.1 digest رسمی؛ شش commit موجود، بدون یافته؛ diff نهایی قبل push جدا بررسی می‌شود |
| CI منبع منتشرشده | [run38242058151](https://github.com/AmirMo10/Morphiume/actions/runs/38242058151): verify موفق، ۷۷ آزمون و شش مورد Chromium156.0.8078.4/Firefox157/WebKit27.2 Linux، build/lint/type/audit/history scan موفق |
| container | همان run تصویر اولیه را بدون env ساخت؛ Grype high/critical gate شکست خورد، تصویر منتشر/مستقر نشد. نسخهٔ کم‌حجم جدید تا پذیرش واقعی Linux/scan فقط candidate است |
| restore/load | هنوز نتیجهٔ کامل اجرا ندارند؛ encryption/collector smoke و harness به معنی قبولی restore یا ظرفیت نیست |

پس از اصلاح CSP، چهار مورد مرورگر دوباره موفق شدند: Chrome 24.0s/2.9s و WebKit 33.5s/5.3s. رخداد تشخیصی WebKit مانع جریان آزموده‌شده نبود؛ نسبت‌دادن آن به ابزار تا آزمایش کنترل جدا نتیجهٔ قطعی محسوب نمی‌شود.

پذیرش خروجی standalone تازه ابتدا شکست خورد: فایل native Sharp موجود بود ولی DLLهای همراه Windows در trace نبودند؛ `/api/admin/session` و `/api/cart` خطای 500 دادند. بسته‌بندی اکنون فقط بسته‌های native/libvips همان platform و نسخه را همراه مجوزهایشان اضافه می‌کند و encoder واقعی WebP را پیش از پایان build اجرا می‌کند. پس از اصلاح و restart، چهار regression موجود قبول شدند: Chrome خرید27.3s/عمومی3.9s، WebKit خرید41.9s/عمومی5.8s. پذیرش native Linux/musl هنوز به CI تصویر وابسته است.

دادهٔ مناطق: آزمون مستقل منبع جدید ۱۲ از ۱۲ قبول شد؛ bytes شهر/استان/مجوز با hashهای manifest تطبیق داشتند، تمام ۳۱ استان/۱۱۱۹ شهر رابطهٔ معتبر داشتند و شش مرکز مهمِ جاافتاده در منبع اولیه، در رکوردهای صریح منبع جایگزین حضور داشتند. این آزمون شمار تقسیمات رسمیِ جاری یا پوشش حمل را اثبات نمی‌کند.

گالری واقعی روی standalone اصلاح‌شده: Chrome11.6s و WebKit23.1s، دو از دو موفق. سه upload واقعی، alt/SKU/ترتیب در DB، حذف/ذخیره/reload، thumbnail و aria-pressed، تعویض حجم و جداسازی عکس، 320px/axe، رد خالی‌کردن گالری منتشرشده و حفظ ویرایش پس از بایگانی بررسی شدند. خطای نخست harness از ستون قدیمی SQL بود؛ با JOIN درست به variant اصلاح و همان سناریو دوباره اجرا شد. CI بعدی سه spec در سه موتور، یعنی نه مورد، خواهد داشت؛ نتیجهٔ آن هنوز ثبت نشده است.

راهنمای تکرار: `pnpm lint`، `pnpm typecheck`، `pnpm test` با env/DB جدا، `pnpm build` و مرورگر روی production server. برای این workstation، `E2E_CHROMIUM_CHANNEL=chrome` و انتخاب پروژه‌های `chromium` و `webkit` استفاده شدند؛ Firefox دانلودی با `spawn UNKNOWN` پیش از شروع مرورگر شکست خورد و علت نامعلوم است. همهٔ موتورهای Linux در CI باید جدا اجرا و گزارش شوند.

اعداد واقعی پذیرش در [ماتریس QA](qa/ACCEPTANCE_MATRIX.md)، خروجی بی‌اطلاعات حساس در [خلاصهٔ مرورگر](qa/browser-summary.json)، جزئیات بک‌اند در [CHECKS](backend/CHECKS.md) و متن فارسی در [بازبینی](persian/REVIEW.md) آمده‌اند. trace/password/OTP/کلید/dump به Git یا artifact عمومی منتقل نمی‌شوند.

موارد اجرا نشده: Firefox Windows/دستگاه واقعی، zoom200% کامل، broad UI matrix پنل، بررسی مستقل امنیت کامل/ASVS، PSP/SMS واقعی و sandbox حساب، CDN/network ایران، restore کامل، alert/offsite و اندازه‌گیری ۲۰۰VU/RPS. وضعیت این‌ها با تکمیل کار مستقل به‌روز می‌شود؛ نامعلوم بودن دادهٔ کسب‌وکار جایگزین نقص پیاده‌سازی نیست.
