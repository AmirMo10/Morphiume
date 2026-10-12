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
