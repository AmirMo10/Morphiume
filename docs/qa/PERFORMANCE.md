# آزمون ظرفیت قابل بازتولید

وضعیت: ابزار و سناریو آماده؛ بار واقعی هنوز اجرا نشده است. وجود harness ظرفیت ۲۰۰ خریدار را اثبات نمی‌کند. نتیجهٔ واقعی اجرای بعدی، نسخهٔ Git، تغییرات محلی و محدودیت‌ها باید به این فایل اضافه شود.

آماده‌ساز حساب‌ها اکنون در کد، محدودیت واقعی handler بومی را رعایت می‌کند: فقط پس از ۴۲۹ با Retry-After یا X-Retry-After عددی معتبرِ صفر تا ۶۰ ثانیه، یک بار تکرار مجاز است. بازخوانی کد فعلی برای تکرار تأیید پیامک تازه نمی‌فرستد. سقف مهندسی آماده‌سازی ۳۰ دقیقه است؛ اجرای واقعی ۲۰۰ حساب و این زمان هنوز اندازه‌گیری نشده‌اند. شرح دقیق پیشرفت خصوصی، توقف ناقص و ۲۵ آزمون مستقلِ واقعاً انجام‌شده در [LOAD_FIXTURE_PREPARATION.md](LOAD_FIXTURE_PREPARATION.md) آمده است.

شاهد اجرای مستقل collector، ۲۰۲۶-۱۰-۱۲ ساعت 11:43:56 UTC: `node tests/load/collect-metrics.mjs --duration=15` موفق و یک sample واقعی از سرور گرفت. فقط کانتینر DB حاضر بود: CPU=0.05%، memory=42.37MiB/1.25GiB؛ app/worker هنوز راه‌اندازی نشده بودند. PG یک اتصال active و یک lock relation granted نشان داد؛ outbox از آزمون‌های قبلی ۹۱ pending با سن بیشینهٔ ۵۸۲۱ ثانیه داشت. این **baseline قبل از load** است، نه ظرفیت یا سلامت worker. JSONL زیر test-results/load نادیده‌گرفته‌شده ذخیره شد و query/PII/secrets ندارد.

گام بعد پس از تصویر معتبر staging و تأیید هماهنگ‌کننده: T25 واقعی روی SSH tunnel3100 با flag `QA_RETAIN_RESTORE_FIXTURE=1` و کنترل‌کلید واقعی staging؛ سپس fixture خصوصی `.local/restore-acceptance.json` شامل customer phone/order/product/media SHA برای عملیات restore اختصاصی به عامل Ops تحویل می‌شود. media این fixture باید واقعاً روی سرور ایجاد شود؛ media مربوط به تست Windowslocalhost3000 روی دیسک سرور نیست. بعد از آن، prepare200accounts/products، smoke دو VU، ۲۰ دقیقه plateau200، RPS مستقل، collector و ledger validation اجرا می‌شوند. هیچ‌کدام هنوز اجراشده معرفی نمی‌شوند.

سناریوی بستهٔ `vu`: افزایش از صفر به ۵۰ در یک دقیقه، سپس ۲۰۰ در دو دقیقه، **۲۰ دقیقهٔ کامل** بار پایدار و دو دقیقه کاهش. سفرها ۸۰٪ مرور، ۱۰٪ جست‌وجو، ۸٪ سبد و ۲٪ خرید با حدود ۱۵ ثانیه فاصلهٔ ناوبری هستند. خرید فقط کنترل‌شده و بدون انتقال پول است. ۲۰۰ حساب بومی BetterAuth در مرحلهٔ آماده‌سازی داده ساخته می‌شوند؛ این کار از handler واقعی کتابخانه و OTP واقعی آزمایشی در فرایند fixture استفاده می‌کند و اندازه‌گیری ظرفیت پیامک یا ورود HTTP محسوب نمی‌شود. هیچ محدودیت HTTP محیط اجرا خاموش یا تغییر داده نمی‌شود و IP جعلی ساخته نمی‌شود.

سناریوی `rps` مستقل است: arrival rate از ۱۰ به ۲۰، ۴۰، ۸۰ و ۱۲۰ درخواست در ثانیه می‌رود؛ هر iteration فقط یک درخواست کاتالوگ دارد. تعداد VU با RPS یکی نیست. سناریوی `smoke` دو VU، ۵۰ ثانیه و حداقل تلاش خرید اولیه برای هر VU دارد؛ این smoke نتیجهٔ ظرفیت نیست.

dataset آماده‌سازی شامل ۲۰۰ محصول منتشرشده و صریحاً مصنوعی با یک حجم و قیمت آزمایشی است. مرور بین این محصول‌ها پخش می‌شود؛ خرید روی یک SKU با ۱۰۰۰۰۰ واحد برای مشاهدهٔ رقابت روی رکورد موجودی متمرکز است. محصول‌های نمونه و مشتری‌های load بعد از اجرا بایگانی/غیرفعال می‌شوند؛ هیچ ادعای واقعی برای Morphiume ساخته نمی‌شود.

برای target جدا، فایل خصوصی staging-app و staging-connections را فقط در حافظه/محیط فرایند بارگذاری کنید؛ auth/control keyهای root local ممکن است با staging متفاوت باشند. DB در generator از tunnel localhost15433 و app از localhost3100 خوانده می‌شوند. پس از ایجاد اولین سشن native، fixture preparer همان cookie را واقعاً روی app target با get-session آزمایش می‌کند؛ در صورت ناهماهنگی کلیدها، آماده‌سازی با وضعیت ناقص و نیاز به تطبیق متوقف می‌شود. پاک‌سازی خودکار انجام نمی‌شود؛ هماهنگ‌کننده پس از بررسی نتیجهٔ عملیات‌های متعلق به همان fixture، فقط نمونه‌های خودش را بایگانی و حساب‌های مصنوعی خودش را غیرفعال می‌کند و تاریخچهٔ مالی را حفظ می‌کند.

