# شواهد پذیرش T01–T30

این ماتریس وضعیت واقعی تا ۲۰۲۶-۱۰-۱۲ را ثبت می‌کند. آزمون‌های QA روی source درحال‌کار پس از commit فاز صفر `b01c09f` اجرا شده‌اند؛ build مرورگر Windows production بوده و DB آزمایشی از SSH tunnel متصل است. نتیجهٔ build نهایی و Git نهایی باید توسط هماهنگ‌کننده در TEST_REPORT ثبت شود. «جزئی» یعنی کل سناریو ثابت نشده است؛ این جدول گواهی ASVS، ظرفیت یا انتشار واقعی نیست.

| سناریو | شواهد موجود | وضعیت |
|---|---|---|
| T01 | Chromium/Google Chrome و WebKit: انتخاب حجم، اضافه‌کردن و ماندگاری سبد پس از reload | اجرا و موفق تا مسیر T25؛ Firefox اجرا نشد |
| T02 | ۳۵ unit مستقل پول/ورودی شامل هشت قالب شمارهٔ برابر؛ handler بومی ورود دوباره همان شماره فقط یک identity می‌سازد | بخش ورودی و identity اجرا و موفق |
| T03 | PG واقعی: انقضا، مصرف مجدد، دو verify هم‌زمان و بودجهٔ تلاش پس از resend؛ دو handler بومی هم‌زمان فقط یک سشن صادر کردند | اجرا و موفق |
| T04 | دادهٔ MFA واقعی در QA تنها پس از TOTP grant گرفت؛ کنترل دامنه در integration بک‌اند گزارش شده | اجرا در لایه‌های ذکرشده؛ آزمون HTTP همهٔ عملیات باقی است |
| T05 | HTTP سفارش بدون ورود 401؛ سپس مشتری دوم با OTP و cookie واقعی وارد شد و همان سفارش 404 گرفت؛ مالکیت نشانی در suite بک‌اند | سفارش HTTP اجرا و موفق؛ invoice و پیوست همهٔ مسیرها هنوز ثابت نشده |
| T06 | دعوت و لغو واقعی fulfillment در UI؛ enrollment و renew بومی TOTP؛ variants/bulk/dryrun/commit/replay بدون پول؛ قیمت403؛ GET و PATCH×2 رهگیری بدون مبلغ/refund/event مالی؛ product CSV و receipt403 و statusCSV پنج‌ستونی مجاز؛ پس از لغو UI سشن صفر و درخواست قبلی401/403 | Chrome/WebKit در اجرای کامل build24244 قبول |
| T07 | unit حد مالی و مقدار اعشاری/منفی/overflow؛ suite مالی سرور | جزئی؛ ماتریس tamper تمام APIها هنوز باقی است |
| T08 | رقابت موجودی آخر در PG واقعی، suite مستقل integration بک‌اند | شواهد backend/CHECKS؛ اجرای هماهنگ QA نهایی درج شود |
| T09 | یک idempotency checkout همان سفارش را برمی‌گرداند | شواهد suite بک‌اند |
| T10 | status مرورگر اثبات پرداخت نیست؛ verify پیش از mock موفق paid نمی‌شود | شواهد suite بک‌اند |
| T11 | verify تکراری و distinct receipts با یک shipment | شواهد suite بک‌اند |
| T12 | unknown create حفظ می‌شود؛ مرورگر نتیجهٔ نامشخص کنترل‌شده را دید، stock هنوز 3/reserved1 بود و همان تلاش بعداً موفق شد | دو موتور اجرا و موفق؛ اختلال واقعی PSP اجرا نشده |
| T13 | پرداخت دیرهنگام پس از اتمام موجودی به exception ثبت می‌شود | شواهد suite بک‌اند |
| T14 | amount mismatch و adapter contract | جزئی؛ ترکیب تمام merchant/currency/orderهای نامنطبق اجرا نشده |
| T15 | بودجهٔ refund دو درخواست هم‌زمان؛ UI بازپرداخت جزئی۱۲۳۴۵تومان روی receipt واقعی mock و complete تکراری یک refund۱۲۳۴۵۰IRR نگه داشت | شواهد backend و Chrome/WebKit؛ PSP بازپرداخت واقعی اجرا نشده |
| T16 | lease منقضی outbox دوباره پردازش می‌شود و اثر دوباره ندارد | شواهد suite بک‌اند؛ restart کانتینر هنوز جداست |
| T17 | API و filepicker واقعی: PNG به WebP، fetch عمومی، اصل خصوصی 404؛ malformed/MIME ناهماهنگ/SVG/6001px/>20MP/>4MiB رد شد؛ anonymous 401 | دو موتور اجرا و موفق در دامنهٔ موارد ثبت‌شده |
| T18 | HTTP سفارش owned `private,no-store`؛ همان URL برای anonymous رد شد | جزئی؛ CDN و cache واقعی راه‌اندازی نشده |
| T19 | اولین ارسال OTP با پاسخ 503 کنترل‌شده مواجه شد؛ phone و address draft حفظ شدند و ارسال بعدی بومی موفق شد | دو موتور اجرا و موفق؛ outage واقعی provider آزموده نشده |
| T20 | صفحات عمومی/product/order و راهنما در۳۲۰px، keyboard/reduced-motion/axe WCAG دو موتور؛ Chrome native۲۰۰٪ با ترجیح پروفایل تازه و viewport:null، هندسهٔ فیزیکی ثابت، چهار route HTTP200/بدون overflow/Tab/WCAG0 | دامنهٔ ذکرشده قبول؛ zoom دستی GUI، screenreader و دستگاه حقیقی باقی‌اند |
| T21 | کاربر QA مدیر در UI بدون SQL محصول ساخت، پیش‌نمایش دید و منتشر کرد | دو موتور اجرا و موفق؛ SQL فقط حساب fixture را آماده کرد |
| T22 | DevOps برنامهٔ restore جدا دارد | rehearsal و پرداخت پس از restore هنوز اجرا نشده |
| T23 | نمایش ۱۲۳٬۴۵۶ تومان، DB snapshot دقیق ۱۲۳۴۵۶۰ IRR، receipt/stock واقعی | دو موتور اجرا و موفق |
| T24 | fail-closed live configuration و seed فقط test/staging | بررسی coordinator؛ artifact/live واقعی فعال نشده |
| T25 | دو موتور از admin MFA تا filepicker/product/guest/OTP/quote/mock/receipt1/shipment1/stock3→2/tracking و ۳۲۰px | build جاری دوباره اجرا و موفق؛ Firefox هنوز engine gap |
| T26 | دریافت دوم distinct و یک shipment؛ refund دریافت extra | شواهد suite بک‌اند |
| T27 | آخرین ظرفیت کوپن و retry همان سفارش | شواهد suite بک‌اند |
| T28 | stale product expectedVersion رد می‌شود | شواهد suite بک‌اند |
| T29 | مالکیت/eligibility/cancellation در backend؛ Chrome/WebKit پس از shipment delivered، customer returnHTTP و approve/quality restock دوباره، فقط یک ledger و stock3→4 | دامنهٔ ذکرشده قبول؛ همهٔ رابط‌های مرجوعی یکجا اجرا نشده‌اند |
| T30 | actor/payload binding idempotency | شواهد suite بک‌اند |

