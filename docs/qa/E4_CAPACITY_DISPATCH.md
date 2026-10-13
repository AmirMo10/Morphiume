# قرارداد اجرای ظرفیت E4

این سند، دستور اجرای بعدی است؛ **۲۰۰ VU، بازهٔ پایدار ۲۰ دقیقه و RPS هنوز پذیرش ظرفیت ندارند**. شاهد مستقلِ خرید سرور در [E4_SERVER_RETAINED_T25.md](E4_SERVER_RETAINED_T25.md) است. Root در `2026-10-13T09:32:40Z` آماده‌سازی واقعی را شروع کرده و checkpoint اعلام‌شدهٔ آن ۲۰۰ محصول، ۲۰ حساب و انتظار مجازِ ۵۹ ثانیه پس از ۴۲۹ بوده است؛ این مرحلهٔ ساخت داده است، نه load موفق. capture خطای اولیهٔ CJS پیش از progress/DB محفوظ است.

## هدف و دروازهٔ اجرا

Root باید پس از مرحلهٔ بازیابی و با dispatch صریح، همان برنامهٔ پذیرفته‌شدهٔ `e4bed691dc938a9c0f79022696d24f063ad97724`، تصویر/manifest/config/Ops/engine/proof و پروفایل دسترسیِ E4 را دوباره bind کند. منبع ابزار load می‌تواند اصلاح منتشرشدهٔ `08176c28f02e9283905c656a241313ebf840b7ab` باشد؛ تفاوت ابزار با commit برنامه در manifest خصوصی ثبت شود. منبع قدیمی، fixture قدیمی، پایگاه ب625، محیط restore یا پایگاه original جایگزین هدف ظرفیت نشوند.

هدف فعلی فقط `http://localhost:3100` و DB واقعی `morphiume_staging_runtime` با نقش `morphiume_runtime_app` از tunnel loopback15434 است: ۱۳ checksum متعارف، ۵۳ جدول، DML بدون مالکیت/CREATE/SUPERUSER/CREATEDB/CREATEROLE/BYPASSRLS. دسترسی generator انتخاب‌شده به **همین دو tunnel** باید واقعاً ثابت شود؛ وجود tunnel لینوکس، دسترسی Windows را ثابت نمی‌کند. secrets فقط از handoff خصوصی، پیش از importها، وارد فرایند شوند. `MIGRATION_DATABASE_URL` و اعتبار bootstrap/owner در runtime ابزار نباشند. برنامه production و `DEPLOYMENT_ENV=staging`، `PAYMENT_PROVIDER=mock`، `SMS_PROVIDER=mock` ثابت بمانند؛ worker معمولی فعال بماند و build، browser suite، backup/restore و نویسندهٔ رقیب هم‌زمان اجرا نشوند.

قبل از load: readiness200، سشن اول fixture واقعاً روی target، dataset کامل تازه، baseline مالی/موجودیِ دادهٔ قدیمی و fixture نگه‌داری‌شدهٔ T25، queue pending/running/dead/oldest و resource baseline ثبت شوند. baseline تاریخی یا capture پس از اجرا جای baseline قبل را نمی‌گیرد.

## ابزار، محیط و فرمان‌ها

باینری واقعاً موجود و با فرمان آفلاین `version` بررسی‌شده:

```text
S:/Morphiume/.local/k6/k6-v2.3.0-windows-amd64/k6.exe
k6.exe v2.3.0 (commit/e088784614, go1.26.8, windows/amd64)
```

SHA256 باینری `efec04c36452cfb9c0ef313082c021e5656caf5004f922c2d8b807fdf4a0e02f` و آرشیو رسمیِ موجود `112276d495e5741c968e2bc09ea6196099c1275bd6db9ee0875d173c7148ce43` است. باینری Linux k6 با این شاهد تأیید نشده؛ اجرای لینوکس به provision جداگانهٔ رسمی با digest و GO نیاز دارد. Node24.21/pnpm11.25/lock ثابت استفاده شوند. generator Windows فعلاً چهار CPU منطقی و ۳۲GiB RAM گزارش می‌کند؛ CPU/RAM واقعیِ مصرف‌شدهٔ k6 و tunnel باید اندازه‌گیری شوند.

