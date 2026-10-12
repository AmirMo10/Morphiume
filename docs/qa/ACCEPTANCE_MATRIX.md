# شواهد پذیرش T01–T30

این ماتریس وضعیت واقعی تا ۲۰۲۶-۱۰-۱۲ را ثبت می‌کند. آزمون‌های QA روی source درحال‌کار پس از commit فاز صفر `b01c09f` اجرا شده‌اند؛ build مرورگر Windows production بوده و DB آزمایشی از SSH tunnel متصل است. نتیجهٔ build نهایی و Git نهایی باید توسط هماهنگ‌کننده در TEST_REPORT ثبت شود. «جزئی» یعنی کل سناریو ثابت نشده است؛ این جدول گواهی ASVS، ظرفیت یا انتشار واقعی نیست.

| سناریو | شواهد موجود | وضعیت |
|---|---|---|
| T01 | Chromium/Google Chrome و WebKit: انتخاب حجم، اضافه‌کردن و ماندگاری سبد پس از reload | اجرا و موفق تا مسیر T25؛ Firefox اجرا نشد |
| T02 | ۳۵ unit مستقل پول/ورودی شامل هشت قالب شمارهٔ برابر؛ handler بومی ورود دوباره همان شماره فقط یک identity می‌سازد | بخش ورودی و identity اجرا و موفق |
| T03 | PG واقعی: انقضا، مصرف مجدد، دو verify هم‌زمان و بودجهٔ تلاش پس از resend؛ دو handler بومی هم‌زمان فقط یک سشن صادر کردند | اجرا و موفق |
| T04 | دادهٔ MFA واقعی در QA تنها پس از TOTP grant گرفت؛ کنترل دامنه در integration بک‌اند گزارش شده | اجرا در لایه‌های ذکرشده؛ آزمون HTTP همهٔ عملیات باقی است |
| T05 | HTTP سفارش بدون ورود 401؛ سپس مشتری دوم با OTP و cookie واقعی وارد شد و همان سفارش 404 گرفت؛ مالکیت نشانی در suite بک‌اند | سفارش HTTP اجرا و موفق؛ invoice و پیوست همهٔ مسیرها هنوز ثابت نشده |
| T06 | role لغوشده بلافاصله در guard واقعی BetterAuth رد شد؛ بک‌اند grant لغوشده را رد می‌کند | اجرا در لایه‌های ذکرشده |
| T07 | unit حد مالی و مقدار اعشاری/منفی/overflow؛ suite مالی سرور | جزئی؛ ماتریس tamper تمام APIها هنوز باقی است |
| T08 | رقابت موجودی آخر در PG واقعی، suite مستقل integration بک‌اند | شواهد backend/CHECKS؛ اجرای هماهنگ QA نهایی درج شود |
| T09 | یک idempotency checkout همان سفارش را برمی‌گرداند | شواهد suite بک‌اند |
| T10 | status مرورگر اثبات پرداخت نیست؛ verify پیش از mock موفق paid نمی‌شود | شواهد suite بک‌اند |
| T11 | verify تکراری و distinct receipts با یک shipment | شواهد suite بک‌اند |
| T12 | unknown create حفظ می‌شود؛ مرورگر نتیجهٔ نامشخص کنترل‌شده را دید، stock هنوز 3/reserved1 بود و همان تلاش بعداً موفق شد | دو موتور اجرا و موفق؛ اختلال واقعی PSP اجرا نشده |
| T13 | پرداخت دیرهنگام پس از اتمام موجودی به exception ثبت می‌شود | شواهد suite بک‌اند |
| T14 | amount mismatch و adapter contract | جزئی؛ ترکیب تمام merchant/currency/orderهای نامنطبق اجرا نشده |
| T15 | بودجهٔ refund دو درخواست هم‌زمان | شواهد suite بک‌اند |
| T16 | lease منقضی outbox دوباره پردازش می‌شود و اثر دوباره ندارد | شواهد suite بک‌اند؛ restart کانتینر هنوز جداست |
| T17 | API و filepicker واقعی: PNG به WebP، fetch عمومی، اصل خصوصی 404؛ malformed/MIME ناهماهنگ/SVG/6001px/>20MP/>4MiB رد شد؛ anonymous 401 | دو موتور اجرا و موفق در دامنهٔ موارد ثبت‌شده |
| T18 | HTTP سفارش owned `private,no-store`؛ همان URL برای anonymous رد شد | جزئی؛ CDN و cache واقعی راه‌اندازی نشده |
| T19 | اولین ارسال OTP با پاسخ 503 کنترل‌شده مواجه شد؛ phone و address draft حفظ شدند و ارسال بعدی بومی موفق شد | دو موتور اجرا و موفق؛ outage واقعی provider آزموده نشده |
| T20 | products/account/adminlogin/product/order در ۳۲۰px، keyboard و reduced-motion و axe بدون violation: دو موتور؛ overflow سفارش اصلاح و build بازآزموده شد | دامنهٔ ذکرشده اجرا و موفق؛ zoom/screenreader/device حقیقی باقی است |
| T21 | کاربر QA مدیر در UI بدون SQL محصول ساخت، پیش‌نمایش دید و منتشر کرد | دو موتور اجرا و موفق؛ SQL فقط حساب fixture را آماده کرد |
| T22 | DevOps برنامهٔ restore جدا دارد | rehearsal و پرداخت پس از restore هنوز اجرا نشده |
| T23 | نمایش ۱۲۳٬۴۵۶ تومان، DB snapshot دقیق ۱۲۳۴۵۶۰ IRR، receipt/stock واقعی | دو موتور اجرا و موفق |
| T24 | fail-closed live configuration و seed فقط test/staging | بررسی coordinator؛ artifact/live واقعی فعال نشده |
| T25 | دو موتور از admin MFA تا filepicker/product/guest/OTP/quote/mock/receipt1/shipment1/stock3→2/tracking و ۳۲۰px | build جاری دوباره اجرا و موفق؛ Firefox هنوز engine gap |
| T26 | دریافت دوم distinct و یک shipment؛ refund دریافت extra | شواهد suite بک‌اند |
| T27 | آخرین ظرفیت کوپن و retry همان سفارش | شواهد suite بک‌اند |
| T28 | stale product expectedVersion رد می‌شود | شواهد suite بک‌اند |
| T29 | مالکیت و eligibility مرجوعی، restock پس از بررسی کیفیت فقط یک‌بار، cancellation | شواهد suite بک‌اند؛ همهٔ UIها هنوز یکجا اجرا نشده |
| T30 | actor/payload binding idempotency | شواهد suite بک‌اند |