محدودیت موتور محلی: دانلود Chromium bundle از CDN پاسخ 403 محدودیت منطقه داشت؛ Google Chrome نصب‌شده **154.0.8037.93** برای موتور Chromium به کار رفت و نسخه با `browser.version()` واقعی خوانده شد. Firefox رسمی ۱۵۷ دانلود شد ولی Windows قبل از شروع browser با `spawn UNKNOWN` رد کرد؛ علت نهایی ثابت نشده است. WebKit **27.2** اجرا شد و نسخه با همان API خوانده شد. این شواهد دستگاه واقعی iOS/Android نیستند. هماهنگ‌کننده بعداً موفقیت واقعی job Linux هر سه موتور را در [CI run 38242058151](https://github.com/AmirMo10/Morphiume/actions/runs/38242058151) / job `114786824976` برای source `7f403a9834aee3f392d182d58f37b1ee12cb56a0` مشاهده کرد؛ شمار دقیق/نسخه‌های آن در TEST_REPORT هماهنگ‌کننده ثبت می‌شوند. شکست launcher محلی Firefox همچنان به‌عنوان محدودیت محیط محلی باقی است.

خطای واقعی QA-01: BetterAuth ۱٫۷٫۷ هنگام آغاز handler به `rateLimit.id` نیاز داشت. migration 0004 و schema توسط عامل بک‌اند اصلاح شد؛ پس از اصلاح پنج integration مستقل auth موفق شدند. آزمون native MFA با TOTP واقعی و recovery code بومی اجرا شد و استفادهٔ مجدد recovery code رد شد. حذف role دسترسی را بلافاصله رد کرد.

خطای واقعی QA-02: order page در هر دو موتور در عرض ۳۲۰، scrollWidth ۳۴۱ داشت؛ grid فرزند min-content عرض حدود ۳۲۴٫۵۶ داشت. frontend با `min-inline-size:0` و mobile `minmax(0,1fr)` اصلاح کرد؛ پس از build واقعی، شرط scrollWidth<=clientWidth در هر دو موتور موفق شد.

دستورهای واقعی اجرا: `pnpm exec vitest run tests/unit/shared tests/integration/auth` (اجرای اول ۳۷/۳۹، پس از اصلاح ۳۹/۳۹؛ سپس گسترش native handler/recovery، auth پنج از پنج). `E2E_CHROMIUM_CHANNEL=chrome pnpm test:e2e` (اجرای کامل اول/دوم سه fail: دو موتور overflow انتهایی و Firefox launch). `pnpm test:e2e public-rtl.spec.ts --project=chromium --project=webkit` دو از دو. Scoped ESLint، Node syntax و TypeScript در اجرای پیش از آخرین گسترش موفق بودند؛ هماهنگ‌کننده باید check نهایی را تکرار کند.

اجرای مستقل یکپارچهٔ QA پس از توسعهٔ native OTP/recovery: `pnpm test` پنج فایل و **۶۱ از ۶۱** موفق، ۹۸٫۶۲s. پس از افزودن قرارداد جمع مالی گزارش، shared suite به **۴۴ از ۴۴** رسید: جمع دو سفارش معتبر می‌تواند از سقف هر سفارش بزرگ‌تر شود، precision بزرگ‌تر از 2^53 حفظ می‌شود و سقف هر سفارش تغییر نمی‌کند. بررسی scoped ESLint آخرین فایل‌های QA موفق و TypeScript سراسری در اجرای بعد از اصلاحات UI موفق بود. در آن بازبینی، T17 و upload واقعی UI هنوز منتظر build بودند؛ اجرای بعدی آن‌ها در بند زیر ثبت شده است.

بازآزمایی production build جاری پس از اصلاح overflow و تکمیل UI/رسانه: `E2E_CHROMIUM_CHANNEL=chrome pnpm test:e2e --project=chromium --project=webkit` **۴ از ۴ موفق، حدود یک دقیقه**. Chrome full flow ۲۰٫۱s، public RTL ۲٫۸s؛ WebKit full flow ۳۰٫۵s، public RTL ۴٫۲s. این اجرا upload صحیح و شش رد فایل، خطای 503 و حفظ فرم، پرداخت unknown و سپس verify واقعی mock، مشتری دوم، مبلغ/stock/receipt/shipment/tracking، ۳۲۰px و axe را واقعاً بررسی کرد. تصاویر safe و browser-summary.json به‌روز شدند. Firefox با روش جدید دور زده نشد؛ gap آن باقی است.

QA-03 و نتیجهٔ تشخیص: inline `color:transparent` تصویرهای Next حذف شد؛ فقط دو hash دقیق style ثابت اعلان مسیر همراه nonceهای script/style-element مجازند و unsafe-inline عمومی فعال نیست. بازآزمایی build واقعی Chrome کاتالوگ صفر نقض داشت؛ در هر دو موتور اعلان مسیر absolute و ۱px×۱px، border صفر و overflow hidden بود، دو style ثابت مجاز شدند و style دلخواه بی‌خطر واقعاً مسدود شد. آخرین چهار آزمون مثبت مجدداً موفق بودند (Chrome full ۲۴٫۰s/public ۲٫۹s، WebKit full ۳۳٫۵s/public ۵٫۳s).

یک warning باقیماندهٔ **WebKit 27.2 Windows** دقیقاً به native `<select>` محدود شد: همان CSP واقعی و HTML حداقلی فقط با select/option، بدون JavaScript، stylesheet، تصویر یا inline style، یک `style-src-attr` event با source/sample خالی تولید کرد. checkbox، button، search با placeholder و HTML خالی با همان header صفر بودند؛ حذف تمام کنترل‌ها از HTML کامل، warning را حذف کرد. CSS/تصویر/SVG یا Next اعلان علت نبودند. این نتیجه رفتار مشاهده‌شدهٔ موتور Windows است، نه ادعای دستگاه Safari/iOS واقعی. سیاست به دلیل warning شل نشد و hash حدسی برای style خالی افزوده نشد. csp-observations.json داده‌های sanitize‌شده و repro حداقلی را نگه می‌دارد.

کنترل مستقل native sort روی build جاری: `pnpm test:e2e public-rtl.spec.ts --project=chromium --project=webkit` **۲ از ۲ موفق، ۱۰٫۴s** (Chrome ۳٫۱s، WebKit ۵٫۰s)، شامل انتخاب `price_asc` و `price_desc` و حفظ selected value سپس سه صفحهٔ RTL/axe. آزمون اول به علت locator دقیق getByLabel روی label حاوی optionها timeout داد؛ locator به combobox با نام دسترس‌پذیر واقعی تغییر کرد و بدون تغییر برنامه قبول شد. warning native select باعث شکست کنترل مقدار یا جریان خرید نشده است.

traceهای خام، inbox و secret header هرگز در Git قرار نگرفته‌اند. تصاویر docs/qa/screenshots فقط پیش‌نویس کالای ساختگی در پنل، صفحات عمومی و سفارش QA پس از خرید را نشان می‌دهند. axe بخشی از دسترس‌پذیری را بررسی می‌کند و جایگزین screen reader، zoom حقیقی یا دستگاه واقعی نیست.

بازآزمایی standalone بعد از تکمیل گالری و بسته‌بندی native Sharp: ابتدا native sign-in پاسخ JSON معتبر 200 داشت ولی `/api/admin/session` و `/api/cart` پاسخ 500 غیر JSON دادند. هماهنگ‌کننده DLLهای مجاور Sharp را به closure اضافه کرد و server را دوباره راه انداخت. سپس چهار آزمون قبلی موفق شدند: Chrome خرید کامل ۲۷٫۳s و public ۳٫۹s؛ WebKit خرید کامل ۴۱٫۹s و public ۵٫۸s. این نتیجه برای standalone محلی است؛ اجرای image Linux جاری هنوز باید در CI اثبات شود.

آزمون مستقل `gallery.spec.ts` در هر دو موتور موفق شد، **۲ از ۲، ۳۸٫۱s** (Chrome ۱۱٫۶s، WebKit ۲۳٫۱s): سه upload واقعی، توضیح مستقل، اتصال تصویر به SKU، جابه‌جایی و حذف، save و reload با بررسی FK/ترتیب واقعی PG؛ دو thumbnail با `aria-pressed`، حذف تصویر مخصوص ۵۰ml از نمایش حجم ۱۰۰ml، RTL۳۲۰ و axe بدون violation. خالی‌کردن گالری published رد شد و DB قبلی حفظ شد؛ بایگانی، name/description و گالری ذخیره‌نشده را حفظ کرد و save بعدی واقعاً archived/empty شد؛ public API بعد از بایگانی 404 داد. شکست اولیهٔ این آزمون فقط query اشتباه QA برای ستون `variant_sku` بود؛ query به join روی `variant_id` اصلاح شد و بدون تغییر محصول قبول شد. آخرین browser-summary.json مربوط به همین اجرای متمرکز است؛ چهار قبلی در این بند ثبت‌اند.

دادهٔ پیشنهاد نشانی: source پیشین type=city شش شهر اصلی را نداشت؛ source به snapshot صریح شهر/استان با commit ثابت تغییر کرد. فایل‌های واقعی upstream شهر، استان و MIT مستقل دریافت شدند؛ SHA256 آن‌ها با manifest برابر بود و برای تمام ۳۱ استان/۱۱۱۹ شهر، صفر اختلاف رابطهٔ ID/name دیده شد. suite مستقل `iran-locations.test.ts` **۱۲ از ۱۲ موفق**: hash بایت خروجی/مجوز و source ثابت، ID یکتا، سه «سردشت» با استان‌های متفاوت، شش شهر اصلی، ورودی Arabic y/k و NFC، استان ناشناخته و آرایهٔ پیشنهاد مستقل. این آزمون پوشش جاری تقسیمات رسمی یا حمل واقعی را ثابت نمی‌کند. scoped lint و TypeScript سراسری پس از این تغییرات موفق بودند. قرارداد بازبینی image در `docs/qa/RUNTIME_IMAGE_REVIEW.md` ثبت شد.

سابقهٔ شش spec روی production build `96791`/server`83122` پس از source`1a4fa44`: اجرای جامع **۱۰قبول/۲شکست در۲۵۳٫۹s**، سپس دو سناریوی موجودی هرکدام در موتور مربوط واقعاً قبول شدند. شکست locator قدیمی preview و پاسخ بومی429 هنگام enrollment/renew در گزارش نگه‌داری شده‌اند؛ helper فقط پس از429 بازهٔ ده‌ثانیه‌ای واقعی را صبر می‌کند و TOTP تازه می‌فرستد. آن مرحله پذیرش ترکیبیِ اجراها بود. جزئیات cleanup، CSV با proof قدیمی403 سپس renew بومی200،۳۰۵محصول/۱۲۵سفارش، بازهٔ قیمت همان حجم، دو409ارسال و consent دوباره، coupon/return/refund و zoom در [INTEGRATION_QA.md](INTEGRATION_QA.md) و خلاصه‌های امن ثبت‌اند. T25 این بار PNG مصنوعی آبی۱۶×۲۰ داشت و decode/natural dimensions/HTTP200 پیش از تصویر ثبت شدند.

نتیجهٔ جاری source منجمد، build `24244` و server `48583`: **۱۲ از ۱۲ موفق در۲۷۲٫۵۷۰۷۴۷ثانیه، skipped/flaky/retries صفر**، اجرای کامل Chrome/WebKit با همهٔ شش spec و افزونهٔ خرید/رهگیری fulfillment. GET و mutation تکراری رهگیری، اطلاعات پول/refund/event مالی را پنهان کردند؛ CSV وضعیت با پنج ستون غیرمالی مجاز و CSV محصول/رسید403 بودند. stock6→5/receipt1/shipment1 و لغو UI/session0 واقعاً بررسی شدند. دو اجرای قبلی همین build هرکدام۱۰/۲ بودند و فقط دو فرض QA غلط داشتند: نام `irr` به‌جای `amountIrr` و ممنوعیت نادرست statusCSV؛ خروجی‌ها محفوظ و قرارداد اصلاح شد. هیچ تغییر محصول برای قبول آن فرض‌ها انجام نشد. `browser-summary.json` دقیقاً همین اجرای کامل موفق است؛ scoped ESLint و TypeScript سراسری آخرین source نیز موفق بودند. این نتیجه ظرفیت، restore، Firefox محلی یا release تصویر Linux را ثابت نمی‌کند.
