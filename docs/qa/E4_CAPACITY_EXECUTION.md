# اجرای واقعی ظرفیت E4 — ۱۳ اکتبر ۲۰۲۶

اجرای ۲۰۰ کاربر با **۲۰ دقیقه مرحلهٔ پایدار** و آزمون جداگانهٔ افزایش نرخ درخواست تا هدف ۱۲۰ درخواست در ثانیه پایان یافتند. thresholdهای همان harness موفق بودند؛ ۳۵۱ خرید آزمایشی متعهد با یک اثر موجودی برای هر سفارش تطبیق داده شد. گزارش کامل بازهٔ wrapper برنامه نیز هیچ پاسخ خطای ۴xx/۵xx نداشت. این نتیجه برای مسیر SSH، داده و برنامهٔ مشخص زیر است؛ سقف اشباع یا ظرفیت همهٔ مسیرها را تعیین نمی‌کند.

شاهد ماشین‌خوان، percentileها، شمارش‌ها و SHA256 فایل‌های خصوصی در [e4-capacity-safe.json](e4-capacity-safe.json) است. [E4_CAPACITY_DISPATCH.md](E4_CAPACITY_DISPATCH.md) سابقهٔ برنامهٔ آماده‌سازی است؛ ادعای «هنوز اجرا نشده» در آن به زمان نگارش همان سند تعلق دارد.

## هویت و اجرای ابزار

برنامهٔ پذیرفته‌شده `e4bed691dc938a9c0f79022696d24f063ad97724`، تصویر runtime با digest آغازین `3b78dc30`، Ops با digest آغازین `68bc527a` و پروفایل `67f77b16…` ثابت ماندند؛ هشت هویت کامل در JSON آمده‌اند. فقط سه فایل ابزار load از commit `08176c28f02e9283905c656a241313ebf840b7ab` روی کپی خصوصی E4 قرار گرفتند. validator قوی‌تر از commit جداگانهٔ `0e7fb648072633fd3dc2b0d99bc25b44f075e771` است؛ این هویت‌ها commit برنامه نیستند.

هدف واقعی `http://localhost:3100` از generator خارجی Windows و tunnel SSH با host checking سخت‌گیرانه بود. همهٔ fixtureها و برنامه از `morphiume_staging_runtime`، نقش DML `morphiume_runtime_app` و tunnel پایگاه loopback15434 استفاده کردند؛ تاریخچهٔ ۱۳ migration و ۵۳ جدول کنترل شد. اعتبار owner/bootstrap وارد فرایند load نشد. worker معمولی تصویر فعال بود؛ سرویس‌های پرداخت و پیامک mock ماندند.

Node واقعی generator نسخهٔ **24.19.0** بود و شرط package را رعایت می‌کرد؛ نسخهٔ 24.21 در برنامهٔ قبلی نامزد Linux بود. باینری رسمی k6 نسخهٔ **2.3.0** در `S:/Morphiume/.local/k6/k6-v2.3.0-windows-amd64/k6.exe` استفاده شد؛ SHA256 باینری `efec04c36452cfb9c0ef313082c021e5656caf5004f922c2d8b807fdf4a0e02f` است. باینری و آرشیو ثابت، manifest سه overlay و خروجی‌های خام حفظ شدند.

Root فرمان‌های زیر را در یک cwd خصوصی با handoff DML و متغیرهای `LOAD_APP_COMMIT`، `LOAD_TOOLS_COMMIT`، `LOAD_BASE_URL`، `LOAD_FIXTURE` و `K6_BIN` اجرا کرد. secretها روی argv یا گزارش عمومی قرار نگرفتند:

```text
node --conditions=react-server --import tsx tests/load/prepare-fixture.ts
node scripts/run-load.mjs --mode=smoke
node scripts/run-load.mjs --mode=vu
node scripts/run-load.mjs --mode=rps
node tests/load/validate-capacity-evidence.mjs
node --conditions=react-server --import tsx tests/load/validate-ledger.ts
# فقط پس از تطبیق مالی و مجوز پاک‌سازی همان fixture:
node --conditions=react-server --import tsx tests/load/validate-ledger.ts --cleanup
node tests/load/validate-capacity-evidence.mjs --expect-cleanup
```