در یک working directory خصوصیِ تازه، با source/tooling تأییدشده و `.local`/خروجی محافظت‌شده، متغیرهای زیر از handoff آماده شوند؛ مقدار secret روی خط فرمان یا stdout نیاید:

```text
DATABASE_URL, AUTH_SECRET, ADMIN_AUTH_SECRET, MOCK_CONTROL_SECRET, MEDIA_ROOT
NODE_ENV=production
DEPLOYMENT_ENV=staging
PAYMENT_PROVIDER=mock
SMS_PROVIDER=mock
APP_BASE_URL=http://localhost:3100
LOAD_BASE_URL=http://localhost:3100
LOAD_APP_COMMIT=e4bed691dc938a9c0f79022696d24f063ad97724
LOAD_FIXTURE=<private-working-directory>/.local/load-fixture.json
K6_BIN=S:/Morphiume/.local/k6/k6-v2.3.0-windows-amd64/k6.exe
```

پس از GO هر مرحله، از **همان working directory/محیط**:

```text
node --conditions=react-server --import tsx tests/load/prepare-fixture.ts
node scripts/run-load.mjs --mode=smoke
node --conditions=react-server --import tsx tests/load/validate-ledger.ts
node scripts/run-load.mjs --mode=vu
node --conditions=react-server --import tsx tests/load/validate-ledger.ts
node scripts/run-load.mjs --mode=rps
node --conditions=react-server --import tsx tests/load/validate-ledger.ts
# فقط پس از تطبیق کامل و GO پاک‌سازی:
node --conditions=react-server --import tsx tests/load/validate-ledger.ts --cleanup
```

runner نسخهٔ دقیق k6 و سه فایل خصوصیِ هم‌هویت را قبل از spawn بررسی می‌کند: `.local/load-fixture.json`، `.local/load-setup-progress-<fixture UUID>.json` و `.local/load-setup-latest.json`. لازم است setup واقعاً exit0 بدهد؛ همه complete، شناسه/source/origin/environment/زمان یکسان، `reconciliationRequired=false` و دقیقاً ۲۰۰ محصول و ۲۰۰ native user/cookie تازه باشند. پس از شکست، pointer یا فایل final قدیمی مجوز اجرا نیست. validator فعلی همیشه فایل ثابت `.local/load-fixture.json` را می‌خواند؛ خود validator دروازهٔ latest/progress را تکرار نمی‌کند. Root پیش از هر validator/cleanup همان readiness و سه hash را جدا بررسی کند؛ انتقال فقط final یا تغییر cwd مجاز نیست.

## fixture و مدت واقعی مورد انتظار

prepare، ۲۰۰ محصول مصنوعیِ منتشرشده، هرکدام یک variant با قیمت آزمایشی ۱۰۰۰۰ ریال، ایجاد می‌کند. SKU خرید ۱۰۰۰۰۰ واحد و ۱۹۹ SKU دیگر هرکدام ۱۰۰۰ واحد دارند. ثبت موجودی با ledger ابتدایی همراه است. ۲۰۰ حساب با **handler واقعی BetterAuth در فرایند Node** و OTP آزمایشی ساخته می‌شوند؛ اولین cookie با HTTP واقعی `/api/auth/get-session` روی برنامه تطبیق داده می‌شود. این آماده‌سازی شاهد ظرفیت signup HTTP یا SMS خارجی نیست. per-path/IP fallback و محدودیت واقعی تغییر نمی‌کند؛ فقط بعد از ۴۲۹ مشاهده‌شده، حداکثر یک retry با header عددی واقعی ۰..۶۰ ثانیه +۲۵۰ms انجام می‌شود. verify مجدد OTP تازهٔ موجود را می‌خواند و send اضافه نمی‌سازد. سقف setup۳۰ دقیقه، انتظارهای هر poll حداکثر۶۰ ثانیه و shutdown۵ ثانیه است؛ توقف به معنی اثبات cancel تراکنش نیست. progress خصوصی، برنامه‌ریزی/ایجاد/سشن و موارد نیازمند تطبیق را نگه می‌دارد؛ cleanup خودکار وجود ندارد.