محدودیت موتور: دانلود Chromium bundle از CDN پاسخ 403 محدودیت منطقه داشت؛ Google Chrome نصب‌شده **154.0.8037.93** برای موتور Chromium به کار رفت و نسخه با `browser.version()` واقعی خوانده شد. Firefox رسمی ۱۵۷ دانلود شد ولی Windows قبل از شروع browser با `spawn UNKNOWN` رد کرد؛ علت نهایی ثابت نشده است. WebKit **27.2** اجرا شد و نسخه با همان API خوانده شد. این شواهد دستگاه واقعی iOS/Android نیستند؛ CI Linux برای هر سه موتور تنظیم می‌شود و نتیجهٔ اجراشدهٔ آن باید جدا ثبت شود.

خطای واقعی QA-01: BetterAuth ۱٫۷٫۷ هنگام آغاز handler به `rateLimit.id` نیاز داشت. migration 0004 و schema توسط عامل بک‌اند اصلاح شد؛ پس از اصلاح پنج integration مستقل auth موفق شدند. آزمون native MFA با TOTP واقعی و recovery code بومی اجرا شد و استفادهٔ مجدد recovery code رد شد. حذف role دسترسی را بلافاصله رد کرد.

خطای واقعی QA-02: order page در هر دو موتور در عرض ۳۲۰، scrollWidth ۳۴۱ داشت؛ grid فرزند min-content عرض حدود ۳۲۴٫۵۶ داشت. frontend با `min-inline-size:0` و mobile `minmax(0,1fr)` اصلاح کرد؛ پس از build واقعی، شرط scrollWidth<=clientWidth در هر دو موتور موفق شد.

