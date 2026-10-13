# پیش‌نمایش خصوصی E4 روی IP — اجرای واقعی سه مرورگر

سه مسیر تازهٔ خرید T25 روی **`http://192.168.240.51`** در Chromium، Firefox و WebKit موفق شدند. دسترسی با CIDR محدود و Basic محافظت شد. Root پس از بررسی مالی و پاک‌سازی دقیق fixtureها، اقدام پذیرش را در **2026-10-13T11:17:04.540Z** با exit0 و حالت `private-preview-accepted` پایان داد. این پذیرش محیط خصوصیِ staging با providerهای mock است؛ انتشار عمومی، TLS یا فروش واقعی را تأیید نمی‌کند.

[e4-private-preview-safe.json](e4-private-preview-safe.json) شمارش‌ها، هویت‌ها، زمان‌ها و SHA256 شواهد را نگه می‌دارد. Basic، cookie، OTP، تماس مشتری و شناسه‌های خصوصی در گزارش نیامده‌اند. QA فقط فایل‌های ثبت‌شدهٔ Root را آفلاین بررسی کرد و برای این گزارش SQL، SSH، HTTP یا مرورگر تازه اجرا نکرد.

## برنامه، مسیر و نتیجهٔ مشاهده‌شده

برنامه `e4bed691dc938a9c0f79022696d24f063ad97724`، تصویر runtime با digest آغازین `3b78dc30` و Ops با digest آغازین `68bc527a` ثابت ماندند. پروفایل جدید مسیر IP، SHA256 **`a6988f3f27309c198e378e307ca856643686ae1c3fb49617bed9a770634e50ed`** دارد؛ پروفایل tunnel ظرفیت یا fixture قدیمی جایگزین آن نشد. هشت هویت کامل در JSON ثبت شده‌اند. runner native از commit جداگانهٔ `0e7fb648072633fd3dc2b0d99bc25b44f075e771` است؛ این commit ابزار، هویت برنامهٔ deployed نیست.

dispatch در **11:09:13.435726Z** شروع شد؛ reporter در11:09:15.096Z شروع و مشاهدهٔ اجرا در **11:10:13.446712Z** کامل شد. مدت child برابر**58.690645 ثانیه** و مدت reporter برابر**56.939897 ثانیه** است؛ این دو clock یکی نیستند.

| موتور | مدت case | نتیجه | checkهای ثبت‌شده |
| --- | ---: | --- | ---: |
| Chromium | 17.154s | موفق | ۱۰ از۱۰ |
| Firefox | 16.912s | موفق | ۱۰ از۱۰ |
| WebKit | 14.925s | موفق | ۱۰ از۱۰ |

مجموع **۳ موفق، صفر unexpected، skipped، flaky و test retry** بود. checkهای هر موتور، native login، MFA مدیر، cookies، CSRF، headers، perimeter، خرید تازهT25، مالکیت سفارش، dedup receipt/payment و hash رسانه را پوشش دادند. این checkها جای پذیرش تمام فروشگاه یا همهٔ استانداردهای امنیتی نیستند.

در هر موتور **۷ پاسخ۲۰۰ واقعی و یک پاسخ۴۰۰ واقعی برای OTP اشتباه** مشاهده شد؛ هیچ۴۲۹ واقعی وجود نداشت. یک۵۰۳ در هر موتور با `route.fulfill` برای خطای کنترل‌شدهٔ UI تولید شد: مجموع۲۴ پاسخ native واقعی و۳ پاسخ UI مصنوعی. این۵۰۳ها قطعی سرور، پیامک یا provider نیستند. هیچ retry یا انتظار rate-limit واقعی در این run لازم نشد.

proof منبع، **۷۲۱ فایل tracked، شش تغییر screenshot مجاز و صفر تغییر غیرمنتظره** ثبت کرد. reporter خام خصوصی، SHA256 `270b2b01ca1cb16164675c500b18d84643b4290a912dad41432b4ae81fc54a7d` دارد؛ export عمومی تنها enum، عدد و booleanهای مجاز را استخراج می‌کند.

## اثر مالی و پاک‌سازی دقیق

مقایسهٔ خواندنی مالی، **همهٔ۴۶۴۶ ردیف قبلی در۱۴ جدول** را بدون تغییر تأیید کرد؛ snapshot پس از اجرا۴۶۹۴ ردیف داشت. برابری همهٔ ردیف‌های همهٔ جدول‌های عمومی ادعا نشده است.