validator قوی‌تر قبل از load و پس از smoke، VU، RPS و cleanup snapshot خواندنی جدا ثبت کرد. سه رکورد fixture/progress/latest باید هم‌هویت، کامل و بدون مورد تطبیق‌نشده می‌بودند؛ فایل final قدیمی جای setup موفق قرار نگرفت.

## آماده‌سازی و شکست محفوظ

اولین attempt واقعی پیش از progress و کار پایگاه با `TransformError` مربوط به top-level await در خروجی CJS متوقف شد. capture آن محفوظ است. دو entrypoint به async main تبدیل شدند؛ package type، auth، limiter، بودجه و cleanup تغییر نکردند. gate بدون target، lint و TypeScript جدا موفق بودند؛ سپس Root attempt واقعی تازه را اجرا کرد.

setup از **09:32:40.092Z تا09:55:19.621Z**، به مدت **۱۳۵۹٫۵۲۹ ثانیه**، ۲۰۰ محصول و ۲۰۰ حساب مصنوعی ساخت و exit0 داد. ۴۱۹ تماس با handler نگه‌داری‌شدهٔ native ثبت شد: ۴۰۰ پاسخ۲۰۰ و ۱۹ پاسخ۴۲۹. فقط پس از ۴۲۹ مشاهده‌شده، یک retry با فاصلهٔ عددی header واقعی انجام شد؛ counter، IP، ساعت و حد auth تغییر نکردند. verify، کد جاری معتبر را خواند و send تازهٔ اضافی نساخت.

این صدور OTP/session **در فرایند Node با کتابخانهٔ واقعی** بود؛ آزمون throughput ثبت‌نام HTTP یا پیامک خارجی نیست. اولین cookie با HTTP واقعی target تطبیق داده شد. SKU خرید ۱۰۰۰۰۰ واحد و ۱۹۹ SKU دیگر هرکدام ۱۰۰۰ واحد داشتند؛ هر محصول یک variant داشت. این داده عمداً برای آزمایش حجم ساخته شد.

## نتیجهٔ سه اجرا

همهٔ زمان‌ها UTC و latencyها میلی‌ثانیه‌اند. p95 خواندن<500، p95 checkout<1000 و نرخ خطای غیرمنتظره<0.005 ملاک‌های همان harness بودند.

| اجرا | درخواست / iteration | خواندن p50 / p95 / p99 | checkout p95 | خرید آزمایشی |
| --- | ---: | ---: | ---: | ---: |
| smoke، ۲VU | ۲۷ / ۶ | 31.843 / 96.382 / 121.809 | 109.778 | ۲ |
| VU، ۲۰۰ کاربر | ۵۵۳۸۵ / ۱۷۹۹۶ | 11.171 / **77.310** / 93.630 | **68.012** | ۳۴۹ |
| arrival-rate کاتالوگ | ۳۹۶۰۰ / ۳۹۵۹۹ | 19.998 / **50.068** / 96.581 | کاربرد ندارد | صفر |

هر سه summary نرخ `unexpected_errors=0` و `http_req_failed=0` و thresholdهای لازمِ موفق دارند. در metric نوع Rate، مقدار `fails` شمارندهٔ نمونهٔ boolean=false است؛ در `unexpected_errors` این نمونه‌ها **خطا نیستند**. هیچ تفسیر معکوسی از این نام انجام نشده است.