دستورهای واقعی اجرا: `pnpm exec vitest run tests/unit/shared tests/integration/auth` (اجرای اول ۳۷/۳۹، پس از اصلاح ۳۹/۳۹؛ سپس گسترش native handler/recovery، auth پنج از پنج). `E2E_CHROMIUM_CHANNEL=chrome pnpm test:e2e` (اجرای کامل اول/دوم سه fail: دو موتور overflow انتهایی و Firefox launch). `pnpm test:e2e public-rtl.spec.ts --project=chromium --project=webkit` دو از دو. Scoped ESLint، Node syntax و TypeScript در اجرای پیش از آخرین گسترش موفق بودند؛ هماهنگ‌کننده باید check نهایی را تکرار کند.

اجرای مستقل یکپارچهٔ QA پس از توسعهٔ native OTP/recovery: `pnpm test` پنج فایل و **۶۱ از ۶۱** موفق، ۹۸٫۶۲s. پس از افزودن قرارداد جمع مالی گزارش، shared suite به **۴۴ از ۴۴** رسید: جمع دو سفارش معتبر می‌تواند از سقف هر سفارش بزرگ‌تر شود، precision بزرگ‌تر از 2^53 حفظ می‌شود و سقف هر سفارش تغییر نمی‌کند. بررسی scoped ESLint آخرین فایل‌های QA موفق و TypeScript سراسری در اجرای بعد از اصلاحات UI موفق بود. در آن بازبینی، T17 و upload واقعی UI هنوز منتظر build بودند؛ اجرای بعدی آن‌ها در بند زیر ثبت شده است.

بازآزمایی production build جاری پس از اصلاح overflow و تکمیل UI/رسانه: `E2E_CHROMIUM_CHANNEL=chrome pnpm test:e2e --project=chromium --project=webkit` **۴ از ۴ موفق، حدود یک دقیقه**. Chrome full flow ۲۰٫۱s، public RTL ۲٫۸s؛ WebKit full flow ۳۰٫۵s، public RTL ۴٫۲s. این اجرا upload صحیح و شش رد فایل، خطای 503 و حفظ فرم، پرداخت unknown و سپس verify واقعی mock، مشتری دوم، مبلغ/stock/receipt/shipment/tracking، ۳۲۰px و axe را واقعاً بررسی کرد. تصاویر safe و browser-summary.json به‌روز شدند. Firefox با روش جدید دور زده نشد؛ gap آن باقی است.

یافتهٔ جاری QA-03: CSP enforce در کاتالوگ anonymous، `style-src-attr` برای inline `color:transparent` تصویرهای Next و اعلان مسیر framework ثبت شد؛ نقض script مشاهده نشد. شمار رخداد با hard navigation و client transition تفاوت داشت (Chrome ۲–۳، WebKit ۳–۶). عامل frontend در حال حذف style تصویر و coordinator در حال بررسی دو hash دقیق اعلان framework است؛ سیاست عمومی unsafe-inline فعال نشده و اصلاح هنوز باید روی build بعدی بازآزموده شود. csp-observations.json فقط پیام sanitize‌شده، directive، blocked inline، سبک ثابت و hash دارد.

traceهای خام، inbox و secret header هرگز در Git قرار نگرفته‌اند. تصاویر docs/qa/screenshots فقط پیش‌نویس کالای ساختگی در پنل، صفحات عمومی و سفارش QA پس از خرید را نشان می‌دهند. axe بخشی از دسترس‌پذیری را بررسی می‌کند و جایگزین screen reader، zoom حقیقی یا دستگاه واقعی نیست.
