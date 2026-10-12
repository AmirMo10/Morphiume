# برنامهٔ اجرا و مالکیت

مالک تنظیمات ریشه، package/lockfile، auth، route handlerهای API، یکپارچه‌سازی، ثبت شواهد و push به `main`: هماهنگ‌کننده (`/root`). هیچ عامل دیگری این فایل‌ها را تغییر نمی‌دهد. هر تحویل باید فایل‌ها، آزمون واقعاً اجراشده، شکست و مانع واقعی را گزارش کند.

| فاز/کار | مالک واقعی | مسیر انحصاری | وابستگی | معیار پذیرش |
|---|---|---|---|---|
| صفر: محیط، قراردادها، برنامه و پیش‌نیازها | هماهنگ‌کننده | docs ریشه، .codex، تنظیمات ریشه، Skillهای تخصیص‌نیافته | سند کامل و Git | نسخه‌های مشاهده‌شده؛ ۱۰ Skill معتبر؛ مرز staging/live |
| هویت و طراحی | brand_designer | docs/design، public/brand، Skill برند | brief | سه SVG اصیل، انتخاب مستند، توکن/کنتراست، منابع واقعاً مشاهده‌شده |
| تجارت و بک‌اند | commerce_backend | db، src/contracts، src/server/commerce، payments، jobs، docs/backend | قرارداد مالی/auth | migration، رزرو/verify اتمیک، outbox، بازپرداخت/کوپن، DTO |
| رابط فروشگاه و پنل | frontend_engineer | src/app به‌جز api، src/components، src/styles، docs/frontend | قرارداد API و design | مسیر خرید/ادمین فارسی متصل؛ همهٔ stateها؛ بدون SQL برای ادمین |
| امنیت | security_reviewer | docs/security، tests/security، Skill امنیت | auth و domain | threat model، سوءاستفادهٔ قابل بازتولید، رفع موارد مانع انتشار |
| زیرساخت | devops_sre | deploy/staging، docs/ops، Skill ops | runtime و health/worker قرارداد | image pin، شبکهٔ داخلی، staging حفاظت‌شده، restore واقعی |
| آزمون و عملکرد | qa_performance | tests/unit، tests/integration، tests/e2e، tests/load، docs/qa، Skill QA | مسیر عمودی و DB واقعی | T01–T30 با وضعیت واقعی؛ شواهد مرورگر؛ ظرفیت بدون ادعای جعلی |
| متن فارسی | persian_editor | src/lib/fa-copy، docs/FA_COPY_GUIDE.md، docs/persian، Skill RTL | صفحات واقعی | متن روان، bidi/ارقام/خطاها؛ بازبینی واقعی صفحات |

حداکثر سه Subagent هم‌زمان با هماهنگ‌کننده؛ نقش‌ها به نوبت اجرا می‌شوند. مالک schema/migration فقط عامل commerce_backend است؛ تغییر لازم ابتدا با او هماهنگ می‌شود. API/auth و DTO پیش از اتصال UI تثبیت می‌شوند. آزمون امنیت/QA مستقل از نویسنده اجرا می‌شود.

فازها: صفر ارزیابی و قرارداد؛ یک طراحی و قالب؛ دو مسیر عمودی زودهنگام؛ سه قابلیت‌های اصلی؛ چهار رفع اشکال، RTL، امنیت، backup و ظرفیت؛ پنج اتصال سرویس‌های واقعی دارای دسترسی و انتشار قابل بازبینی. نبود PSP/دامنه فقط بخش متکی به همان ورودی را متوقف می‌کند.

منبع پذیرش کامل و سناریوهای T01–T30: سند اجرایی، بخش‌های ۲۲ تا ۲۶. نتیجهٔ هر فاز در `STATUS.md` و گزارش عامل‌ها ثبت می‌شود؛ صرف ایجاد فایل، قبولی آزمون محسوب نمی‌شود.

## ادامهٔ کار مستقل پس از پذیرش صفحه‌بندی/ارسال

بازبینی عملکردی کامل سند توسط عامل تجارت، خواندن کد بود؛ جای آزمون امنیت یا بازتولید اجرایی نیست. کارهای زیر هنوز تمام‌شده محسوب نمی‌شوند و به نبود merchant یا دامنه وابسته نیستند:

| کار با خروجی مشخص | مالک فایل | خروجی/پذیرش لازم |
|---|---|---|
| وضعیت ارسال و proof مالی پس از قفل | commerce_backend؛ root برای projection API | بازتولید منع delivered→shipped، replay بدون اثر، refund proof با clock_timestamp پس از قفل؛ پاسخ shipment برای fulfillment بدون مبلغ |
| نامک قدیمی و مجموعهٔ قابل crawl | commerce_backend برای migration/lookup؛ frontend برای SSR/metadata؛ root برای API | alias اتمیک و منع collision، resolve فقط منتشرشده، فهرست/اعضای bounded و snapshot، unknown slug404، sitemap مجموعه و BreadcrumbList مطابق صفحه |
| تصمیم شکست بازپرداخت دستی | commerce_backend، frontend، root API | مسیر مجاز با دلیل/مدرک، شکست تأییدشده از انتقال نامعلوم جدا، آزادسازی بودجه دقیق و replay؛ تغییر موجودی مستقل |
| اعلان‌های مرجوعی/بازپرداخت/استثنای پرداخت | commerce_backend؛ frontend inbox | outbox و اعلان داخلی کنترل‌شدهٔ dedup، نمایش وضعیت/کار اپراتور؛ SMS واقعی ادعا نشود |
| تحلیل بدون PII و گزارش دوره‌ای | commerce_backend برای داده/تجارت؛ root برای API/report؛ frontend برای رخداد/رابط | رخداد محدود و dedup بدون جست‌وجوی خام/IP/شماره/نشانی؛ دریافت مالی مرجع سرور، فروش primary از extra receipt و خالص cash جدا، بازه/تعریف funnel روشن |
| محتوای قابل تنظیم/اطلاعات تکمیلی کالا | root تنظیمات؛ commerce_backend مدل کالا؛ frontend فرم/نمایش | slotهای قابل ویرایش با version و مجوز، هشدار/نگه‌داری خالی تا دادهٔ مصوب؛ نمونهٔ آزمایشی فروش واقعی معرفی نشود |
| سیاست سبد و حالت نگه‌داری | root/backend/frontend با قرارداد پیش از تغییر | رفتار پس از OTP و تغییر حساب مستند/آزموده؛ ادغام تأییدنشده یا وعدهٔ merge چنددستگاهی ساخته‌نشده ادعا نشود؛ maintenance تصمیم صریح و قابل برگشت |
| استقرار/بازیابی/ظرفیت | devops_sre و qa_performance | فقط تصویر پذیرفته‌شده، retained fixture روی رسانهٔ سرور، restore3101 جدا، worker/alert واقعی،۲۰۰VU با۲۰دقیقه plateau و RPS مستقل؛ صف fixtureهای قدیمی از workload تازه جدا/تعیین تکلیف شود |

این جدول برنامه است، نه نتیجهٔ اجرا. ترتیب فعلی: اصلاح invariantهای مالی/ارسال، checkpoint تأییدشده روی main و پذیرش تصویر؛ سپس قابلیت‌های مستقل باقی‌مانده و پذیرش واقعی سرور. PSP/SMS/domain/legal/offsite و دستگاه/شبکهٔ واقعی ایران در OWNER_INPUTS به‌عنوان وابستگی واقعی نگه‌داری می‌شوند.

پذیرش build89652/server36884 پایان یافت: مرورگر یکپارچه۲۲/۲۲ در560.980110s و ثبت جداگانهٔ تصاویر آماده موفق؛ QA پنجره را صریحاً آزاد کرده است. root همچنان مالک استثنایی `src/contracts/presentation.ts` و `src/contracts/reports.ts`، ماژول‌های server متناظر و tests/unit/config +tests/integration/config است؛ قراردادهای دیگر با تجارت‌اند. QA مالک tests/helpers/qa-target و tests/unit/shared/qa-target.test.ts و E2E/load است. checkpoint یکپارچه پس از تحویل منجمد Ops/QA، اسکن اسرار و بررسی نهایی روی main push می‌شود.

chunk بعدی پس از checkpoint: تجارت0011 و سه فیلد اختیاری plain-text کالا/حفظ مقدار در update-import را می‌سازد؛ root whitelist/API/export را یکپارچه می‌کند و فرانت‌اند فرم/پیش‌نمایش/نمایش عمومی را متصل می‌کند. آزمون PG فقط schema تولیدشدهٔ جدا در پنجرهٔ هماهنگ؛ DDL پایگاه مشترک فقط با GO صریح. قرارداد analytics/اعلان در docs/backend/NEXT_CONTENT_ANALYTICS_CONTRACT.md و سیاست مصرف/claim/بازیابی سبد در CART_LIFECYCLE_PLAN.md هنوز برنامه‌اند. نشر CI یا آزادشدن پنجرهٔ آزمون، مجوز خودکار bootstrap/image/restore نیست؛ استقرار فقط با هویت تصویر واقعاً پذیرفته‌شده و dispatch هماهنگ‌کننده انجام می‌شود.
