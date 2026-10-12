# آزمون‌های واقعاً اجراشده

تازه‌ترین CI منبع `538ff1c`: [run38275593404](https://github.com/AmirMo10/Morphiume/actions/runs/38275593404)،۱۵۰/۱۵۰ واحد/DB و۱۷/۱۸ مرورگر Linux؛ تمام ورود/OTP/خرید قبول شدند. تنها Firefox public-rtl با document-title خالی در axe شکست خورد؛ route/علت ثبت نشده و image skipped است. اصلاح تازهٔ صرفاً QA، عنوان دقیق/HTTP200/diagnostics محدود را به آزمون اضافه می‌کند؛ هیچ قاعدهٔ axe حذف نشده است. probe خواندنی شش صفحهٔ واقعی Chrome/WebKit در21.972s، HTTP200/عنوان دقیق/axe0 داشت؛ API client کنترل‌شده بود. دو fixture دیررس بازیابی و دو عنوانِ همیشه خالی رد شدند. این، بازتولید Firefox اصلی نیست.

working tree بعدی: full تجارت۱۳۱/۱۳۱ در۱۵فایل،573.10s، صفر skip/error و fingerprint public ثابت؛ پس از آن فقط متن توقف پرداخت اصلاح شد. PUBLIC0010 در2.35s با checksum ثبت‌شده اعمال شد؛ هر۲۶جدول قدیمی ثابت و return_decision خالی بود. root گزارش مالی۴/۴PG در6.31s، واحد بازه/مبلغ۴/۴ در418ms و جلالی۳/۳ در353ms با۱۸۰ round-trip قبول شدند. آزمون جامع همین منبع در حال اجراست؛ build/مرورگر جدید، سرور، restore و بار همچنان نتیجه ندارند.

آخرین شواهد قبل از checkpoint تازهٔ fixture مشتری: CI منبع `3f999fd`،۱۵۰/۱۵۰ واحد/DB و۱۴/۱۸ مرورگر Linux؛ چهار شکست WebKit و image skipped. سه send429 مشاهده شدند؛ status مورد چهارم ثبت نشده است. اصلاح ادمین پذیرفته‌شده باعث تضعیف محدودیت نشد.

اصلاح صرفاً آزمون مشتری روی runtime منجمد48583: بازتولید بومی send429 با انتظار60.25s، حفظ فرم، send200، wrong-code400 و verify200 موفق شد. اجرای کامل Chrome/WebKit،۱۲/۱۲ در275.777459s؛۷۱ وضعیت امن، صفر skip/flaky/Playwrightretry. verify429 مشاهده‌شده با11.25s انتظار و خواندن کد جاری بدون resend به200 رسید. cleanup دقیق انجام شد. شرح و شاهد امن در `qa/CI_CUSTOMER_OTP_DIAGNOSTICS.md` است؛ Linux همین اصلاح هنوز اجرا نشده است.

منبع برنامهٔ بعدی هنوز build/مرورگر نشده: تجارت۱۰۵/۱۰۵ در۱۲فایل و397.50s در پنجرهٔ آرام DB؛ پس از delta مجوز۵۲/۵۲ درچهارفایل و300.03s جدا. اجرای قبلی هم‌زمان۱۰۵ assertion موفق داشت ولی دو fingerprint پس از suite به علت checkout مستقل تغییر کردند و exit1 بود؛ آن اجرا قبولی کامل گزارش نمی‌شود. root native config+presentation۱۰/۱۰ در35.76s؛ final presentation۵/۵ در16.01s و unit config۱۲/۱۲ در1.31s. fixture presentation grant کنترل‌شده دارد؛ ورود بومی همان هفت آزمون مستقل است. همهٔ نتایج به scope همان اجرای مشخص محدودند؛ استقرار/restore/بار هنوز نتیجه ندارند.

تاریخ: ۲۰۲۶-۱۰-۱۲. checkpoint پیشین `1a4fa4433d720b490ce222e8898cb09f73ba4abf` است. نسخهٔ یکپارچهٔ صفحه‌بندی/ارسال/مجوزها در این checkpoint با build24244/server48583 و مرورگر کامل پذیرفته شد؛ CI Linux و تصویر همان منبع هنوز نتیجه ندارند. شمارها مربوط به اجراهای مشخص‌اند و جمع نمی‌شوند. جدول پایین سابقهٔ اجرا را حفظ می‌کند؛ شواهد تازهٔ این بخش مقدم‌اند.

| اجرای تازه | نتیجهٔ واقعی |
|---|---|
| CI checkpoint76dfcd1 | [run38266486931](https://github.com/AmirMo10/Morphiume/actions/runs/38266486931)،۱۵۰/۱۵۰ در۱۵فایل؛ نصب/اسکن اسرار/migrations/seed/lint/types/audit/build موفق. مرورگر Linux۱۱موفق/هفت شکست در2.2min؛ image skipped، صفر تصویر پذیرفته‌شده |
| شکست مرورگر همان CI | gallery در Chromium/WebKit و full-purchase در Firefox در صفحهٔ ورود ماندند؛ inventory هر سه موتور heading MFA را نیافت؛ catalog Firefox renewal200 را به‌جای429 انتظار داشت.429 فقط برای مورد مشاهده‌شده قطعی است؛ تشخیص سایر شکست‌ها و helperهای fixture جاری است |
| اصلاح fixture ورود بومی | روی runtime منجمد48583، سه ورود معتبر200 و ورود UI بعدی429/X-Retry-After10، نبود headingMFA را بازتولید کردند؛ انتظار10.25s و ورود بومی200 آن را بازیابی کرد. چهار حساب مصنوعی غیرفعال/session0؛ این مکانیزم، علت همهٔ شکست‌های قبلی Linux را ثابت نمی‌کند |
| مرورگر helper اصلاح‌شده |۱۲/۱۲ محلی در272.984489s با صفر skipped/flaky/Playwrightretry؛۴۶diagnostic فقط stage/category/status/interval، دو429 مشاهده‌شده در enrollment/renewal پس از۸.25/۳.25s و TOTP تازه به200 رسیدند. محدودیت/IP/limiter/runtime تغییر نکرد؛ نتیجهٔ Linux تا اجرای همان checkpoint pending |
| CI منبع1a4fa44 | [run38248764072](https://github.com/AmirMo10/Morphiume/actions/runs/38248764072)، verify موفق:۹۷آزمون در۸فایل و۹مورد Chromium/Firefox/WebKit Linux؛ build/lint/types/audit/Gitleaks موفق |
| image همان CI | build بدون secret و native musl WebP موفق؛ Grype نه High در OpenSSL/zlib ثبت کرد؛ publication/deployment اجرا نشد |
| بک‌اند نسخهٔ جاری | full58/58 در۸فایل،168.49s، پیش از آخرین recheck قفل مجوز؛ پس از آن targeted8/8 bulk در32.94s؛ full59 ادعا نمی‌شود |
| تنظیمات ارسال | native-MFA/DB پنج از پنج،8.86s؛ تبدیل دقیق، نسخه/مجوز، قفل ردیف غایب و انقضای proof حین انتظار واقعی advisory lock |
| بازهٔ قیمت | pagination18/18 در28.95s، شامل چهار مورد تازه؛ حدود inclusive صفر/سقف، ارقام محلی، خطای محدوده و جلوگیری از ترکیب قیمت/حجم/موجودی تنوع‌های متفاوت؛ اجرا پس از suite125 بود |
| مجوز تنظیمات/نقش | native-MFA دو از دو در7.85s؛ proof منقضی پس از قفل حساب هدف و نقش لغوشده پس از انتظار تنظیمات، بدون اثر |
| invariant ارسال/refund | delivered→shipped در baseline واقعاً بازتولید شد (یک fail/هشت skip،8.11s)؛ پس از اصلاح،۱۳/۱۳ در84.40s؛ سپس شرط فعال‌بودن MFA و fixture معتبر افزوده و۱۴/۱۴ در91.29s قبول شد. fixture دامنه grant کنترل‌شده دارد و ورود بومی محسوب نمی‌شود؛ issuance بومی در root/QA جدا آزموده شده است |
| full owned regression نهایی | ۷۳/۷۳ در۹فایل،259.92s، بدون skip؛۸واحد/۶۵PG؛ شامل ارسال/refund/عامل فعال و tick/sweep روی schema مهاجرت‌یافتهٔ جدا. fingerprint صف/رزرو public ثابت و cleanup دقیق موفق؛۱۵dead اصلی بدون تغییر. پس از آن guard پیش از connection با۹/۹ در357ms قبول شد؛ branch ساخت role محدود CI تا اجرای واقعی pending |
| native config پس از delta | root config suite هفت از هفت در۲فایل،21.05s، موفق؛ helper فقط429 مشاهده‌شده را با interval واقعی یا rule10s plugin1.7.7 رعایت می‌کند |
| مرورگر کامل build نهایی |۱۲/۱۲ در Chrome154.0.8037.93/WebKit27.2،272.570747s؛ expected12/unexpected0/skipped0/flaky0/retries0. شش spec روی production24244/server48583؛ خرید بومی/پرداخت mock، گالری/موجودی/صفحه‌بندی/ارسال و guard تازهٔ mutation واقعاً اجرا شدند. fulfillment GET/PATCH/replay بدون مبلغ و event مالی؛ CSV سفارش مجاز با پنج ستون غیرمالی/private no-store، CSV محصول و receipt403؛ stock6→5/receipt1/shipment1 |
| صف پیش از استقرار | snapshot14:13:57UTC:708completed/315pending/15dead؛ deadها همه payment.reconcile با۱۲تلاش،۹«payment in progress» و۶«create result unknown» و حساب‌های disabled@fixture.invalid. lineage آزمایشی تأیید شد، نه tick ایجادکنندهٔ هر retry. هیچ replay/تغییرstatus انجام نشد؛ snapshot شناسه‌ها خصوصی است |
| fixture limiter | اجرای اولیهٔ جامع115pass/4skip/1failed suite به‌علت429 ورود fixture؛ fixture اکنون X-Retry-After واقعی را رعایت می‌کند. auth+shipping9/9 قبول شد؛ limiter حذف یا تضعیف نشد |
| build یکپارچه | Next production، worker/migration/seed bundle، closure530فایل و encoder واقعی Windows WebP موفق؛ هیچ secret در build تولید نشد |
| component harness | Chromium با اجزای واقعی و API/router fixture: صفحه‌بندی/فیلتر/نشانی/ارسال/علاقه‌مندی/تعویض حساب موفق؛ جای DB/MFA/E2E واقعی نیست |
| delta UI/metadata | build96791 موفق؛ robots/sitemap دینامیک شدند، Windows WebP موفق؛ harness بازهٔ قیمت/خطای400/scroll region با axe و SSR ورود با delayed JavaScript موفق؛ علت شکست قبلی WebKit هنوز اثبات نشده |
| مرورگر source83122 | اجرای دوم۱۲مورد:۱۰موفق/دو locator قدیمی موجودی؛ سپس Chrome موجودی26.2s و WebKit35.6s موفق. پوشش هر شش سناریو در هر دو موتور قبول شد، نه یک اجرای واحد۱۲/۱۲. native429 با انتظار واقعی۱۰s و کد تازه رعایت شد؛ limiter تغییر نکرد |
| تصویر T25 | در دو موتور، img.decode/naturalWidth16/naturalHeight20 و HTTP200 تصویر مصنوعی آبی پیش از screenshot تأیید شدند؛ عکس واقعی کالا نیست |
| zoom بومی۲۰۰٪ | Chrome154.0.8037.93 headless، چهار HTTP200 route محصولات/حساب/ورودمدیر/راهنما؛ profile جدید و preference بومی، outer/screen ثابت، inner764×485→382×242 و DPR1→2، CSSzoom1/visualViewport.scale1؛ overflow صفر، Tab موفق و WCAG axe صفر؛ شواهد native-zoom-observations.json. آزمون دستی GUI/device/screenreader نیست |
| زیرساخت | guard mount، پایش DB-only و هشدار غیبت با expect-app، syntax/Compose/systemd و metrics15s smoke موفق؛ timer نصب و restore کامل انجام نشده |
| مجوز وابستگی | snapshot29وابستگی مستقیم از metadata نسخهٔ نصب‌شده با منبع/SHA؛ transitive/OS به SBOM تصویر وابسته است |

اجرای جامع۱۲۵/۱۲۵ در۱۲فایل،199.75s، exit0 پس از recheck قفل bulk انجام شد؛ lint و TypeScript سراسری نیز exit0. تغییرات بعدی با آزمون‌های هدفمند جدا در جدول ثبت شده‌اند. هر شش spec مرورگر source83122 در دو موتور، از اجرای کامل و بازاجرا، پذیرفته شد. zoom بومی headless جدا تأیید شد؛ CI Linux و reflow جای دستگاه یا آزمون دستی صفحه‌خوان نیستند.

اجرای نخست مرورگر ویژگی‌های جدید:۱۲مورد در Chrome/WebKit، چهار موفق و هشت شکست. نقص واقعی scrollable-region-focusable جدول سفارش رفع و در harness قبول شد؛ locatorهای قدیمی متن و واحد SQL cleanup5seconds به5s اصلاح شدند. policy تنها با تشخیص نویسندهٔ fixture و snapshot خصوصی اولیه برگردانده شد. مجموعهٔ کامل روی build تازه در حال بازاجراست. نتیجهٔ suite125 به تغییرات بعدی قیمت/مجوز/رابط تعمیم داده نمی‌شود؛ شمارهای هدفمند بالا مستقل ثبت شده‌اند و CI بعدی suite کامل همان commit را اجرا خواهد کرد.

آزمون‌های قدیمی commerce، tick و sweep جهانی را روی DB مشترک اجرا می‌کردند؛ انتقال به schema تولیدشدهٔ جدا با migration/constraints اصلی و runtime DML مستقل اکنون در full73 قبول شد. claim/sweep زمان اجرا تغییر یا فیلتر نشدند. schema/role موقت CI فقط با guardهای محیط و شناسهٔ این اجرای آزمون ایجاد/پاک می‌شوند؛ شاخهٔ ساخت role در CI هنوز نتیجه ندارد. build24244، lint سراسری و WebP واقعی موفق شدند. دو اجرای نخست build نهایی هرکدام۱۰موفق/دو شکست داشتند: اول assertion اشتباه `.irr` به‌جای قرارداد `.amountIrr`، سپس انتظار نادرست403 برای CSV غیرمالی مجاز نقش انبار. این خطاهای آزمون اصلاح شدند؛ خروجی‌های امن قبلی حفظ شدند و سومین اجرای کامل۱۲/۱۲ قبول شد. منبع برنامه در این سه اجرا ثابت بود؛ نتیجهٔ ترکیبی جای اجرای کامل گزارش نمی‌شود.

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

موارد اجرا نشده: Firefox Windows/دستگاه واقعی/صفحه‌خوان دستی، پوشش همهٔ ترکیب‌های ماتریس پنل، بررسی مستقل امنیت کامل/ASVS، PSP/SMS واقعی و sandbox حساب، CDN/network ایران، restore کامل، alert/offsite و اندازه‌گیری۲۰۰VU/RPS. بخشی از پنل، هزینه/رضایت خرید، مرجوعی/بازپرداخت، نقش انبار و CSV اکنون در دو موتور آزموده شدند. قابلیت‌های مستقلِ هنوز تکمیل‌نشده در IMPLEMENTATION_PLAN ثبت‌اند و نبود دادهٔ کسب‌وکار جایگزین نقص پیاده‌سازی نیست.