| مرحله | پیکربندی موجود | دامنهٔ نتیجه |
| --- | --- | --- |
| smoke | ۱۰s تا۲VU، ۳۰s نگه‌داری، ۱۰s کاهش؛ اولین سفر هرVU تلاش خرید | آزمون مسیر؛ ظرفیت نیست. باید واقعاً خرید paid و ledger معتبر داشته باشد. |
| vu | ۱m تا۵۰، ۲m تا۲۰۰، **۲۰m کامل با۲۰۰**، ۲m کاهش؛ حداکثر قبلی inspect25m30s | ۸۰٪ مرور/۱۰٪ جست‌وجو/۸٪ سبد/۲٪ خرید؛ حدود۱۵s فاصلهٔ سفر، حدود۴۰ درخواست پویا/s نامزد، نه تضمین. |
| rps | arrival10→20 طی۲m، سپس40/80/120 هرکدام۳m، کاهش۱m؛ 100preallocated/200maxVU | ۱۲m مرحله‌بندی +graceful پایان؛ هر iteration یک GET کاتالوگ، مستقل از۲۰۰ کاربر. |

مجموع مراحل اسمیِ سه load برابر۳۷m۵۰s است؛ graceful انتهای هر اجرا می‌تواند مجموع را تا حدود۳۹m۲۰s برساند. setup می‌تواند۳۰m و اندازه‌گیری/تطبیق زمان جدا داشته باشد. خروج زودهنگام، کمبودVU، dropped iterations، خطا یا وقفه، پذیرش کامل plateau نیست. p95 خواندن<500ms، POST checkout<1000ms و `unexpected_errors<0.005` در کد موجودند؛ p50/p95/p99 و actual request/iteration throughput ثبت شوند. ۴۰۹ فعلاً بر اساس **status** جدا شمرده می‌شود؛ بدون بررسی code/route نمی‌توان همهٔ آنها را تعارض تجاری درست نامید. status0 نیز با اصلاح Root غیرمنتظره شمرده می‌شود و finallyِ سفرهای vu/smoke، فاصلهٔ۱۵s را در خطا/early-return حفظ می‌کند. thresholdها در harness فوری abort نمی‌کنند؛ کنترل‌کننده باید شرط‌های توقف زیر را اعمال کند.

## شاهد منابع، توقف و تطبیق مالی

collector در ترمینال جدا، پیش از هر run و تا پایان آن:

```text
node tests/load/collect-metrics.mjs --duration=1800
```

برای vu، ۱۸۰۰s کافی برای مراحل و پایان عادی است؛ برای RPS می‌توان ۹۰۰s جدا ثبت کرد. sampler موجود هر حدود۱۵s به‌اضافهٔ زمان query/SSH نمونه می‌گیرد؛ timestamps واقعی ملاک‌اند. alias `morphiume-deploy` و SSH strict مخصوص generator باید قبل از dispatch قابل استفاده باشند؛ `ssh_stats_failed` یا `containers=[]` شاهد منابع نیست. خروجی خصوصی شامل CPU/RAM/PID/network/blockIO، connections/state/locks و queue است؛ health کاملِ دارای بررسی سنگین آرشیو را بدون اندازه‌گیری هزینه، هر۱۵s جای collector اجرا نکنید. نام container باید مربوط به پروژهٔ `morphiume-staging-runtime` باشد. pool app10، worker3 و محدودیت ثابت compose app1.5CPU/1536MiB و worker0.5CPU/384MiB ثبت شوند؛ منابع واقعی DB/host از readback Root بیایند. میزبان قبلاً ۴CPU/~4.8GiB داشته، کمتر از نامزد۸CPU/16GiB سند است؛ نتیجهٔ همین ماشین ظرفیت آن نامزد را اثبات نمی‌کند.

توقف فوری و حفظ artifact: identity/guard mismatch، PSP/SMS غیرmock، خراب‌شدن baseline مالی، موجودی منفی/رزرو بیشتر از موجودی، receipt/shipment تکراری، OOM/restart، worker مرده یا readiness از دست‌رفته، wrapper500 با نتیجهٔ مالی نامعلوم. توقف عملیاتی و بررسی Root: نرخ خطای غیرمنتظره≥۰٫۵٪ در نمونهٔ کافی، عبور پایدار p95 از هدف، صف رو به رشد یا dead جدید، کمبود ظرفیت generator/dropped iterations، ناکامل‌شدن collector، بودجهٔ setup یا run تمام‌شده. برای RPS، نخستین نرخ ناموفق نقطهٔ اشباع مشاهده‌شده است؛ نباید با تکرار کور یا افزایش منابع/حدود همان run پنهان شود. original logها کوتاه یا reset نشوند.