فرایند VU در **09:58:42.8153719Z** شروع شد و summary در **10:23:52.856Z** تولید شد؛ exit0 و ۱۷۹۹۶ iteration کامل/صفر interrupted ثبت شد. source ثابت شامل ramp سه‌دقیقه‌ای، ۲۰ دقیقه۲۰۰VU و کاهش دو‌دقیقه‌ای است. log کامل، ۱۵۱۰ نمونهٔ progress دارد؛ ۱۲۰۷ نمونهٔ متوالی۲۰۰/۲۰۰ از elapsed180.8 تا1386.8، بازهٔ مشاهده‌شدهٔ **۱۲۰۶ ثانیه**، بدون افت ثبت‌شده و با حداکثر فاصلهٔ یک ثانیه، مرحلهٔ پایدار را تأیید می‌کند. میانگین کل اجرا **36.686 درخواست/s** است و rampها را هم شامل می‌شود. سفرها حدود۱۵ ثانیه فاصله داشتند، ازجمله early-returnهای خطا؛ حلقهٔ سریع خطا جای workload قرار نگرفت.

RPS در **10:24:24.4563976Z** شروع و در **10:36:24.810Z** پایان یافت؛ exit0، ۳۹۵۹۹ iteration کامل/صفر interrupted و همهٔ checkها موفق بود. پیکربندی از10 به20 طی۲ دقیقه و سپس به40،80،120 هرکدام طی۳ دقیقه و به صفر طی یک دقیقه می‌رسد. بنابراین **sweep تا هدف۱۲۰** اجرا شده، اما **plateau مستقل۱۲۰RPS اجرا نشده**. میانگین کل ramp برابر54.989 درخواست/s است؛ یک درخواست readiness علاوه بر iterationها وجود دارد. بیشترین VU فعالِ ثبت‌شده۱۶ بود. شکست یا نقطهٔ اشباع مشاهده نشد و مرز حداکثر ظرفیت تعیین نشده است.

## شواهد مالی، موجودی و پاک‌سازی

snapshotهای خواندنی، هر۲۰۰ variant را با ledger تطبیق دادند؛ ۱۹۹ SKU غیرخرید بدون تغییر ماندند. پس از VU و RPS، **۳۵۱ سفارش/۳۵۱ واحد/۳۵۱ تعهد موجودی** وجود داشت. موجودی SKU خرید از100000 به**99649** رسید؛ reserved و رزرو فعال صفر بودند. نقض موجودی، پول، subtotal آیتم، مبلغ receipt اصلی، تعهد receipt/shipment و سفارشِ متعلق به user بیرون fixture صفر بود. اثر پرداخت/موجودی از نتیجهٔ مرورگر استنباط نشد.

پس از cleanup مجاز، snapshot **10:37:12.291Z** دقیقاً **۲۰۰ محصول archived، ۲۰۰ حساب disabled و صفر session** را ثبت کرد. order/payment/receipt/shipment/ledger و دادهٔ fixture T25 حفظ شدند. مقایسهٔ جداگانهٔ ۱۴ جدول مالی، **۳۴ ردیف پیشین** را بدون تغییر تأیید کرد؛ snapshot پس از اجرا۴۶۴۶ ردیف داشت. برابری همهٔ ردیف‌های همهٔ۵۳ جدول ادعا نشده، زیرا worker معمولی نیز نویسندهٔ مجاز بود. queue یا limiter عمومی reset نشد و تاریخچهٔ مالی حذف نشد.

## منابع و گزارش سرور

collector سرور **۱۴۳ نمونه** از09:56:45.741 تا10:38:02.950 داشت؛ فاصلهٔ تنظیم‌شده۱۵ ثانیه و میانگین واقعی با SSH/query **17.445 ثانیه**، بیشترین17.735 بود. خطای parse/SSH/DB، container ناشناخته و tail ناقص صفر بود. peak نمونه‌ای CPU بر مبنای یک CPU منطقی و RAM مصرفی:

| سرویس | CPU peak | RAM peak | سقف RAM مشاهده‌شده |
| --- | ---: | ---: | ---: |
| app | 59.23٪ | 203.10MiB | 1536MiB |
| worker | 7.73٪ | 45.24MiB | 384MiB |
| DB | 68.33٪ | 212.30MiB | 1280MiB |