هدف درخواست‌های داخلی: p95 خواندن زیر ۵۰۰ms، checkout زیر ۱۰۰۰ms و خطای غیرمنتظره زیر ۰٫۵٪. ۴۰۹ تجاری جدا شمرده می‌شود. معیارهای p50/p95/p99 و دریافت‌های آزمایشی در summary ذخیره می‌شوند. تست پرداختِ خارجی، پیامک واقعی، تصاویر، prefetch، cache گرم/سرد، صف worker، اشباع DB و RUM باید جدا گزارش شوند؛ harness فعلی آن‌ها را اثبات نمی‌کند.

نسخهٔ رسمی مشاهده‌شدهٔ k6 در ۲۰۲۶-۱۰-۱۲: **v2.3.0**، انتشار ۲۰۲۶-۰۹-۲۱. آرشیو Windows AMD64 از release رسمی دانلود و SHA256 آن با digest رسمی برابر بود:

`112276d495e5741c968e2bc09ea6196099c1275bd6db9ee0875d173c7148ce43`

باینری و فایل‌های سشن فقط در پوشهٔ نادیده‌گرفته‌شدهٔ `.local/` هستند. نه cookieها، نه OTP، نه password و نه trace خام را به Git یا artifact عمومی بفرستید. در Windows پوشهٔ fixture باید ACL محدود به حساب اجرا داشته باشد؛ در Unix مجوز 0700 پوشه و 0600 فایل. secrets از فایل خصوصی محیط خوانده می‌شوند و روی خط فرمان قرار نمی‌گیرند.

بررسی واقعی `k6 inspect --execution-requirements` با fixture بدون هیچ cookie و بدون اجرای setup، schema سناریوی vu را قبول کرد: maxVUs برابر ۲۰۰، بخش پایدار ۲۰ دقیقه و زمان کل با graceful timeout برابر ۲۵m۳۰s. نسخهٔ باینری واقعاً اجراشده `k6.exe v2.3.0 (commit/e088784614, go1.26.8, windows/amd64)` بود. این inspection فقط پیکربندی را آزموده است و درخواست بار به app ارسال نکرد.

```powershell
# محیط test/staging و DB همان محیط؛ generator روی میزبان دیگر
$env:LOAD_BASE_URL='http://localhost:3100' # SSH tunnel به staging؛ در گزارش ثبت شود
node --conditions=react-server --import tsx tests/load/prepare-fixture.ts
$env:K6_BIN=(Resolve-Path .local/k6/k6-v2.3.0-windows-amd64/k6.exe).Path
pnpm test:load --mode=smoke
# دستور زیر در ترمینال جدا، از generator اجرا شود؛ خروجی بدون query/PII است
node tests/load/collect-metrics.mjs --duration=2700
pnpm test:load --mode=vu
node --conditions=react-server --import tsx tests/load/validate-ledger.ts
pnpm test:load --mode=rps
node --conditions=react-server --import tsx tests/load/validate-ledger.ts --cleanup
```

قبل از اجرای load، بررسی native auth، T25 و migration باید موفق باشد. برنامهٔ هدف باید production build در `DEPLOYMENT_ENV=test|staging` باشد. generator، browser، build و توسعه جزو بودجهٔ production نیستند. سرور فعلی ۴ vCPU و حدود ۴٫۸GiB RAM دارد و زیر نامزد منابع سند برای ۲۰۰ VU است؛ هر اندازه‌گیری روی آن مشاهدهٔ همان میزبان است و ظرفیت پیشنهادی ۸ vCPU/۱۶GiB را اثبات نمی‌کند. مسیر SSH به هدف هزینهٔ اضافه دارد و باید در گزارش ثبت شود.

پس از هر اجرا، ledger واقعی PG با جمع رخدادهای موجودی مقایسه می‌شود و مبلغ سفارش، یک receipt اصلی و یک shipment برای هر تعهد بررسی می‌شود. نمونه‌های load پس از اندازه‌گیری بایگانی، حساب‌ها غیرفعال و سشن‌ها حذف می‌شوند؛ تاریخچهٔ مالی آزمایشی حفظ می‌شود.

جدول گزارش باید شامل منابع app/DB/worker و generator، CPU اشتراکی یا اختصاصی، commit، dataset، مدت پایدار واقعی، نوع cache، throughput، p50/p95/p99، RAM/CPU، DB pool/locks، صف outbox، محدودیت و نتیجهٔ ledger باشد. از `docker stats` و PG `pg_stat_activity`/`pg_locks` با خروجی فاقد query/PII استفاده کنید. alert، offsite backup، دو شبکهٔ موبایل و یک اینترنت ثابت داخل ایران و آزمون دستگاه حقیقی هنوز نتیجهٔ اجرا ندارند.

منابع رسمی: [k6 release v2.3.0](https://github.com/grafana/k6/releases/tag/v2.3.0)، [مدل باز و بسته](https://grafana.com/docs/k6/latest/using-k6/scenarios/concepts/open-vs-closed/)، [ramping VUs](https://grafana.com/docs/k6/latest/using-k6/scenarios/executors/ramping-vus/)، [ramping arrival rate](https://grafana.com/docs/k6/latest/using-k6/scenarios/executors/ramping-arrival-rate/). مشاهدهٔ ۲۰۲۶-۱۰-۱۲.