validator فعلی فقط **SKU خرید** را با جمع ledger تطبیق می‌دهد و برای سفارش‌های userهای fixture، معادلهٔ پول و یک receipt اصلی/یک shipment هنگام commit را بررسی می‌کند. این بررسی به‌تنهایی وضعیت تمام۲۰۰ variant، subtotal آیتم‌ها یا مبلغ receipt را اثبات نمی‌کند. Root باید علاوه بر آن، query آمادهٔ زیر را با **دو پارامتر خصوصیِ تأییدشده** (۲۰۰ product UUID و purchase variant UUID) در `BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY` با `SET LOCAL statement_timeout='3s'` اجرا کند؛ خروجی فقط شمارش‌هاست، SQL در این آماده‌سازی اجرا نشده:

```sql
WITH scope AS (SELECT id FROM product WHERE id=ANY($1::uuid[])),
owned AS (SELECT v.id,v.product_id,b.on_hand,b.reserved
  FROM variant v JOIN scope p ON p.id=v.product_id
  LEFT JOIN inventory_balance b ON b.variant_id=v.id),
ledger AS (SELECT l.variant_id,sum(l.on_hand_delta) AS on_hand,
  sum(l.reserved_delta) AS reserved FROM inventory_ledger l
  JOIN owned v ON v.id=l.variant_id GROUP BY l.variant_id)
SELECT (SELECT count(*) FROM scope) AS products,
  count(*) AS variants,count(DISTINCT v.product_id) AS products_with_variant,
  count(*) FILTER(WHERE v.id=$2::uuid) AS purchase_variants,
  count(*) FILTER(WHERE v.on_hand IS NULL OR l.variant_id IS NULL
    OR v.on_hand<0 OR v.reserved<0 OR v.reserved>v.on_hand
    OR v.on_hand<>l.on_hand OR v.reserved<>l.reserved) AS stock_violations,
  count(*) FILTER(WHERE v.id<>$2::uuid
    AND (v.on_hand<>1000 OR v.reserved<>0)) AS other_sku_changes
FROM owned v LEFT JOIN ledger l ON l.variant_id=v.id;
```

انتظار: products/variants/products_with_variant=200، purchase_variants=1 و هر دو violation=0. queryهای جدا در همان snapshot، برای userهای دقیق همین fixture باید subtotal=`SUM(line_total_irr)`، line=`quantity*unit_price_irr`، معادلهٔ total، مبلغ/IRR receipt اصلی برابر total، receipt اصلی و shipment هر commit دقیقاً۱، و delta خرید متعهد با واحدهای سفارش برابر را بررسی کنند. baseline ردیف‌های مالی قبلی/fixture T25 نیز باید حفظ شود؛ equality کل جدول با داشتن نوشتن طبیعی worker ادعا نشود. موجودی زیاد این load، آزمایش رقابتِ «آخرین واحد» نیست.

پاک‌سازی فقط پس از بررسی outcome و GO: همین۲۰۰ محصول archive، همین۲۰۰ حساب disabled و sessionهایشان حذف؛ شمارش readback۲۰۰/۲۰۰/صفر و حفظ ledger/order/payment/shipment/queue و fixture T25 لازم است. اگر setup یا cleanup ناقص شد، progress خصوصی و شناسهٔ همان fixture تطبیق داده شوند؛ هیچ پاک‌سازی عمومی، حذف تاریخچه، reset limiter، lease/job replay کور یا تغییر موجودی دستی انجام نشود. raw cookie/phone/authority/body/log خصوصی بمانند؛ گزارش عمومی تنها release/tool hashes، زمان/منابع/route alias/count/percentile و نتیجهٔ invariants را نشان دهد.

دو entrypoint TS به async main تبدیل شدند؛ منطق/import/budget/auth/cleanup با حذف indentation دقیقاً برابر baseline832f108 است. lint و global TypeScript موفق؛ loader بدون هدف در Windows و Linux24.21 با `--conditions=react-server --import tsx` به خطای بستهٔ guard رسید، بدون dotenv/progress/PG/HTTP. این شاهد loader است، نه موفقیت ساخت۲۰۰ حساب یا ظرفیت سرور.