بیشترین connection پایگاه۱۲، active۴، pending صف۵۶، dead صفر و عمر قدیمی‌ترین job۳۳ ثانیه بود. شمارش lock بدون grant در query همان DB صفر بود؛ این query قفل‌های transaction دارای database=null را شامل نمی‌شود و اثبات نبود همهٔ lock waitها نیست. نمونه‌برداری، peak بین دو نمونه یا pool wait را اندازه نمی‌گیرد.

generator خارجی۴ CPU منطقی و حدود۳۲GiB RAM داشت. **۱۶۳ نمونه** با فاصلهٔ واقعی میانگین15.406 ثانیه ثبت شد. حداقل RAM آزاد حدود16.61GiB بود. peak working set فرایند k6 در VU برابر289.13MiB و در RPS برابر157.38MiB شد؛ peak CPU از delta counter به‌ترتیب10.392٪ و18.431٪ بر مبنای یک CPU، یا2.598٪ و4.608٪ از کل host چهارCPU بود. SSH tunnel peak30.51MiB داشت. CPU کل host در یک نمونه به100٪ رسید؛ علت این peak به k6 نسبت داده نشده است. CPU/RAM/swap میزبان سرور در collector Docker اندازه‌گیری نشد.

Root گزارش کامل wrapper برنامه را با `docker logs --since/--until`، بدون tail، برای **09:56:45 تا10:38:34** خواند: **۹۶۲۳۶ خط، ۱۷۱۴۱۰۱۹ بایت، ۹۴۸۳۱ پاسخ۲۰۰ و۳۵۱ پاسخ۲۰۱**؛ هیچ وضعیت خطا/errorCode ثبت نشد. ۸۸۲۴۴ نمونهٔ خواندن، p95 داخلی سرور18ms و max69ms داشتند؛ این latency با latency انتهابه‌انتهای k6 متفاوت است. نخستین/آخرین wrapper09:57:00.087 و10:38:20.364 بود و همهٔ شروع/پایان‌های load در بازهٔ درخواست‌شده قرار دارند. cap فعال نشد؛ app/worker healthy، OOM=false و restart=0 بودند. logging driver نوع local با۵ فایل10m است؛ محدودیت عمومی rotation حفظ شده و گزارش، تاریخچهٔ خارج این بازه را اثبات نمی‌کند.

شمارش wrapper95182 با درخواست‌های k6 برابر95012 یکسان نیست؛ health/readiness و درخواست‌های عملیاتی مجاز نیز ثبت شده‌اند. SHA256 stdout کامل `b10c91865c1995702018982f5bfd9c0fe2d6a4341ded2b4788faaf1a50927bc2` و SHA فایل‌های منابع و سه raw summary در JSON است. فایل‌های خام، cookies و شناسه‌های fixture خصوصی ماندند.

هر دو collector فقط **پس از پایان اجراها** توسط Root متوقف شدند؛ پایان طبیعی بودجهٔ collector ادعا نشده است. پنجرهٔ fixture/native در **10:38:34.343Z** صریحاً آزاد شد. QA این جمع‌بندی را آفلاین از شواهد Root استخراج کرد؛ درخواست/SQL/load تازه‌ای برای نوشتن گزارش اجرا نکرد.

## حدود این پذیرش

این شاهد مسیر API از tunnel، پرداخت/SMS کنترل‌شده و SKU دارای موجودی زیاد است. شبکهٔ کاربران ایران، مسیر private-IP/perimeter، provider واقعی، تصاویر/CDN/prefetch، Core Web Vitals و رقابت آخرین واحد در این load آزموده نشدند. ماشین نامزد۸CPU/16GiB یا ظرفیت نامحدود با این اجرا تأیید نمی‌شود. حالت RPS فقط کاتالوگ را پوشش می‌دهد؛ تغییر workload، داده، منابع، نسخه یا مسیر شبکه به اندازه‌گیری جدید نیاز دارد.
