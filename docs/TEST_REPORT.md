# آزمون‌های واقعاً اجراشده

تاریخ: ۲۰۲۶-۱۰-۱۲. منبع برنامه در working tree پس از فاز صفر `b01c09f` یکپارچه شد؛ commit برنامه و اجرای CI در بازبینی بعدی ثبت می‌شوند. نتیجهٔ زیر خروجی واقعی ابزار است، نه برآورد یا گواهی آمادگی فروش.

| بررسی | نتیجهٔ موجود |
|---|---|
| سند اجرایی و native agents | فایل ۵۷۵خطی کامل؛ CLI 0.162.0-alpha.17.2؛ desktop 26.1007.21434؛ اجرای واقعی نقش‌ها |
| Skillها | ۱۰ entrypoint؛ validator پروژه و quick_validate رسمی موفق |
| DB | PostgreSQL 18.6 staging؛ migrationهای 0001–0006 واقعاً اعمال شدند |
| suite کامل واحد/DB/auth | ۷۷ آزمون، پنج فایل، exit0؛ مدت 93.42s در اجرای root |
| auth | OTP هم‌زمان/انقضا/replay/بودجهٔ تلاش، identity واحد، MFA TOTP/recovery بومی و نقش لغوشده |
| مالی و انبار | رقابت آخرین واحد/کوپن، idempotency actor/payload، verify/double receipt، refund budget، late payment، outbox retry، bulk/نسخه/رزرو، shipping threshold |
| نوع و lint | TypeScript و ESLint یکپارچه موفق |
| build | Next16.4 optimized production build موفق؛ اصلاح CSP/image در build 52517 نیز موفق |
| مرورگر پیش از اصلاح CSP | چهار مورد Chrome154.0.8037.93/WebKit27.2 موفق؛ 20.1s و 30.5s برای مسیر کامل |
| T25/T17/T19/T12/T05 | MFA/UIproduct/upload/publish، guestOTP، حفظ فرم در 503، unknown سپس paid، receipt1/shipment1/stock3→2، tracking، دسترسی customer دیگر رد؛ بدون انتقال پول واقعی |
| RTL و accessibility | 320px سفارش پس از اصلاح موفق؛ axe صفحهٔ محصول/سفارش و سه صفحهٔ عمومی صفر violation در دو موتور |
| CSP | CspImage و دو hash ثابت اعلان مسیر اصلاح شدند؛ Chrome baseline صفر و اعلان دسترس‌پذیری صحیح؛ WebKit یک رخداد پیش از فراخوانی سبک برنامه دارد که منشأ آن هنوز بررسی می‌شود. سبک‌های مجاز در هر دو موتور کار کردند و سبک دلخواه همچنان رد شد |
| dependency | pnpm audit --prod پس از override محدود esbuild: صفر advisory |
| secret | Gitleaks8.30.1 digest رسمی؛ شش commit موجود، بدون یافته؛ diff نهایی قبل push جدا بررسی می‌شود |
| CI/container/restore/load | فعلاً نتیجهٔ کامل اجرا ندارند؛ script/config به معنی قبولی نیست |

پس از اصلاح CSP، چهار مورد مرورگر دوباره موفق شدند: Chrome 24.0s/2.9s و WebKit 33.5s/5.3s. رخداد تشخیصی WebKit مانع جریان آزموده‌شده نبود؛ نسبت‌دادن آن به ابزار تا آزمایش کنترل جدا نتیجهٔ قطعی محسوب نمی‌شود.

راهنمای تکرار: `pnpm lint`، `pnpm typecheck`، `pnpm test` با env/DB جدا، `pnpm build` و مرورگر روی production server. برای این workstation، `E2E_CHROMIUM_CHANNEL=chrome` و انتخاب پروژه‌های `chromium` و `webkit` استفاده شدند؛ Firefox دانلودی با `spawn UNKNOWN` پیش از شروع مرورگر شکست خورد و علت نامعلوم است. همهٔ موتورهای Linux در CI باید جدا اجرا و گزارش شوند.

اعداد واقعی پذیرش در [ماتریس QA](qa/ACCEPTANCE_MATRIX.md)، خروجی بی‌اطلاعات حساس در [خلاصهٔ مرورگر](qa/browser-summary.json)، جزئیات بک‌اند در [CHECKS](backend/CHECKS.md) و متن فارسی در [بازبینی](persian/REVIEW.md) آمده‌اند. trace/password/OTP/کلید/dump به Git یا artifact عمومی منتقل نمی‌شوند.

موارد اجرا نشده: مرورگر Firefox قابل اجرا/دستگاه واقعی، zoom200% کامل، broad UI matrix پنل، بررسی مستقل امنیت کامل/ASVS، PSP/SMS واقعی و sandbox حساب، CDN/network ایران، restore کامل، alert/offsite و اندازه‌گیری ۲۰۰VU/RPS. وضعیت این‌ها با تکمیل کار مستقل به‌روز می‌شود؛ نامعلوم بودن دادهٔ کسب‌وکار جایگزین نقص پیاده‌سازی نیست.
