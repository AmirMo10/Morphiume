# بازبینی مستقل قرارداد image آزمایشی

تاریخ: ۲۰۲۶-۱۰-۱۲. دامنه: خواندن مستقل workflow، Dockerfile، closure و launcher و اجرای QA روی standalone Windows. QA در این بازبینی Docker Linux را اجرا نکرد؛ موفقیت image جاری، Grype، migration/seed کانتینری، heartbeat/shutdown و publish باید از job واقعی همان commit ثبت شود. موفقیت CI قبلی برای source `7f403a9` نتیجهٔ image فعلی نیست.

## قرارداد مشاهده‌شده در source

- image با Node مستقیم، UID/GID1001، filesystem فقط‌خواندنی، cap-drop و no-new-privileges اجرا می‌شود. runtime JSON mode0600 و media directory mode0700 در CI به UID1001 داده می‌شوند؛ cache و tmp روی tmpfs جدا هستند.
- کلیدهای مشتری/مدیر/mock از همان `.env.local` مصنوعی به JSON منتقل می‌شوند؛ مرورگر همان secret را خصوصی می‌خواند. bootstrap فقط برای seed تزریق می‌شود. launcher محیط staging و mockهای کنترل‌شده را الزام می‌کند؛ مقدار secret وارد build نمی‌شود.
- CLIهای migrate/seed/worker bundle هستند و closure خارجی را همراه `server-only` با شرط react-server دارند؛ source تست حضور ابزارهای build/package manager را رد می‌کند. migrate و seed پیش از readiness و browser اجرا می‌شوند. worker heartbeat پس از tick و exit0 پس از SIGTERM بررسی می‌شود.
- readiness و مسیر کامل مرورگر رسانه، auth و commerce را از image اجرا می‌کنند. وجود فایل native به‌تنهایی کافی نیست: بسته‌بندی standalone ابتدا DLLهای Sharp را جا انداخت؛ پس از اصلاح، upload/encode/fetch واقعی Windows در هر دو موتور موفق شد. اصل Linux/musl هنوز باید همان job واقعی را بگذراند.

## یافته و اصلاح قرارداد انتشار

نسخهٔ اولیه یک build را با Grype و مرورگر پذیرفت، سپس build دوم را بدون مقایسه منتشر می‌کرد. coordinator قرارداد را اصلاح کرد: candidate با provenance/SBOM زیر tag موقت منتشر می‌شود، سپس `ci-image-identity.mjs` revision محلی را با `GITHUB_SHA` و config digest تنها platform Linux/amd64 را با Docker image ID پذیرفته‌شده برابر می‌خواهد. ورودی promotion با manifest digest pin می‌شود؛ tag نهایی فقط پس از تطبیق ساخته و دوباره بررسی می‌شود. artifactهای تولیدی داخل `.local` خارج از Docker context نگه داشته می‌شوند. بازبینی source این شکاف هویت محتوا را بسته می‌بیند؛ اجرای واقعی و artifact `image-identity.json` هنوز لازم است.

## حدود شواهد و مرحلهٔ بعد

CI مصنوعی برای migration و مرورگر یک PostgreSQL role آزمایشی دارای DDL دارد؛ این جای آزمون app با نقش DML واقعی، secretهای جدا، media سرور، پشتیبان رمزگذاری‌شده و restore را نمی‌گیرد. heartbeat نشان‌دهندهٔ tick اخیر است و تضمین خالی‌شدن تمام صف یا موفقیت سرویس بیرونی نیست. staging باید با image digest پذیرفته‌شده بالا بیاید؛ سپس retained purchase/media fixture روی tunnel۳۱۰۰، restore جدا و اندازه‌گیری مستقل بار/صف/منابع اجرا شوند. هیچ ظرفیت ۲۰۰VU یا آمادگی فروش واقعی از این بازبینی نتیجه نمی‌شود.

## منبع پیشنهاد نشانی

بررسی مستقیم [cities.json](https://github.com/tafakoritech/Provinces-and-Cities-of-Iran-Dataset/blob/e00e125d10259f6f3a5e4802cd336cef89258222/cities.json)، [provinces.json](https://github.com/tafakoritech/Provinces-and-Cities-of-Iran-Dataset/blob/e00e125d10259f6f3a5e4802cd336cef89258222/provinces.json) و [MIT](https://github.com/tafakoritech/Provinces-and-Cities-of-Iran-Dataset/blob/e00e125d10259f6f3a5e4802cd336cef89258222/LICENSE) این commit ثابت، hashهای manifest و ۳۱ استان/۱۱۱۹ شهر با صفر اختلاف رابطه را تأیید کرد. snapshot پیشین تهران/تبریز/کرج/رشت/شیراز/کرمان را در رکورد city نداشت؛ source جدید هر شش را صریح دارد. suite۱۲تایی مستقل در tests/unit/shared قرارداد source و رابطهٔ پیشنهاد استان/شهر را نگه می‌دارد. این دادهٔ عمومی گواهی مرزهای رسمی روز یا پوشش شرکت ارسال نیست؛ fallback نشانی متنی باید حفظ شود.