audit نهایی در **11:14:38.837Z**، سه سفارش paid تازه را با دقیقاً **۳ receipt اصلی، ۳ shipment، ۳ stock commit و۳ reservation مصرف‌شده** تطبیق داد. سه محصول fixture archived شدند؛ on-hand هرکدام۲ و reserved صفر بود. **۹ کاربر موقت disabled و sessionهایشان صفر** بودند. خریدار fixture نگه‌داری‌شدهٔ قبلی enabled و session اولیهٔ او بدون تغییر ماند. تاریخچهٔ order/payment/stock حفظ شد؛ cleanup عمومی یا reset limiter/queue انجام نشد.

دو attempt قبلیِ audit خواندنی با correlation ناموفق محفوظ ماندند: تبدیل clock در JSON و هم‌پوشانی پنجرهٔ±۲ ثانیه. اصلاح از مرزهای واقعی همان clock پایگاه بین ایجاد مدیر، سفارش و مشتری خارجی استفاده کرد. این اصلاح نوشتن، تغییر fixture یا تکرار native نداشت؛ شروط buyer، رسید، shipment، موجودی و session ضعیف نشدند. `privateCorrelations` از گزارش عمومی حذف شده است.

## گزارش سرور و پذیرش Root

capture wrapper برنامه از **11:08:35 تا11:11:57.762257Z** شامل**۳۵۵ خط/۶۶۵۱۳ بایت** بود؛ cap=false و wrapper500=0 ثبت شد. وضعیت‌های واقعی شامل200،201،303 و negative-caseهای400،401،403،404 بودند؛ ادعای «همهٔ پاسخ‌ها۲۰۰» مطرح نشده است. ۲۷ نمونهٔ خواندن p95 داخلی سرور6ms و max10ms داشتند. app/worker running و healthy بودند، OOM=false و restart=0. محدودیت retention عمومی Docker باقی است و این capture تاریخچهٔ خارج بازه را اثبات نمی‌کند.

فعال‌سازی Root در11:08:35.418Z با حالت `private-preview-ready-native-acceptance-pending` پایان یافت. موفقیت مرورگر در11:10:13 به‌تنهایی پذیرش operator نبود. پس از audit، رکورد پذیرش در11:16:50.750588Z آماده شد و **عمل accept در11:17:04.540Z** موفق پایان یافت؛ هر دو قبل از deadline **11:28:35.623391Z** هستند. SHA256 رکورد پذیرش `9beab7bb2de023204e0debe2313e834f49a4cc209e8b46a7f00abfd05147dbe9` است. ایجاد رکورد/transition سرور بر عهدهٔ Root بود.

## سابقهٔ lease و حدود شاهد

دو manager preflight در10:39:07 و10:45:39 با exit1 متوقف شدند و captureهایشان حفظ شد. preflight سوم در **11:02:09.944909Z** با exit0، حالت `actual-lease-missing-transition-refusal` و عدم تغییر app/proxy/profile را ثبت کرد. در این attempt، **بررسی منبع و manager واقعی موفق شدند و سپس درخواست مربوط به transition ثبت‌نشده به‌درستی رد شد**؛ expiry واقعی، withdrawal یا انقضای موفق lease آزموده نشد.

بررسی lease تولیدشده در11:09:11.234902Z، unit/timer ثابت، `EnvironmentFiles` خالیِ typed و timer فعال/enabled را بررسی کرد. service در این بررسی inactive بود و start نشده بود؛ تنها propertyهای static برای اعتبارسنجی command normalize شدند. هیچ آزمون واقعی انقضا از این شاهد استنباط نشده است.

پس از پذیرش، بررسی واقعی lease در **11:18:14.953804 تا11:18:29.195781Z** با exit0 و حالت `actual-accepted-preview-lease-no-op` پایان یافت: منبع و manager تأیید شدند و app/proxy/profile بدون تغییر ماندند. SHA256 شاهد کامل `1f47a7c4a3b3cc26b2e8f8d0cc3e1d3ffa283de967c84fba54567636e2537b04` است. این no-op واقعیِ حالت accepted بود؛ `expiredWithdrawalExercised=false` ماند. پنجره در **11:19:06.498Z** آزاد و کار schedules به مالک زیرساخت تحویل شد.

نتیجه، سه خرید native روی مسیر مستقیم IP خصوصی است. ظرفیت۲۰۰VU قبلاً روی tunnel SSH اندازه‌گیری شده و به مسیر private-IP منتقل نشده است. اثر کاربران ایران، provider واقعی، دسترسی عمومی، TLS و اشباع مسیر جدید به آزمون مستقل نیاز دارند. assertionهای خطا، مالی و privacy حفظ شدند و اطلاعات خصوصی در captureهای محافظت‌شده باقی ماندند.
