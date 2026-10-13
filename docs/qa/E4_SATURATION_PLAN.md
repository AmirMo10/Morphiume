# جست‌وجوی محدود اشباع کاتالوگ E4 — آماده، اجرا نشده

بخش۲۳ سند پروژه، آزمون مستقل RPS برای یافتن نقطهٔ اشباع می‌خواهد. اجرای قبلی فقط ramp تا هدف۱۲۰ را موفق گذراند؛ نقطهٔ اشباع را پیدا نکرد. این entry تازه، [catalog-saturation.js](../../tests/load/catalog-saturation.js)، **فقط برای dispatch بعدی Root آماده شده است**. هیچ درخواست واقعی، setup، fixture، SQL یا load برای این برنامه اجرا نشده است.

## هدف و دروازهٔ اجرا

هدف ثابت `http://192.168.240.51`، برنامهٔ پذیرفته‌شده `e4bed691dc938a9c0f79022696d24f063ad97724` و پروفایل عمومی SHA256 `a6988f3f27309c198e378e307ca856643686ae1c3fb49617bed9a770634e50ed` است. Root پیش از dispatch، هشت هویت deployed و همان CIDR/Basic پذیرفته‌شده را با readback واقعی bind کند؛ مقدار processenv به‌تنهایی هویت سرور را ثابت نمی‌کند. منبع این ابزار جدید جدا از commit برنامه و ابزار قبلی08176 ثبت و hash آن قبل از spawn کنترل شود.

فقط `GET /api/catalog/page?pageSize=24` در workload وجود دارد؛ setup دو GET واقعی health و catalog خواهد داشت. GET cart یا HTML سایت، auth/OTP، checkout، محصول‌سازی، callback و queue replay وجود ندارند. هیچ cookie مشتری یا کنترل-secret به k6 داده نمی‌شود. jar هر درخواست تازه است و پاسخِ دارای Set-Cookie، content-type نامعتبر یا status غیر۲۰۰ توقف ایجاد می‌کند؛ redirect دنبال نمی‌شود. Basic در header از processenv خصوصی ساخته می‌شود و در URL، argv، summary یا stdout قرار نمی‌گیرد.

runner موجود `scripts/run-load.mjs` و setup موجود `morphiume.js` به fixture۲۰۰ حساب/محصولِ کامل وابسته‌اند؛ fixture قبلی اکنون پاک‌سازی شده و نباید برای این follow-up احیا شود. entry تازه به SKUهای archived وابسته نیست. setup جدید فقط کاتالوگ واقعیِ غیرخالی و DTO صفحه۱/اندازه۲۴ را کنترل می‌کند و `catalog_total_items` را به‌صورت عدد ثبت می‌کند. dataset فعلی ممکن است از۲۰۰ محصول منتشرشدهٔ اجرای قبلی کوچک‌تر باشد؛ نتیجه فقط همان dataset را پوشش می‌دهد.

پس از آزادشدن پنجرهٔ schedules، Root باید وضعیت دقیق timer/unitهای تازه‌فعال‌شده را ثبت، فقط موارد رقیبِ مجاز را موقتاً suspend و در `finally` دقیقاً همان enabled/active state را restore و readback کند. app و worker معمولی فعال بمانند. build، backup/restore، نویسندهٔ fixture و مرورگر هم‌زمان مجاز نیستند. readiness، baseline خواندنی مالی/موجودی/صف، فضای خروجی و monitorهای generator/server قبل از k6 لازم‌اند؛ بار بدون monitor معتبر شروع نشود.

## برنامهٔ ثابت و بودجه

یک executor مستقل `ramping-arrival-rate`، شروع۶۰، واحد۱ ثانیه و **۴۰۰ preallocated/maxVU ثابت** دارد. هر iteration دقیقاً یک GET کاتالوگ است؛ sleep یا retry ندارد. Root این سقف‌های محدود را تأیید کرده است:

| plateau | ramp تا نرخ | بار ثابت | بازهٔ ثابت از شروع scenario |
| ---: | ---: | ---: | ---: |
| ۱۲۰RPS | ۱۵s | ۶۰s | 15–75s |
| ۲۴۰RPS | ۱۵s | ۶۰s | 90–150s |
| ۴۸۰RPS | ۱۵s | ۶۰s | 165–225s |
| ۹۶۰RPS | ۱۵s | ۶۰s | 240–300s |
| ۱۹۲۰RPS | ۱۵s | ۶۰s | 315–375s |
| ۳۲۰۰RPS | ۱۵s | ۶۰s | 390–450s |

کاهش نهایی۱۵s است: مجموع اسمی **۴۶۵ ثانیه**، setup حداکثر۱۵s و graceful حداکثر۵s. سقف پیشنهادی supervisor **۵۴۰ ثانیه** شامل init/report، یک بودجهٔ مهندسیِ آزمون‌نشده است. ۳۲۰۰ سقف سخت اجراست، نه وعدهٔ رسیدن به آن. اگر هیچ توقفی رخ ندهد، حدود۵۱۹۴۵۰ درخواست workload اسمی برنامه‌ریزی می‌شود؛ مقدار واقعی فقط از evidence استخراج شود.

