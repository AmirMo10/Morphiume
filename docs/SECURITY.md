# وضعیت امنیت و حدود شواهد

در پذیرش Cart، Gitleaks دو بار publicaccessProfileSHA256 نسخه613 را در guardهای restore به‌اشتباه genericAPIkey یافت. `.gitleaks.toml` همهٔ قواعد پیش‌فرض را گسترش می‌دهد؛ تنها همان مقدار دقیق3a246e… در دو guard و یک گزارش JSON دقیق و با شرطAND مستثناست. هیچ rule/file/commit کلی غیرفعال نمی‌شود. `scripts/verify-gitleaks-config.mjs` با باینری واقعی، سه pinمجاز و چهار canaryغیرcredential را می‌سنجد: مقدار متفاوت، تغییر یک حرف و همان مقدار در مسیر دیگر همچنان کشف شدند؛ **۷/۷ واقعی** و scopedlint0. runnerاولdir به‌علت pathشامل پیشوند با git-relativepolicy سازگار نبود؛ هفت مخزن Git مستقلِ خصوصی runnerدرست‌اند. اسکن اولیه841.32KB دو falsepositive داشت؛ با pin/path دقیق همان محدوده بدون یافته شد. اسکن نهایی تمام checkpoint پس از افزودن همین config/gate دوباره ثبت می‌شود. [قالب رسمی Gitleaks](https://github.com/gitleaks/gitleaks#configuration) در۲۰۲۶-۱۰-۱۲ بررسی شد.

نشست مشتری و مدیر، secret و cookie جدا دارند. OTP در DB hash می‌شود و صندوق Mock رمزگذاری‌شده است؛ انقضا، مصرف، سقف تلاش و فاصلهٔ ارسال در تراکنش کنترل می‌شوند. MFA واقعی TOTP و recovery بومی آزموده شدند. نقش/حساب/نشست در عملیات حساس از DB جاری خوانده می‌شوند؛ دادهٔ خصوصی no-store و mutation نیازمند Origin دقیق است.

بارگذاری raster محدود decode و re-encode می‌شود؛ SVG ورودی قبول نیست و اصل فایل مسیر عمومی ندارد. CSP با nonce، منع frame/object و headerهای پایه در production build اعمال می‌شود. منبع قیمت، موجودی و صحت پرداخت فقط سرور است و اثرهای مالی/انبار با قید یکتا و تراکنش حفظ می‌شوند.

عامل مستقل امنیت threat model و چند آزمون مالی/مجوز را اجرا کرد و رقابت سقف سفارش را پیدا کرد؛ اصلاح آن و بازتولید مورد قبول شدند. آن عامل پیش از تکمیل بررسی دو بار با پیام بازبینی خودکار «possible cybersecurity risk» متوقف شد؛ تلاش مجدد یا ادعای بررسی کامل/گواهی ASVS انجام نشده است. [Threat model و محدوده](security/THREAT_MODEL.md) و [شواهد واقعی QA](qa/ACCEPTANCE_MATRIX.md) قابل بررسی‌اند.

اسکن dependency تولید پس از override محدود esbuild صفر advisory گزارش کرد. Gitleaks 8.30.1 با digest رسمی دانلود شد و تاریخچهٔ Git موجود را بدون یافته بررسی کرد؛ diff آمادهٔ commit نیز پیش از push اسکن می‌شود. CI اسکن container با Grype پین‌شده دارد؛ نتیجهٔ آن هنوز باید از اجرای واقعی ثبت شود. هیچ‌کدام تضمین نبود آسیب‌پذیری نیستند.

قبل از فروش واقعی، بررسی مستقل کامل، قرارداد providerها، کنترل TLS/شبکه، آزمون restore/alert و ورود مالک واقعی لازم است. live فعلاً startup gate صریح دارد و حتی با پرکردن متغیرها خودکار فعال نمی‌شود.