برای هر plateau، tag ثابت `phase:pRATE`، شمارش درخواست، p50/p95/p99 و error rate جدا ثبت می‌شود. threshold شمارش حداقل۹۹٪ هدفِ۶۰ثانیه را برای completeness پایان مرحله می‌سنجد؛ این tolerance جای صفر dropped و log زمانیِ کامل را نمی‌گیرد. ramp/down با plateau یکی نیستند. مراحل اجرا‌نشده، به‌خصوص بعد از abort، موفق محسوب نشوند. این تفکیک از رفتار رسمی [executor arrival-rate](https://grafana.com/docs/k6/latest/using-k6/scenarios/executors/ramping-arrival-rate/) استفاده می‌کند.

## فرمان و محیط خصوصی

باینری قبلاً واقعی و رسمی تأییدشده:

```text
S:/Morphiume/.local/k6/k6-v2.3.0-windows-amd64/k6.exe
SHA256 efec04c36452cfb9c0ef313082c021e5656caf5004f922c2d8b807fdf4a0e02f
```

Root یک پوشهٔ تازهٔ Admin/SYSTEM-only مانند `.local/e4-saturation-YYYYMMDDTHHMMSSZ-8lowerhex/` بسازد؛ خروجی قدیمی overwrite نشود. متغیرهای زیر فقط در محیط child و از handoff محافظت‌شده آماده شوند؛ هیچ secret به `-e` یا `--env` داده نشود:

```text
SATURATION_GO=1
SATURATION_BASE_URL=http://192.168.240.51
SATURATION_APP_COMMIT=e4bed691dc938a9c0f79022696d24f063ad97724
SATURATION_PROFILE_SHA256=a6988f3f27309c198e378e307ca856643686ae1c3fb49617bed9a770634e50ed
SATURATION_BASIC_USERNAME=<protected handoff>
SATURATION_BASIC_PASSWORD=<protected handoff, 64 lowercase hex>
SATURATION_SUMMARY=S:/Morphiume/.local/e4-saturation-YYYYMMDDTHHMMSSZ-8lowerhex/summary.json
DEPLOYMENT_ENV=staging
PAYMENT_PROVIDER=mock
SMS_PROVIDER=mock
K6_NO_USAGE_REPORT=true
```

script حضور `DATABASE_URL`، `MIGRATION_DATABASE_URL`، `LOAD_FIXTURE`، `K6_HTTP_DEBUG` و `K6_OUT` را رد می‌کند. monitor پایگاه، اگر Root لازم بداند، child جدا با DML فقط و guard خودش است؛ اعتبار پایگاه به k6 منتقل نشود. config k6 تازه و خالی `{}` با مسیر خصوصی صریح استفاده شود تا تنظیمات profile شخصی خوانده نشود. Root hash script، نسخهٔ باینری و stageهای واقعیِ بدون CLI override را پیش از فرمان زیر کنترل کند:

```powershell
& 'S:/Morphiume/.local/k6/k6-v2.3.0-windows-amd64/k6.exe' run --config '<private-run>/empty-k6.json' 'tests/load/catalog-saturation.js'
```

HTTP debug، cloud/output plugin، credentials در URL/argv و تغییر نرخ/VU/مدت روی CLI مجاز نیست. summary فقط metric/value/thresholdهای allowlist را می‌نویسد؛ body/header/کوکی، rootGroup و setup data را صادر نمی‌کند. `resultRequiresOperatorReview=true` و دو proof مربوط به generator و یافتن boundary عمداً false می‌مانند تا operator شواهد کامل را داوری کند.

supervisor آماده‌شدهٔ مالک بک‌اند می‌تواند `--paused --address=127.0.0.1:<owned-port>` را برای کنترل lifecycle اضافه کند؛ مرحله‌ها تغییر نکنند. قبل از resume/stop باید مالک listener همان child k6 ثابت شود. توقف کنترل‌شده فقط از [REST محلی k6](https://grafana.com/docs/k6/latest/reference/k6-rest-api/) و با انتظار محدود انجام شود؛ اگر summary نیامد یا hard-kill لازم شد، evidence ناقص گزارش شود. این supervisor هنوز شاهد اجرای واقعی ندارد.

## توقف و اعتبار generator

اولین status0/خطای شبکه، پاسخ۵xx یا401/403، redirect، پاسخ غیر۲۰۰ یا response guard نامعتبر فوراً `execution.test.abort` می‌کند؛ هیچ retry انجام نمی‌شود. کدهای ثابت `SATURATION_TRANSPORT_FAILURE`، `SATURATION_SERVER_5XX`، `SATURATION_PERIMETER_DENIAL` و `SATURATION_RESPONSE_GUARD` و counterهای disjoint همان دسته‌ها را نگه می‌دارند. خطای guard/setup/clock نیز بسته می‌شود و متن raw برگردانده نمی‌شود.

thresholdها: critical_faults=0؛ unexpected<0.005؛ p95 خواندن<500ms؛ dropped_iterations=0. p95/error هر plateau جدا و پس از۱۵s دادهٔ آن مرحله برای abort ارزیابی می‌شوند؛ completeness فقط در پایان ارزیابی می‌شود. delay و زمان ارزیابی threshold، توقف بلادرنگ دقیقِ میلی‌ثانیه‌ای را تضمین نمی‌کند؛ supervisor مستقل لازم است. APIهای [abort](https://grafana.com/docs/k6/latest/javascript-api/k6-execution/) و [threshold توقف](https://grafana.com/docs/k6/latest/using-k6/thresholds/) از مستندات رسمی v2.3.x بررسی شدند.

Root با نمونه‌های زمان‌دار generator و server، در اولین readiness failure، OOM/restart، خطای مالی/موجودی، dead جدید یا فشار پایدار منابع توقف کند. برای اعتبار generator، CPU واقعی فرایند k6 بر مبنای CPUهای منطقی host، RAM آزاد، progress، throughput و drops با هم بررسی شوند. CPU کل host به‌تنهایی، با توجه به peak نامرتبطِ اجرای قبلی، به k6 نسبت داده نشود. پیشنهاد عملیِ توقفِ نامعتبر: دو نمونهٔ متوالی k6>۸۰٪ از کل host، RAM آزاد<۲GiB، یا monitor ناقص؛ فشار پایدار host با counter k6 و evidence منبع جدا طبقه‌بندی شود. supervisor بعد از توقف به نرخ بعدی نرود.

**drop به‌تنهایی اشباع سرور نیست**: می‌تواند به سقف۴۰۰VU، محدودیت generator یا کندی SUT مربوط باشد. اگر p95 همان plateau یا منابع سرور حد را رد کند و generator معتبر باشد، آخرین plateau کاملِ موفق و نخستین مرحلهٔ متوقف‌شده یک bracket مشاهده‌شده می‌دهند. 5xx، شبکه، Basic/CIDR و HTTP guard ابتدا علتِ مشاهده‌شدهٔ خود را دارند؛ خودکار «اشباع» نامیده نشوند. رفتار [dropped iterations](https://grafana.com/docs/k6/latest/using-k6/scenarios/concepts/dropped-iterations/) همین چندعلتی بودن را توضیح می‌دهد. اگر سقف۳۲۰۰ موفق شود، فقط lower bound همان کاتالوگ/مسیر گزارش شود؛ مرز اشباع همچنان یافت نشده است.

## evidence و پایان

log کامل progress و زمان process، summary خصوصی، CPU/RAM/network واقعی generator و server/Nginx/app/DB، pool/locks/queue و status/errorهای wrapper لازم‌اند. به‌علت احتمال بیش از۵۰MB wrapper در سقف برنامه، retention فعلی Docker به‌تنهایی کافی فرض نشود: Root قبل از load، capture خصوصیِ پیوسته و محدود، مثلاً با cap160MiB و فضای آزاد حداقل۲GiB، آغاز کند. cap/قطع/از دست‌رفتن ابتدای بازه، نقص evidence است؛ نتیجهٔ صفر۵۰۰ از tail استنباط نشود.

در پایان، Root snapshot خواندنیِ مالی/موجودی و fixture نگه‌داری‌شده را با baseline همان اجرا مقایسه، صف را بررسی و timerها را دقیقاً restore کند. fixture تازه‌ای وجود ندارد و cleanup کاربر/محصول، حذف تاریخچه یا reset queue/limiter لازم یا مجاز نیست. warm/cold cache و cache-hit اندازه‌گیری‌شده، اندازهٔ dataset، هزینهٔ Basic/perimeter، مسیر مستقیم شبکه و throughput واقعی ذکر شوند؛ این query تکراریِ کاتالوگ همهٔ cacheها و workload فروشگاه را پوشش نمی‌دهد.

## بررسی انجام‌شدهٔ آماده‌سازی

۱۰ قرارداد آفلاین با HTTP/metrics مصنوعی موفق شدند: رد هدف و secrets اضافی، phase boundary، GET-only و jar تازه، توقفِ یک‌درخواست بدون retry، تمایز critical category، guardهای body/privacy، dropped/completeness و عدم نشت canary در summary. آخرین اجرا۱۹۳٫۶۹۷۵ms بود. `k6 inspect` رسمی با محیط صرفاً مصنوعی exit0،۱۳ stage و۴۰۰VU را parse کرد؛ setup اجرا نشد. attempt اول inspect به‌درستی با guard بسته شد، چون این subcommand به‌طور پیش‌فرض system env را منتقل نمی‌کند؛ attempt آفلاین بعدی با `--include-system-env-vars` روی **محیط حداقلیِ مصنوعی** موفق شد و capture قبلی محفوظ ماند.

CLI مستندات `npx` در shell موجود نبود؛ مستندات رسمی Grafana بررسی شدند. این شاهدهای آماده‌سازی جای اجرای واقعی saturation نیستند. هیچ عدد تازه‌ای به گزارش‌های ظرفیتِ تکمیل‌شده اضافه نشده است.
