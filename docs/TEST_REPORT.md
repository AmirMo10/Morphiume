# آزمون‌های واقعاً اجراشده

## بازطراحی ۱۴ اکتبر ۲۰۲۶؛ پذیرش محلی

۶۴۱ آزمون واحد، lint/typecheck، build تولیدی و بسته‌بندی standalone و ۳۷ guard عملیاتی تازه موفق شدند. نخستین اجرای ۸۴ مرورگر، ۶۹ موفق و ۱۵ ناموفق داشت؛ ۹ شکست از تنظیم صریح خاموش تحلیل‌ها در QA تازه، ۳ از فیلتر موبایل بدون JavaScript و ۳ از فرض اشتباه navigation در آزمون تازه بودند. پس از اصلاح، ۱۸ مورد هدفمند در Chromium، Firefox و WebKit، بدون شکست، skip، flaky یا retry آزمون گذشتند. مسیر کامل خرید در هر سه موتور در اجرای اول موفق بود. ۱۵ بررسی واقعی توسعه برای علاقه‌مندی و StrictMode نیز یک‌بار موفق شدند. بزرگ‌نمایی واقعی ۲۰۰٪، RTL، عرض‌ها و focus جدا بررسی شدند؛ سخت‌افزار گوشی آزموده نشد.

[گزارش نتایج، شکست‌های حفظ‌شده و حدود](qa/REDESIGN_EXECUTION.md)، [JSON مجاز](qa/redesign-local-safe.json). CI جدید و استقرار نسخهٔ تازه هنوز از این شواهد محلی نتیجه نمی‌شوند. نتایج ACF8 و نسخه‌های قبلی در ادامه تاریخی‌اند.

مشاهدهٔ جاری در 2026-10-14T07:53:23.596075+00:00: تصویر تأییدشدهٔ `acf8e96` روی محیط آزمایشی `192.168.240.51` مستقر و برنامه/کارگر سالم‌اند. مسیر پنل تا خرید، verify آزمایشی، یک تغییر موجودی و رهگیری در Chromium، Firefox و WebKit، سه مورد از سه و ۲۰ بررسی در هر مورد، بدون تکرار آزمون موفق شد. موجودی هر fixture از ۳ به ۲ و رزرو به صفر رسید؛ سه رسید اصلی و سه ارسال ثبت شدند. پشتیبان تازه واقعاً در محیط جدا بازیابی و شش بررسی بومیِ کسب‌وکار به‌علاوهٔ تصویر گالری پذیرفته شد. دو timer پایش/پشتیبان فعال و enabled هستند. [گزارش یکپارچه، خطای collector اصلاح‌شده و حدود شواهد](ops/ACF8_STAGING_EXECUTION.md)، [گزارش مستقل خرید](qa/ACF8_STAGING_T25_EXECUTION.md).

CI ACF8 [38412817440](https://github.com/AmirMo10/Morphiume/actions/runs/38412817440) موفق است؛ CI commit ابزارها `c7b1f0e` [38525159078](https://github.com/AmirMo10/Morphiume/actions/runs/38525159078) نیز موفق شد. برنامهٔ مستقر و checkout سرور دقیقاً ACF8 باقی ماندند؛ commitهای ابزار/گزارش بعدی main نسخهٔ برنامه را عوض نمی‌کنند. پرداخت و پیامک واقعی، TLS، offsite/PITR و RPO عمومی هنوز پذیرفته نشده‌اند.

## شواهد پیشین؛ تاریخ‌های زیر تاریخی‌اند

مشاهدهٔ جدید منبع `6f59e35`: verify با ۸۸۶ آزمون Vitest و ۷۸ مرورگر موفق، image با ۷۷ از ۷۸ ناموفق؛ تنها شکست عنوان عمومی در WebKit. پیش از انتشار اصلاح تشخیصی، lint و typecheck و سه نمونهٔ native همان آزمون در ۵۳٫۲۰۲۷۸۳ ثانیه موفق شدند. شش نمونهٔ کنترل‌شدهٔ فرم نیز مستقل موفق بودند و پذیرش native محسوب نمی‌شوند. علت اولیه نامعلوم است؛ [نتیجه، مراحل نرسیده و محدودیت شواهد](CI_6F59_EXECUTION.md) مبنای گزارش این اجراست، نه موفقیت CI بعدی.

## جمع‌بندی پذیرفته‌شده، ۱۲:۵۹ UTC، ۱۳ اکتبر ۲۰۲۶

این جمع‌بندی از شواهد اجراهای مستقل تهیه شده است؛ برای نوشتن آن آزمون، درخواست سرور یا عملیات پایگاه تازه‌ای اجرا نشد. منبع برنامهٔ مستقر E4، یعنی `e4bed691dc938a9c0f79022696d24f063ad97724`، است؛ آخرین main تأییدشده در ساعت مبنا `fbefdc0793e7ba0ad985b90033316c11edd5c440` شامل ابزارها و گزارش‌های عملیاتی بعدی نیز هست.

| اجرا | نتیجهٔ واقعی | دامنه و محدودیت |
| --- | --- | --- |
| CI منبع E4 | ۸۳۷ آزمون منطق و پایگاه داده، سپس ۷۸ مورد مرورگر؛ ۲۶ مورد در هر یک از Chromium، Firefox و WebKit | اجرای لینوکس همان منبع؛ صفر مورد ردشده، کنارگذاشته‌شده، ناپایدار یا تکرار آزمون |
| تصویر بسته‌بندی‌شدهٔ E4 | ۷۸ مورد مرورگر در اجرای مستقل، همراه بررسی راه‌اندازی، رسانه، ورود و کارگر | اجرای مجدد همان سناریوها؛ با ۷۸ اجرای منبع به‌عنوان ۱۵۶ سناریوی یکتا جمع نمی‌شود |
| پذیرش هدفمند محلی لینوکس | اعلان‌ها ۱۲ از ۱۲ و تحلیل‌ها ۹ از ۹؛ در مجموع ۲۱ مورد موفق | هشت پاسخ واقعی ۴۲۹ با انتظار محدود و یک تلاش دوم موفق؛ تکرار آزمون صفر، پاسخ ۵۰۰ در لاگ گردآوری‌شده صفر؛ برابری سراسری ردیف‌های نامرتبط اندازه‌گیری نشد |
| ارتقای سرور به E4 | دو مهاجرت افزایشی، ۱۳ مهاجرت و ۵۳ جدول؛ حفظ داده و ساختار ۴۹ جدول پیشین پذیرفته شد | مقایسه در پنجرهٔ توقف نویسنده‌ها بود؛ همهٔ ردیف‌های پایگاه پس از شروع کارگر یا پایگاه اصلی رزروشده را پوشش نمی‌دهد |
| T25 حفظ‌شده روی سرور E4 | یک مورد Chromium در ۱۷٫۲۱۹۷۸۵ ثانیه، بدون تکرار، رد یا کنارگذاری | ورود و خرید کنترل‌شده، رسید، موجودی و رهگیری واقعی؛ یک ۵۰۳ تزریق‌شدهٔ رابط از هشت پاسخ واقعی سرور جداست |
| بازیابی جدا از پشتیبان E4 پس از T25 حفظ‌شده | شش بررسی واقعی HTTP از شش، در ۳۱٫۷۱۷۰۵۲۴ ثانیه؛ تکرار مجموعه صفر | زمان کامل تمرین بازیابی ۵۱۶٫۳۹۰۸۳۵ ثانیه بود؛ این بررسی HTTP یک مجموعهٔ تازهٔ مرورگر نیست و offsite یا PITR را ثابت نمی‌کند |
| مرورگرهای واقعی روی IP خصوصی | Chromium، Firefox و WebKit لینوکس، سه مورد از سه، ده بررسی در هر موتور و مدت ۵۶٫۹۳۹۸۹۷ ثانیه؛ تکرار، کنارگذاری و شکست صفر | روی `192.168.240.51` و مستقل از CI و تونل بار؛ پذیرش حفاظت مسیر در ۱۱:۱۷:۰۴٫۵۴۰ UTC |
| سلامت و پشتیبان زمان‌بندی‌شده | یک شروع مستقیم برای هر سرویس؛ چرخهٔ واقعی سلامت ۳۰٫۹۱۵۸۰۴ و پشتیبان ۱۵۲٫۷۷۹۱۸۴ ثانیه؛ دو timer در ۱۱:۵۱:۴۰٫۹۴۹۱۵۲ UTC فعال و enabled | چرخه از رویدادهای معتبر systemd است؛ تحویل همهٔ اجراهای خودکار بعدی و بازیابی همین پشتیبان تازه هنوز ثابت نشده‌اند |
| بازآزمایی مستقل تحلیل‌ها | ۱۵ مورد کشف‌شده از ۱۵، در ۳۸٫۸۱۰۶۳۶۸ ثانیه، بدون شکست، کنارگذاری یا تکرار آزمون | روی schemaهای موقت پایگاه هدف؛ هر ۴۹ جدول عمومی قبل و بعد برابر و schema موقت باقی‌مانده صفر؛ ورود بومی یا مرورگر اجرا نشد |
| ساخت حساب شخصی صاحب پروژه در محیط آزمایشی | ایجاد واقعی در ۱۲:۳۷:۳۸٫۹۶۳ UTC؛ فقط سه ردیف user/account/role افزوده شد؛ ۲۳۵ ردیف احراز هویت قبلی و ۴۶۹۴ ردیف مالی در ۱۴ جدول بدون تغییر | در زمان ساخت، حساب قدیمی تغییر نکرد و نشست، MFA یا مجوز عامل دوم ایجاد نشد؛ بررسی بومی بعدی جدا در ردیف زیر ثبت شده است |
| بررسی بومی رمز و الزام MFA حساب تازه | در ۱۲:۴۶:۳۷٫۲۶۷ تا ۱۲:۴۶:۳۸٫۰۱۸ UTC: ورود با رمز ۲۰۰، نشست ۲۰۰ با الزام MFA و بدون مجوز، اعلان مدیریتی پیش از MFA برابر ۴۰۳، خروج ۲۰۰ | نشست دقیق آزمون پس از خروج، factor و مجوز MFA هرکدام صفر؛ دادهٔ مالی تغییر نکرد. نخستین ورود و ثبت MFA توسط صاحب حساب و تأیید بیرونی ایمیل انجام نشده‌اند |
| اجرای کوچک بار | ۲ کاربر مجازی، ۶ سفر کامل، ۲۷ درخواست، ۲ خرید آزمایشی | خطای غیرمنتظره و درخواست ناموفق صفر |
| بار ۲۰۰ کاربر مجازی | ۲۵ دقیقه و ۹٫۷ ثانیه؛ ۱۲۰۶ ثانیه حضور پیوسته در سطح ۲۰۰؛ ۱۷۹۹۶ سفر، ۵۵۳۸۵ درخواست و ۳۴۹ خرید | صدک ۹۵ خواندن ۷۷٫۳۰۹۹۸ و ثبت سفارش ۶۸٫۰۱۲۳ میلی‌ثانیه؛ خطای غیرمنتظره صفر؛ workload کنترل‌شده و مسیر تونل SSH |
| افزایش مستقل نرخ درخواست | حدود ۱۲ دقیقه، افزایش تا هدف ۱۲۰ درخواست در ثانیه و کاهش به صفر؛ ۳۹۶۰۰ درخواست | صدک ۹۵ خواندن ۵۰٫۰۶۷۹۲ میلی‌ثانیه و خطای صفر؛ فقط کاتالوگ؛ مرحلهٔ پایدار مستقل ۱۲۰ و نقطهٔ اشباع اندازه‌گیری نشدند |
| آزمون محدود دوم کاتالوگ | ۳۵۹۳۰ iteration و ۳۵۹۳۲ درخواست؛ نمونه‌های ۱۲۰: ۷۲۰۰ خواندن و صدک ۹۵ برابر ۲۵٫۹۲۶؛ نمونه‌های ۲۴۰: ۱۴۴۰۰ و ۳۶٫۵۳۵ میلی‌ثانیه | کاتالوگ گرم دو‌محصولی؛ تکمیل مستقل ۶۰ ثانیهٔ ۲۴۰ اثبات نشده؛ مرحلهٔ ۴۸۰ ناتمام و حد تأخیر رد شد؛ exit برابر ۹۹ |

شواهد مستقل: [تصویر و CI پذیرفته‌شدهٔ E4](ops/E4_ACCEPTED_IMAGE_EVIDENCE.md)، [۲۱ مورد محلی لینوکس](qa/LINUX_E4_FOCUSED_NATIVE_EXECUTION.md)، [ارتقای سرور](ops/E4_RUNTIME_CUTOVER_EXECUTION.md)، [T25 سرور](qa/E4_SERVER_RETAINED_T25.md)، [بازیابی](ops/E4_RESTORE_EXECUTION.md)، [ظرفیت](qa/E4_CAPACITY_EXECUTION.md)، [IP خصوصی](qa/E4_PRIVATE_PREVIEW_EXECUTION.md)، [زمان‌بندی‌ها](ops/E4_SCHEDULE_EXECUTION.md)، [تحلیل‌ها](qa/ANALYTICS_REGRESSION_EXECUTION.md)، [حساب صاحب پروژه](ops/STAGING_OWNER_HANDOFF.md) و [آزمون محدود کاتالوگ](qa/E4_CATALOG_SATURATION_EXECUTION.md).

در پایان بار، ۳۵۱ سفارش و ۳۵۱ تعهد موجودی با پرداخت تطبیق یافتند؛ ۱۹۹ SKU غیرخرید بدون تغییر بودند، موجودی SKU خرید ۹۹۶۴۹ و رزرو فعال صفر شد. پاک‌سازی فقط همان دادهٔ آزمون، ۲۰۰ محصول بایگانی‌شده، ۲۰۰ حساب غیرفعال و صفر نشست باقی‌مانده را ثبت کرد؛ سفارش، رسید، ارسال و دفتر موجودی حذف نشدند. ۳۴ ردیف مالی پیشین در ۱۴ جدول بدون تغییر ماندند؛ برابری همهٔ ردیف‌های ۵۳ جدول ادعا نشده است.

گزارش کامل لایهٔ ثبت درخواست برنامه برای بازهٔ ۰۹:۵۶:۴۵ تا ۱۰:۳۸:۳۴ UTC، بعداً در ساعت ۱۱:۰۲:۴۴٫۴۵۷ ثبت شد: ۹۶۲۳۶ خط و ۱۷۱۴۱۰۱۹ بایت، شامل ۹۴۸۳۱ پاسخ ۲۰۰ و ۳۵۱ پاسخ ۲۰۱، بدون پاسخ خطا یا کد خطای ثبت‌شده و بدون فعال‌شدن محدودیت خروجی. شمار درخواست برنامه با k6 یکسان نیست؛ سلامت و درخواست‌های عملیاتی مجاز نیز ثبت شدند. نتیجه فقط این بازه را پوشش می‌دهد.

همهٔ پرداخت‌ها و پیامک‌های این بار کنترل‌شده و آزمایشی بودند. تصاویر، CDN، مسیر حفاظت‌شدهٔ IP خصوصی، شبکهٔ ایران، دستگاه واقعی و رقابت آخرین واحد در این بار آزموده نشدند. نمونه‌برداری منابع همهٔ اوج‌های بین نمونه‌ها، همهٔ انتظارهای قفل یا منابع میزبان سرور را اندازه نمی‌گیرد؛ CPU کل میزبان مولد در یک نمونه به ۱۰۰٪ رسید و علت آن به k6 نسبت داده نشده است.

پذیرش مرورگر IP خصوصی در ۱۱:۱۰:۱۳٫۴۴۶۷۱۲ UTC پایان یافت: Chromium در ۱۷٫۱۵۴، Firefox در ۱۶٫۹۱۲ و WebKit در ۱۴٫۹۲۵ ثانیه. هر موتور هفت پاسخ واقعی ۲۰۰ و یک پاسخ عمدی واقعی ۴۰۰ داشت؛ پاسخ واقعی ۴۲۹ صفر بود. یک ۵۰۳ در هر موتور تزریق کنترل‌شدهٔ رابط بود و اختلال واقعی سرویس را ثابت نمی‌کند.

بررسی جداگانهٔ فقط‌خواندنی حفظ ۴۶۴۶ ردیف مالی قبلی در ۱۴ جدول، سه خرید و سه رسید و ارسال و اثر موجودی تازه را تأیید کرد. سه محصول بایگانی، موجودی هرکدام ۲ و رزرو صفر بود؛ نه حساب موقت غیرفعال و نشست موقت باقی‌مانده صفر شد. مشتری خرید حفظ‌شده و نشست اصلی او بدون تغییر ماندند. این مقایسه، ادعای برابری همهٔ ردیف‌های همهٔ جدول‌ها نیست.

بررسی واقعی نگه‌داری مسیر پذیرفته‌شده در ۱۱:۱۸:۲۹٫۱۹۵۷۸۱ UTC بدون تغییر برنامه، پراکسی یا پروفایل موفق بود؛ انقضای واقعی و قطع دسترسی آزموده نشدند. دو پیش‌بررسی ناموفق مدیر سرویس و دو تلاش ناموفق هم‌بستگی گزارش مالی محفوظ‌اند؛ اصلاح‌ها باعث تکرار مرورگر یا تغییر داده نشدند. در پیش‌بررسی سوم، منبع و مدیر واقعی پذیرفته شدند و انتقال وضعیت ثبت‌نشده به‌درستی رد شد. پنجرهٔ مرورگر در ۱۱:۱۹:۰۶٫۴۹۸ UTC آزاد شد؛ این پذیرش به محیط خصوصی با حفاظت مسیر تعلق دارد و TLS یا انتشار عمومی را تأیید نمی‌کند.

نصب نخست زمان‌بندی پیش از شروع سرویس رد شد؛ مشاهدهٔ واحد غیرفعال systemd علت ثبت‌شده بود. اصلاح محدود، پروندهٔ پذیرش تازه و اندازه‌گیری واقعی یک‌باره موفق شدند؛ رکورد شکست و snapshotهای قدیمی محفوظ ماندند و نصب نخست دوباره اجرا نشد. در سلامت، هشدار صفر و readiness برابر ۲۰۰ بود؛ پشتیبان رمزگذاری‌شده تطبیق یافت و نویسنده‌ها بازگشتند. اوج حافظهٔ نمونه‌برداری‌شدهٔ سلامت ۴۵۸۸۳۳۹۲ و پشتیبان ۴۶۴۳۶۳۵۲ بایت بود؛ این عدد اوج کل میزبان نیست. یک trigger خودکار سلامت دیده شد، اما تکمیل آن از پذیرش یک‌باره نتیجه گرفته نشده و تحویل خودکار پشتیبان هنوز مشاهده نشده بود.

در بازآزمایی تحلیل‌ها، آزمون محصول ۱۵ از ۱۵ موفق بود؛ بررسی بیرونی شواهد ابتدا به‌اشتباه انتظار ۱۶ داشت و بعد از موفقیت فرایند آزمون با exit صفر، فرایند والد را رد کرد. شمار ۱۵ با تعریف‌های آزمون در هر دو commit و گزارش اجرا تثبیت شد؛ اجرای موفق پایگاه تکرار نشد. شکست بررسی شمارش و خطای syntax بازرسی اولیه محفوظ‌اند. نمایش آفلاین دقت میلی‌ثانیه‌ای parser، علت قطعی همهٔ شکست‌های قبلی CI را ثابت نمی‌کند؛ assertionها ضعیف نشدند و منطق analytics تغییر نکرد.

**دو timer پس از benchmark محدود در ۱۲:۳۱:۲۴٫۴۴۰۵۴۹ UTC واقعاً به وضعیت قبلی فعال بازگشتند؛ enabled بدون تغییر ماند.** نسخهٔ نخست به علت نمونه‌بردار متوقف شد و شاهد اشباع نیست. نسخهٔ دوم خاتمه یافت: حد نمونه‌های ۱۲۰ و ۲۴۰ گذشت؛ مرحلهٔ ۴۸۰ فقط ۴۸۸۵ خواندن داشت و ناتمام ماند، با صدک ۹۵ برابر ۵۸۳٫۳۴۹۵۸ میلی‌ثانیه. k6 خودکار پس از عبور از حد تأخیر کل و مرحلهٔ ۴۸۰، با exit ۹۹ در ۱۲:۳۰:۳۵٫۳۰۵ UTC پایان یافت؛ صدک ۹۵ کل ۵۰۸٫۳۴۲۴۶ میلی‌ثانیه بود. خطای ثانویهٔ نمونه‌بردار در ۱۲:۳۰:۳۶٫۷۹۱ و ثبت درخواست توقف در ۱۲:۳۰:۳۶٫۷۹۲، پس از پایان child بودند؛ کنترل توقف و hard-kill اجرا نشدند. علت دقیق خطای محلی PowerShell نامشخص است و برچسب اولیهٔ supervisor علت اصلی نبود. مرحلهٔ پایدار ۴۸۰ یا سقف دقیق اشباع ادعا نمی‌شود. هر ۴۶۹۴ ردیف مالی پیشین در ۱۴ جدول محفوظ، هویت برنامه و پروفایل ثابت و readiness برابر ۲۰۰ بود؛ Root آزمون را دوباره اجرا نمی‌کند.

در snapshot قطعی **۱۲:۵۹:۱۵ UTC**، CI [8f8c3e3](https://github.com/AmirMo10/Morphiume/actions/runs/38394655914) هر دو job verify `115286689333` و تصویر `115295444684` را با completed/success و صفر مرحلهٔ ردشده پایان داده بود. CI [fbefdc0](https://github.com/AmirMo10/Morphiume/actions/runs/38396094403)، job verify شمارهٔ `115291568811`، نیز completed/success داشت: secrets ۲۰ از ۲۰، lint، typecheck، آزمون‌ها، audit، build و ۷۸ Playwright در ۱۷٫۸ دقیقه موفق بودند؛ job تصویر `115300756366` در همان مشاهده در مرحلهٔ ۹ جاری بود و کل این اجرای CI موفق معرفی نمی‌شود. شکست‌های قبلی `a063`، `5d7` و `8050` پس از اصلاح صرفاً fixture و آزمون canary پاک نشده‌اند؛ منبع برنامه، schema و وابستگی‌های E4 تغییر نکرده‌اند. درگاه و پیامک واقعی، دامنه و TLS معتبر، پشتیبان بیرونی، PITR، دریافت هشدار، دستگاه و شبکهٔ ایران و RUM هنوز نتیجهٔ اجرایی ندارند.

در گزارش نهایی کاتالوگ، خطای HTTP، خطای بحرانی و dropped iteration هر دو اجرا صفر بودند، اما حد تأخیر نسخهٔ دوم رد شد. ۳۶۲۴۴ wrapper کامل سرور در v2 همگی ۲۰۰ و بدون cap یا truncation ثبت شدند؛ این جمعیت با ۳۵۹۳۲ درخواست k6 یکی نیست. صدک ۹۵ داخلی برنامه ۱۳۴ و مشتری ۵۰۸٫۳۴۲ میلی‌ثانیه بود؛ تفاضل این دو، هزینهٔ اندازه‌گیری‌شدهٔ شبکه یا پراکسی نیست. برچسب مرحله از ساعت دیواری مولد می‌آید و ساعت داخلی k6 ثبت نشده؛ رعایت تعداد و تأخیر نمونه‌های ۲۴۰، اثبات مستقل مرحلهٔ پایدار ۶۰ ثانیه‌ای نیست. پیکربندی ۴۰۰ VU، اوج نمونهٔ ۲۷۲ و dropped صفر نیز گلوگاه یکتا یا اعتبار کامل مولد را ثابت نمی‌کنند. دامنه، کاتالوگ گرم دو‌محصولی و مسیر حفاظت‌شدهٔ خصوصی است.

اسکن تصویر E4 سه یافتهٔ متوسط و هیچ یافتهٔ زیاد یا بحرانی ثبت کرد. بررسی مستقل کامل امنیت با رد خودکار اجرا و پیام «possible cybersecurity risk» ناتمام ماند؛ نتیجهٔ ASVS یا امنیت کامل وجود ندارد. شکست قبلی ۷۷ از ۷۸ تصویر، خطای کوکی WebKit ویندوز، پاسخ‌های ۵۰۰ قدیمی و توقف‌های پیش‌بررسی زیر محفوظ‌اند؛ موفقیت تازه علت همهٔ شکست‌های قبلی را ثابت نمی‌کند.

## سابقهٔ اجراهای زمان‌دار

گزارش‌های زیر شواهد و کارهای باقی‌مانده را در زمان خود ثبت می‌کنند. برای وضعیت فعلی، جمع‌بندی بالا و سند مستقل هر اجرا مبنا هستند؛ تعداد اجراهای هدفمند، جامع و تکرار همان سناریوها با هم جمع نمی‌شود.

۱۳ اکتبر، ۰۹:۱۲ UTC: [بازیابی واقعی E4](ops/E4_RESTORE_EXECUTION.md) با6/6بررسی HTTP،31717.0524ms، صفرsuite retry و دو پاسخ ورود200 پذیرفته شد. یک callback عمدی اثر مالی اضافه نداشت؛ هشت فایل رسانه و شمارهای تجاری پشتیبان تطبیق یافتند. Root زمان کامل516.390835s و فاصلهٔ fixture/capture1657.188s را ثبت کرد، محیط بازیابی را متوقف و app/worker اصلی را سالم برگرداند. ابزار همراه39/39خالصLinux در0.167s و ابزار تجاری105/105خالصWindows در326.8858ms گذشتند؛ این اعداد با آزمون واقعی شش‌تایی جمع نمی‌شوند. جزئیات شکست پیش‌بررسی‌ها و محدودیتoffsite/PITR در گزارش محفوظ است.

۱۳ اکتبر، ۰۸:۴۲ UTC: [T25 واقعی سرور E4](qa/E4_SERVER_RETAINED_T25.md) یک آزمون موفق در 17219.785ms با صفر retry/skip/flaky داشت. هشت پاسخ واقعی احراز هویت و یک 503 تزریق‌شدهٔ UI جدا طبقه‌بندی شدند. audit نهایی حفظ ۱۲ ردیف مالی قبلی در ۱۰ جدول، یک receipt/shipment/stock commit، موجودی۲، رزرو۰ و پاک‌سازی حساب‌های موقت را تأیید کرد. مشاهدهٔ اولیهٔ helper خصوصی به‌علت نام جدول قدیمی شکست خورد؛ اصلاح فقط‌خواندنی و بدون تکرار native یا تعمیر داده موفق شد.

Root دادهٔ نگه‌داری‌شده را با SHA256 تأیید و در 08:38:22Z ثبت کرد؛ خطای ابتدایی بررسی شکل pointer پروفایل پیش از پذیرش اصلاح شد. پشتیبان واقعی E4/schema13 در `20261013T084014Z-8e5fa45e` ایجاد شد: manifest `d3163b5964e4711be35dbdfce9a9f6fe8c786fd2ecd5be48452cae310ebd24d1`، رسانه۷۳۶بایت، زمان کل driver 34.862711s و فاصلهٔ توقف تأییدشده تا سلامت مجدد20.435473s. app/worker دوباره سالم‌اند؛ بازیابی و offsite هنوز تأیید نشده‌اند.

تصحیح شمارش CI در۰۸:۱۹ UTC: عنوان قبلی native540/539 شامل سه پاسخ503شبیه‌سازی‌شدهٔ مرورگر درT25هرrun بود. شمارش خام ثابت است؛540/539مشاهدهٔ client، شامل3UIinterception و537/536مشاهدهٔ دیگرauth. این503ها آزمون مدیریت خطایUIهستند، نه شاهد outageواقعیSMS/سرور. [هویت و دامنهٔ اصلاح](ops/E4_ACCEPTED_IMAGE_EVIDENCE.md).

## اجرای واقعی ارتقای runtime، ۰۸:۰۵ UTC

- Prepare62.679802913s/exit0: writerمتوقف، backupold613/591 و backupOps68؛ ciphertextDB120662B/media720B، فقطintegrity/header ثابت‌شده و decrypt/restoreتازه هنوزunrun.
- BeforeRR/DML49table/11history،0.772435037s؛ migrateowneronly33.212320675s/no seed؛ afterRR/DML53/13،0.960155648s/accepted=true. همه49oldcolumnrowmultiset/catalog/ACL/sequences/first11history برابرند و addonspristine؛ این equalityهدفruntime در پنجرهٔ متوقف است، نه DBاصلی یا پس ازactivation.
- Activation37.475751705s/exit0/committed با recomputeواقعیnetworknone، pairedE4appworker وready200؛ old613resumeForbidden. Postreadonly07:47:01Z هردوhealthy/E4/engine3b78…/UID1001/readOnly/limits ثابت وreservedmountمحفوظ. ProfilecanonicalSHA67f77… ثبت شد.
- NativeT25رویسرورE4، encryptedE4backup/restore6checks/preview/200VU وtimerها هنوزپذیرفته‌نشده؛ شاهد قبلی613 وCI/localnative جای آن‌ها گزارش نمی‌شود.

## ابزار مرحله‌ای و preflight واقعی، ۰۷:۲۳ UTC

- RootLinuxregression:24/24companion، reported0.294s/wall0.5202044s؛121/121original+runtimeobserver،0fail/skip/wall0.722171232s؛19sourcecanonicalhashبدونتغییر. CompanionSHA30d521ea… و suiteSHAf204475c… برابر freezeعامل؛ puremock/disposablefiles، بدونDB/Docker/browser.
- آزمون واقعی image-only در07:12:09.571168Z،0.421130923s/exit0: stdinJSONattached وpg.Clientimportable، Node24.21/root/dropcaps/readOnly/networknone؛ هیچDB/app/workerشروع نشد. [منبع و gateها](ops/E4_RUNTIME_UPGRADE_DISPATCH.md).
- مرحله‌های واقعی writerstop/freshbackup/before49/migration0012+13/after53/activate هنوزاجرا نشده‌اند؛ puretests جایگزین آن‌ها نیستند.

## انتقال/load و نتیجهٔ کامل nativeمحلی، ۰۶:۵۶ UTC

- transferسهفایل/سرورwholeSHAدر06:52:25Z قبول؛ loadواقعی22.078s/exit0 باengine3b78… وproofv2/Ops68. Postloadفقط‌خواندنی06:56:52Z، app/worker613سالم و config/mount/limitsمحفوظ؛ هیچSQL/backup/migration/cutover انجام نشده. [هویت](ops/E4_ACCEPTED_IMAGE_EVIDENCE.md).
- notifications12/12،212972.323ms؛ analytics9/9،104808.029ms، هرengine4+3case،0skip/flaky/retry.182authPOST=174200+8429 باsinglewait/retryموفق؛1414خطserver/0wrapper500/capهاfalse،686فایل/envبدونتغییر. Auditفقط‌خواندنی13history/53table/generated0/DMLonly، چهارcleanupcategory0؛ window06:53:32Zآزاد. Globalunrelatedrowequality=unmeasured؛ [شاهد](qa/LINUX_E4_FOCUSED_NATIVE_EXECUTION.md).

## پذیرش واقعی تصویر و cache، ۰۶:۴۷ UTC

- E4CI:837/837دامنه و78/78verify و78/78packagednative، هرrun26caseبرای سهengine، صفرskip/flaky/retry. auth540/539responseشامل429/negative400/503؛ server5403/5414خط،0wrapper500، capهاfalse. [هویت و artifactها](ops/E4_ACCEPTED_IMAGE_EVIDENCE.md).
- سهZIP باwholeSHAمستقل دریافت؛ تصویر86184814بایت/15لایه/230841344uncompressed در verifierexit0پذیرفته، بدونDocker/transfer/load. GrypeسهMedium، هیچHigh/Critical؛ امنیت کامل/ASVS ادعا نمی‌شود.
- c749officialcache:ZIP525885995بایت/SHAمستقل؛ importerواقعی34.516875824s/exit0،733member/676file/15link. smokeسهengine/RTLقبول بدونappDB/nativeauth. [import](qa/BROWSER_TOOLCHAIN_IMPORT.md).
- LinuxnativeE4:notifications12/12 وanalytics9/9واقعاًpass؛ audit/cleanup/windowreleasepending. fingerprintسراسری قبل ثبت نشده و برابری ردیف‌های نامرتبط ادعا نمی‌شود.
- Serverupgrade/backup/preservation/migration/restore/privateIPpreview/200VU/RPS هنوزunrun؛ app613/Ops591/schema11محفوظ است.

## شاهد تازهٔ CI و قاعدهٔ فایل رسمی، ۰۵:۵۵ UTC

- PostgreSQL واقعیِ CI e4bed69: initialize محدود، owner migration، DML readback و seed موفق؛ مرورگر هنوز در اجرا و تصویر پذیرفته نشده.
- Linux همان source: frozen4.426s، readonlyDML13/53 در65.099ms، build39.488s،686فایل ثابت؛ شروع runtime/browser یا SQLmutation انجام نشد.
- قاعدهٔ content-bound فایل رسمی:137/137خالصLinux درwall1.478957177s،0skip/fail (16exporter+77runtime+44original). importer40/40Python در0.345s. فایل رسمی160بایت/hashمستقل؛ تغییر یک بایت رد می‌شود.
- cacheCI e4bed69 پس از downloadرسمی با lexicalguard شکست؛ نامentry629 و مقصدcopyعمومی ثابت نشده. officialartifact/import/nativeمحلی همچنان unrun.


## یکپارچه‌سازی اصلاح اعلان و حساب CI، ۰۵:۳۸ UTC

- QA factory correction:43.082s، ششjobواقعی/replay0، مالی/read/صف/رزرو محفوظ، cleanup و audit53/13؛ nativeAuthenticationProved=false.14counterexampleخالص Root1153.2733ms موفق؛ nativeاصلاح هنوز unrun.
- حسابCI و actualconfigCLI:43/43Windows628.113ms و43/43Linuxwall0.468405136s، صفرskip؛ هیچ SQL/PG اجرا نشد. Bashsyntax/scopedlint/globaltypecheck موفق؛ PG واقعی CI باقی است.
- exporterfinal:135/135Linuxwall1.133142243s، شامل14exporter+77runtime+44original. importerfinal38/38Python0.396s؛ فایل/tar کوچک مصنوعی، officialartifact/import/browser اجرا نشده.
- verify99bf واقعی837دامنه/55file و78مرورگرLinux قبول؛ image هنوز مستقل در اجرا. HTTPprivateIP05:37:48Z ROOT503/healthz200، بدونcookie/body.


## بررسی محدود cache و preservation، ۰۵:۲۱ UTC، ۱۳ اکتبر ۲۰۲۶

- Linux Node24.21: یک اجرای خالص133/133، صفرfail/skip، wall0.824026111s؛12exporter،77runtime-preservation و44original-observer. snapshot خصوصی LF و dependenciesLinux؛ بدونPG/browser/import. Windows اولیه89case داشت:84pass/5Unixskip؛ به133Linux اضافه نشود.
- CIcache99bf: دانلود رسمی3موتور موفق؛ export با lexicalguardFirefox،49byte/6depth شکست. نامentry621 اثبات نشده؛ استثنای دقیق دارایی GTK با provenance رسمی و counterexampleهای version/type/symlink/profile آماده است. artifact واقعی هنوز ندارد.
- QA factory proof31.613s موفق: تعارض503 کلید غیرcanonical، چهارپیام مشروع مدیر جدید، replayID/read و jobstatusواقعی؛ cleanup/مالی/صف/رزرو ثابت. nativeAuthenticationProved=false؛ اصلاح nativefixture هنوز آماده‌سازی است.


به‌روزرسانی۰۵:۰۲ UTC: سلامت296c01bd واقعاًexit0/accepted=true،cycle34.145704s ازjournal،127نمونه،صفرهشدار وready200 باپروف کامل metadata/identity؛ executionSeconds=null/tableEqualityfalse، timer/backup/SQLnone. CIimage db92877/78 با5369خط/صفر500/no cap شد، artifact چهارعضوی23711bytes hash-verified؛ علتownerfeed۴به‌جای۲pending. CItoolfb Pythonmock34/35Linux راExitStack35/35 واقعی اصلاحکرد؛ runtimehelperثابت. Cachedownload رسمی سه‌موتورموفق/exportناموفقunclassified؛ diagnostic10/10Linux قبول، artifact/import/nativeمحلیصفر. [گزارش CI](CI_ANALYTICS_NOTIFICATIONS_EXECUTION.md) و [سلامت](ops/HEALTH_SCHEDULED_591_EXECUTION.md) جزئیاتscope مستقل دارند.

به‌روزرسانی۰۴:۳۸ UTC: verify واقعی commitdb928f4/run38344901833 موفق:837/837دامنه،55فایل،91.77s؛78/78مرورگر Linux،26هرموتور و1084253.761ms، صفرskip/flaky/retry. شواهد کامل سرور5375خط/صفرwrapper500/no cap؛ ZIP artifact10922bytes واقعاً دانلود/hash-verify و فقط دوJSON مجاز privately استخراج شد. [گزارش CI B/C](CI_ANALYTICS_NOTIFICATIONS_EXECUTION.md) هویت‌ها را ثبت می‌کند. Image job جدید هنوزجاری وپذیرشسرورجدیدunrun است. Build مستقل Linux sourceهمینcommit در37.678430s پس از چهار توقف پیش ازNext موفق؛ guarddeps حفظ، migration/native/browser محلی اجرا نشد. GCاصلاح‌شده35Node باsuiteهای توکار جدا18/16/13 قبول؛ reconciliation اصلoverallfailed را تغییر نداده است.

## اجرای تازهٔ main و سلامت، ۰۳:۵۸ UTC، ۱۳ اکتبر ۲۰۲۶

پس از تشخیص CI، baseline متعلق یک شکست/۲۵ مورد انتخاب‌نشده در7.80s داشت؛ اولین assertion افزودهٔ DTO کامل۲۵/۲۶ در109.92s شد و به‌سبب حالت گذرای مجاز unknown/pending اصلاح شد. suite نهایی۲۶/۲۶ در111.22s، child112.010s، exit0؛ دقیقاً یک سفارش/event/رزرو/ledger و سه job صحیح را ثابت کرد. schema متعلق cleanup شد و fingerprintهای public outbox/reservation dedicated ثابت بودند؛ اصل/runtime/تاریخچهٔ دیگر دست‌نخورده، پنجره آزاد است. globalTSC/scopedlint/diff و16/16کنترل واقعی scanner قبول‌اند. [گزارش CI B/C](CI_ANALYTICS_NOTIFICATIONS_EXECUTION.md) این scopeها را جدا از جامع جدیدِ هنوز اجرا نشده ثبت می‌کند.

انتشار واقعی d7a36bb، build/lint/typecheck محلی موفق و اسکن staged نهایی Gitleaks صفر یافته ثبت شدند. [CI38342973726](https://github.com/AmirMo10/Morphiume/actions/runs/38342973726) برای دامنه در84.46s، ۸۳۶قبولی/یک‌شکست از۸۳۷ و۵۴فایل‌موفق/یک‌ناموفق از۵۵ داشت. assertion در cart-lifecycle.test.ts:58:448 شمار job با dedupe قدیمی را صفر دریافت کرد؛ اصلاح هنوز آزمون‌نشده است. مرورگر و تصویر جدید اجرا نشدند؛ نبود لاگ server به‌درستی gate کامل بودن شواهد را رد کرد و صفر HTTP500 به قبولی تعبیر نشد.

اندازه‌گیری واقعی سلامت7d230958، یک شروع با نتیجهٔ unit success،۱۲۸نمونه، wallSeconds=34.27002657898993، صفرهشدار وready200 داشت. پذیرشfailed/parentexit1 با executionSeconds=null حفظ شد؛ مدت اجرای unit و پذیرش نهایی هنوز اثبات نشده‌اند. تکرار عملیات، timer، backup، stopwriter یا SQLmutation انجام نشدند. native B/C اصلاح‌شده۱۳/۱۴ و شکست WebKit ویندوز همان نتایج مستقل‌اند؛ شمارها با سلامت سرویس جمع نمی‌شوند.

اسکن staged انتشار B/C با Gitleaks8.30.1 پس از بررسی موارد ثابت، صفر یافته دارد. سه علامت اولیه شامل نام عمومی `0005_bulk_operations.sql` در readiness و دو checksum واقعی مهاجرت‌های0002/0004 در observer بود؛ نوع آن‌ها با manifest canonical و فایل‌های SQL تطبیق داده شد. استثناها فقط همان مقدار و همان مسیر را با شرط AND می‌پذیرند. کنترل مستقل در Git موقتِ خصوصی، دو مقدار عمومی مجاز را عبور داد و هم مقدار تصادفی متفاوت در همان guard و هم checksum عمومی در مسیر دیگر را شناسایی کرد. هیچ فایل یا rule عمومی از اسکن حذف نشده؛ گزارش‌های اولیه محفوظ‌اند.

## پذیرش B/C اصلاح‌شده، ۰۳:۲۸ UTC، ۱۳ اکتبر ۲۰۲۶

- build96160، lint23098exit0 و typecheckpublication exit0. Native هدفمند **۱۳/۱۴ در457838.256ms**، start03:11:53.879Z/end03:19:31.717Z؛ Chrome۷/۷/WK۶/۷، تمام اعلان‌ها۸/۸، skip/flaky/testretry0. تنها شکست Cookie omission در WebKit ویندوز محفوظ؛ سهevent۲۰۲ باOrigincanonical وCookiepresent، بدونauth/referrer/controlheader. سرور۸۷۷خط/صفر500/no cap؛ Native۱۱۹=۱۱۶200+۳429، انتظارواقعی۸/۹/۵۰ثانیه و تلاش دوم موفق. Source394ثابت؛ audit03:21:52.366Z چهارcleanupcount0/history13/53table وwindowreleased. [گزارش](qa/BC_CORRECTED_NATIVE_QA.md).
- worker fixture نهایی600100… تابع وcleanup را واقعاً در11751ms تمام کرد؛ job1/messages2/replay0/read2/مالی و jobهای دیگر ثابت/nativeAuthenticationProvedfalse. نخستینloaderTLA شکست و دومینparentCaptureJSONparse شکست محفوظ‌اند؛ دومین summary تنها از همان capture و بدونPG/rerun بازیابی شد. allPublicRowsEqualityMeasuredfalse؛ [گزارش](NOTIFICATION_WORKER_EXECUTION.md).
- parser سلامت جدید750317…:34/34Node1175.5309ms، suiteهای توکار۱۸ و۱۶Python مستقل و هم‌پوشان‌اند. actualservice با این source هنوزشروع نشده. observer49b0…:44/44Node788.8845ms و savedactualPG18metadata سه کنترل محلی قبول؛ اصلDB مشاهده/backup/DDL نشده است.
- CI52 مستقل complete-success است:629domain/41files،57Linux و57image، server3917/3913line و0events/allcapsfalse. Grype سهMediumbusybox-CVEبدونfixversion دارد؛ [جزئیات](CI_RECOVERY_EXECUTION.md). این تصویر B/C را ندارد و روی سرور جایگزین نشده است.

Firefoxویندوز، whole52/78sourceجدید، Linuxprivacy، packagedconsumer جدید، انتقال/health/backup/preview/۲۰۰VU وASVS هنوز پذیرش نشده‌اند. شمارهای بالا به هم اضافه نشوند.

## انتشار و پایگاه تازهٔ B/C، ۰۲:۲۰ UTC، ۱۳ اکتبر ۲۰۲۶

- انتشار واقعی `52ee407044d3705ce3dfe444681abc0dfe34f2f5` روی GitHub main؛ Gitleaks تغییرهای staged برابر صفر یافته، lint و typecheck checkout انتشار موفق. [CI همین commit](https://github.com/AmirMo10/Morphiume/actions/runs/38334783199) هنوز نتیجهٔ نهایی ندارد؛ مراحل پیش از مرورگر موفق‌اند. پذیرش محلی ۳۸/۳۸ قبلی مستقل باقی است.
- اجرای واقعی بررسی سلامت با شناسهٔ `0f243c22-6be2-49d0-8523-074b7338e253` ناموفق بود: صفر شروع سرویس، صفر نمونه، `unitResult=unavailable`. شواهد خصوصی محلی SHA256 برابر `2528522eb974c84fd43aca7f9cb0ffee170f1ddad2a369c36fb2bfdf7df6b178` و شواهد سرور برابر `321ccfc8b98a0dd0764af32f7e5d1fec2019a87831f5858d7844849da4850678` محفوظ‌اند. تایمر، backup، توقف نویسنده و تغییر SQL همگی false؛ پذیرش یا اجرای مجدد گزارش نمی‌شود.
- provision واقعی پایگاه جدا با suffix `b625408702be90db` موفق؛ نقش برنامه DML و فاقد دسترسی به دو پایگاه تجاری قبلی است. مهاجرت و seed واقعی روی همان پایگاه تازه موفق. مشاهدهٔ فقط‌خواندنی `02:19:24.078Z`: ۱۳ migration با checksum canonical، ۵۳ جدول، یک محصول seed، نقش برنامه فاقد CREATE پایگاه/schema و فاقد migration credential در محیط برنامه. بیلد و آزمون بومی B/C هنوز در این checkpoint نهایی نیستند.

## پذیرش نهایی recovery در محیط جدا، ۰۱:۵۵ UTC، ۱۳ اکتبر ۲۰۲۶

- build83681/server76753/targetqa7f59/canonical3004: **۳۸/۳۸909.964618s**،۱۹درهردوموتور، start01:33:20.090Z/end01:48:30.054Z؛0skip/flaky/testretry، observeroff/budgetsunchanged.۲۱۸native(۲۰۸200/۶429/۲wrongcode400/۲controlled503) باهمان boundedretryواقعی429. Capturedwrapper500=0،۲۵۷۹خط/no truncation/caps.۲۵۰sourcehashوprovider/HTTPثابت؛audit01:51:24.417Z چهارownedfixturecount0 وreleasedwindow. [گزارش](qa/DEDICATED_RECOVERY_QA.md)،[مرورگر](qa/browser-recovery-dedicated-whole.json)،[سرور](qa/server-recovery-dedicated-whole.json).
- QAwhitelist38/0unknownfield/0authsecretpattern وvisualreview۸تصویر مصنوعی قبول؛ دوcatalogscreen حالتEMPTY هستند وproductbluePNGdecodeشده است. هیچtrace/rawlog/cookie/OTP/URIمحرمانه منتشر نمی‌شود.
- اجرایoriginal34/38failed در906.599832s مستقل محفوظ؛ چهارCSV409علتtracebodyنامعلوم دارند. Countreadonlyبعدی10650/archived10647 guardاکنون را اثبات می‌کند، تاریخچهٔ چهار پاسخ را بازسازی نمی‌کند.
- GuideNodehealthtool۳۳/۳۳827.6235ms،Nodeprovision۲۰/۲۰،HTTP/logger/exporter/gate۱۶۶/۱۶۶2.61s،QAguard۸۷/۸۷412ms؛ scopeها هم‌پوشان/جدا وبهwhole38 یاRoot592اضافه نشوند. Root592/31file17.87s/build37621/globallint76662exit0. نخستین copyhealthtest به‌علت نبود parentfolder شکست وبدون اجرای آزمون exit1 شد؛ folder مشخص ساخته، exactsource کپی واجرای واقعی۳۳قبول شد.

Rootpublication/اسکن نهایی وCI همانcommit هنوز درحال آماده‌سازی است؛ published5cfCIfailed/image-skipped باقی است. B/Cnative،runtimecutover/fullscheduledhealth/manualbackup/timers/IP/load200 وASVS/realprovider پذیرش نشده‌اند.

## نتیجهٔ جاری، ۰۱:۳۵ UTC، ۱۳ اکتبر ۲۰۲۶

- Guidebuild83681/server25202 رویoriginalschema11: **۳۴/۳۸906.599832s**، start00:51:40.096Z/end01:06:46.695Z؛ هرengine۱۷pass/۲fail، هر۱۰Cart/۲T25 قبول، skip/flaky/testretry0. چهارCSV409باbodyناموجود؛۲۱۳native(۲۰۴200/۵429/۲wrongcode400/۲controlled503). server۲۵۴۱خط/صفرwrapper500/هیچcap؛ چهارownedcleanupcount0،Source205+trusted10hashunchanged، windowrelease01:08:34.369Z. این مجموعه قبول کامل نیست.
- Rootreadonly مشاهدهٔcurrentoriginal: محصولات۱۰۶۵۰،archived۱۰۶۴۷،۱۱migration؛ countguard اکنون قطعاً فعال است. مشاهدهٔ پس از اجرا، bodyدریافت‌نشدهٔ چهارtrace را بازسازی نمی‌کند.
- ابزارfreshQA:۲۰/۲۰ Node1.116903s،syntax/PowerShellASTقبول. RootlocalACL/credentialprepare واقعاً موفق؛ نخستینSSHexit255 هیچrole/db/privateRoot نساخت. readonlysamebootstrap باONLYProgramData موفق؛ اصلاحallowlist، حفظattempt وforwarddispatch همانplan/PythonSHA موفق. ورودowner/app وDML/noDDL/noOldDBaccess واقعاً بررسی شدند؛ newtarget/migrate11/seed/۴۹table/checksum/appfile-noOwnerCred واقعاً تأیید.
- GuidefreshDB/server76753 رویsamebuild83681: Full۳۸اکنون جاری؛۶اولقبول/catalogCSV200، ولی نتیجهٔ کامل هنوزوجودندارد. prior34/38/rawtrace/HTML/screens محفوظ‌اند؛ timeout/retry/assertion/exportcaps تغییرنکردند.
- RootcombinedB/Cbuild37621exit0، **۵۹۲/۵۹۲،۳۱فایل،17.87s** unit96298؛ شاملguard87وHTTP/gate تازه است وscopeهای قبلی به آن اضافه نشوند. Guide۴فایلHTTP/logger/exporter/gate **۱۶۶/۱۶۶2.61s** وguard۸۷/۸۷412ms جدا؛ Nodeprovision۲۰/۲۰Guideقبول. originalobserverNode۴۳/۴۳613.8935ms فقطmock/pure وازVitestdiscover نمی‌شود.

published5cfCIfailed56/57 وچهار500نامعلوم، B/Cnative/worker تازه، packagedimageجدید، fullscheduledhealth/backupcycle/timers/privateIP/load۲۰۰ باقی‌اند. هیچ_ASVSقبولی یاproductionreadiness از این نتایج نتیجه نشود.

## نتیجهٔ جاری، ۰۰:۴۹ UTC، ۱۳ اکتبر ۲۰۲۶

- checkout جدا: اصلاح recovery روی build اولیه، ۴/۴ native Chrome/WebKit در164.702547s گذشت ولی یک cart500 نامعلوم داشت. بیلد تشخیصی بعدی، ۲/۲ generic-conflict در53.3s و صفر500 داشت. این‌ها پذیرش نهایی ۳۸ مورد یا علت قطعی خطای قبلی نیستند.
- نسخهٔ نخست HTTP/recovery: build58736،۱۴۴/۱۴۴ سه فایل2.23s موفق. بازبینی مستقل bodylimit413→499 را یافت؛ baselineواقعی **۱ شکست/۸ قبول،917ms**. حفظ CommerceError و سه assertion تازه، Rootچهار فایل **۶۵/۶۵3.27s** و Guideسه فایل **۱۴۷/۱۴۷2.16s** شدند؛ build83681 وscopedlintexit0/server25202ready200. QA کامل۳۸ اکنون در جریان است؛ نتیجهٔ نهایی موجود نیست. نخستین build پیش از این به‌علت نوع RequestInit fixture شکست خورد؛ نوع دقیق NextRequest fixture اصلاح شد.
- آزمون HTTP تازه۱۰ مورد دارد: هفت مورد قبلی، دو oversize-stream413 با و بدون signalلغوشده، و downstream500 پس از خواندن موفق با signalلغوشده. آزمایش socket-abort واقعی به wrapper نرسید؛ شاهد رفع خطای تاریخی معرفی نشود.
- اجرای۳۸ جاری: هر پنج caseسبد Chromium قبول؛ catalog-paging و product-content CSVپس ازnativeعامل دوم۴۰۹ واقعی به‌جای۲۰۰ گرفته‌اند. guardمحصول>10000/guardCSV>32MiB sourceمعلوم است؛ علت پاسخ‌های واقعی هنوز اندازه‌گیری نشده. no retry/assertion/cap تغییر نکرده؛ شمار کلی پس از completion/cleanup ثبت می‌شود.
- checkout اصلی B/C: build54769 و lint47617 exit0؛ تست واحد34760 **۵۳۱/۵۳۱،۳۰ فایل،15.45s**. شرط پذیرش safe-server-evidence تازه **۱۹/۱۹،294ms**؛ با۵۳۱ جمع نشود چون پس از آن اضافه شده است.
- تجارت نهایی: **۶۸/۶۸ PostgreSQL، پنج فایل،290.72s** بدون skip/unhandled؛ schemaهای مستقل پاک و اثر انگشت ردیف/ساختار۴۹ جدول اصلی و تاریخچه۱۱ دقیقاً برابر. شکست‌های قبلی fixture pool/late promise assertion حفظ‌اند؛ اجرای نهایی پاک است. این شمار با رگرسیون‌های پیشین هم‌پوشان است.
- کنترل‌شدهٔ رابط اعلان:۱۳ گروه SSR/Chrome/WebKit،320px/keyboard/axe و پاک‌شدن state خصوصی گذشت؛ HTTP این harness کنترل‌شده است. nativeC۱۲ اجرا و workerfixture مستقل۱ اجرا فقط آماده‌اند. nativeB۹ اجرا فقط آماده است.
- CI منتشرشده5cf هنوز۵۶/۵۷ و چهار500 طبقه‌بندی‌نشده است؛ image اجرا نشد. این خطاها با نتایج جدید جایگزین یا intentional شمرده نمی‌شوند.

publicDDL جدید، nativeB/C، packaged image تازه، fullscheduledsandbox/timer، privateIP و load200 اجرا نشده‌اند. نتیجهٔ کامل نهایی بعد از آزادشدن پنجرهٔ QA جدا ثبت می‌شود.

## نتیجهٔ جاری، ۲۳:۴۳ UTC

- منتشرشده5cf: Gitleaks855.52KB/zero findings؛ CI38320637761 دامنه/API۵۰۳/۵۰۳، مرورگر۵۶passed/۱failed در691.023547s، start23:12:27.287Z، retry/skip/flaky0؛ image skipped. ZIP7694bytes با دو عضو مجاز182466bytes مستقل بررسی شد؛ serverfailure3908lines/چهار500/no truncation. علت چهار خطا و ارتباط آن‌ها با timeout معلوم نیست.
- Bbackend۱۵/۱۵ PG32.16s و Cdispatcher۱۶/۱۶ PG80.22s جدا درschemaمتعلق؛ public49جدول/۱۱migration ثابت. Bpure۳۰ و Cpure۲۰، با نتایج هم‌پوشان قبلی جمع نشوند.
- RootreportPG نهایی **۸/۸28.58s**؛ پرداخت/تحویل حاصل جریان واقعیcommerce، سپس زمان‌های کنترل‌شده فقط درschemaمتعلق برای مرز تهران/cohort/receipt-dispositions. actorfixtureدامنه، nativeMFA نیست. قبل/بعد public49 row/DDL/history برابر و cleanupمتعلق انجام شد. تلاش اول poolmax8 قبل از آزمون شکست/۸skip؛ اصلاحmax2، تلاش دوم۷pass/۱fail ساعت میزبان؛ اصلاحclockهمانPG و اجرای نهایی۸pass. هر سه شاهد خصوصی حفظ‌اند.
- Root۵فایل ingress/report/cart/observability **۸۴/۸۴4.07s**. schema readiness۸/۸ اصلاح‌شده286ms؛ readiness+childprocesslauncher **۱۷/۱۷1.63s**، globaltypesexit0. نتایج هم‌پوشان جمع نشوند. این بررسی‌های source جای build/native نیستند.
- QAآماده Bسهcase/۹executionسه‌موتور list، **۰ اجرا**؛ exporter/HTTPevidence۱۱۳/۱۱۳1.23s، bounds/redaction محفوظ. FErecovery defect درChromium/WebKit بازتولید؛ اصلاح/آزمون نهایی در جریان. هیچ timeout/retry/assertion برای سبزشدن CI ضعیف نشده.

nativeB/C رویsourceتازه، image جدید، fullscheduledhealth، protectedIP و load200 هنوز اجرا نشده‌اند. تاریخچهٔ پایین حفظ است.

## پذیرش ثبت‌شدهٔ ۲۲:۴۲ UTC

تازه۲۳:۰۸: workerdrill591 واقعی **94.640045s**، start22:58:21.843Z/end22:59:56.483Z؛ baselinehealthy0alerts، workerstop0.801138s/Exit0/OOM0، duringexit2/critical/exact1workeralert، resumeهمانworker5.803562s/onefiniteattempt، afterhealthy0alerts/ready200/HB1.9792409668s. app وmetadataPG/mount/profile/image/21Opsbyte ثابت و cacheprefixغایب بودند؛ هیچqueue/financialcleanup انجام نشد. Gitleaksconfigurationbinarygate۷/۷ واقعی، سهpublicpin مجاز و چهارbadvalue/pathcanary کشف‌شده؛ types/lint/whitespacecandidateCartقبول، اسکن نهایی/push جدا ثبت می‌شوند.

تازه۲۲:۵۵: پذیرش نهاییCart/provider83effbe… رویbuild23099/server99612 **۳۸/۳۸،942.263819s**، آغاز22:33:18.565Z وskip/flaky/testretry0.۲۱۸statusبومی،۶429 باexactlyoneboundedobservedretry؛ دو400کدغلط ودو503کنترل‌شده. شاهد امنbrowser-cart-channel-final-whole.json، auditreadonlyچهار دستهٔ fixtureهرکدام0 و windowreleaseصریح؛ تاریخچهٔ مالی/موجودی/limiter پاک نشده است. RootCIpureجدید:۵۰/۵۰Node174.8151ms،۹/۹Python0.003s،۲۰/۲۰diagnostic293.8869ms. runnerاولtsx به‌علتtop-levelawait→CJS پیش از آزمون شکست خورد؛ nativeNode24runner صحیح قبول و CIهمان فرمان است. این scopeها باجامع۵۰۳ پیشین جمع نمی‌شوند.

SREactualhealth: quartercore50s timeout/overall50.231034s/cgrouppeak32800768/OOM0/nohealthJSON؛ separatelyauthorizedonecore pass/overall18.801830s/child18.640249s/userCPU16.008956s/system0.514308s/RSS46080KiB/cgrouppeak53751808/alerts0/OOM0. فقطdirecthealth، نهfullscheduledservice یاcapacity. worker-onlydrill تازهGOدارد و نتیجه هنوزpending؛ timer/backupcycle نصب/اجرا نشده‌اند.

سرور613/591: QA63927 **۶/۶33.8336788s**، شروع22:22:29.174Z و پایان22:23:03.008Z؛ ورود OTP200/attempt1 بدونretry، ownedorder/dedup/stock/tracking/mediaSHA موفق. Root6124 marker واقعی محافظت‌شده را ثبت کرد: RTO3333.396461s از اولین شکست21:27:29.611539Z، fixture-to-capture gap122.003162s با timestampsواقعیreadonly. Root35483exit0: restorepairمتوقف، داده محفوظ، کلید موقت دقیق حذف و runtimepairhealthy/ready200 در22:31:04.930595Z. timer/drill/privateIP/load و PITR/offsite هنوز پذیرفته نیستند.

CIa899/run38314369665: verify۴۱۳/۴۱۳35files79.57s،۴۲/۴۲Linux8.5min؛ image۴۲/۴۲516.573928s باunexpected/skip/flaky0. artifact11777405981/19667bytes و دقیقاً۵عضو۱۹۲۸۸۷bytes مستقلاً استخراج شدند:۳MediumCVE-2025-60876/busyboxfamily1.37.0-r31/no fixversion؛ nativeTLS1.3+WebP قبول. این نتایج کارWIPجدید را اثبات نمی‌کنند.

Cartfinalsource83effbe…: build23099/lint72967exit0/closure530/worker185.3KB/WindowsWebP واقعی؛ QAwhole38 جاری رویserver99612. predecessor19480targeted10/10 جداست. Bnewsource هنوز unwired/unmigrated: backendpure۳۰/۳۰589ms، Rootreport۶/۶434ms وtypes/scopedlint0؛۱۵PG suite صریحاً skip شد و اجراشده نیست. شمارها با۵۰۳globalقدیمی یا مرورگرها جمع نمی‌شوند. این بخش بر زمان‌های تاریخی پایین مقدم است.

## نتیجهٔ معتبر ۲۲:۲۵ UTC، ۱۲ اکتبر ۲۰۲۶

- build19480/cart: **۱۰/۱۰ Chromium/WebKit،294.933038s**، start22:14:34.897Z، retry/skip/flaky/unexpected0؛ observer اختیاری خاموش. پاسخ گم‌شده/کلید ثابت/replay پرداخت/موجودی/رسید/ارسال/تعویض حساب و gate نشست در این scope قبول‌اند. cleanup readonly همان scope: مدیرفعال0/محصولمتعلقآرشیونشده0. اصلاح تازهٔ persistent channel هنوز در این build نیست؛ controlled19 و baseline/fixed WebKit مقایسهٔ مستقل‌اند، whole38 و native نهایی pending.
- corrected passive observer، اجرای مستقل Chrome **۱/۱،28.368791s**:294event/0drop/reject. اجرای قبلی observer **۱/۱،27.737844s** ولی DOM0 به‌علت scope serialization غلط؛ absence شاهد نبودن lifecycle نیست. هیچ‌کدام به شمار۱۰/۱۰ یا جامع۵۰۳ افزوده نمی‌شوند.
- recovery923 canonical sourcea899: Root مستقل **۲۰/۲۰،1.468s** و SRE۲۰/۲۰1.682s؛ publish۱۳فایل/Gitleaks۸۲٫۸۷KB clean. Actual preflight76392 و forward98363 exit0؛ restore app+DB ready بدون worker. اولین QA30446 قبل native در shape baseline شکست خورد؛ محدود-role SQL، هر هفت شمارنده برابر و capturedUtc معتبر است. اصلاح قرارداد۹/۹ Python، قبول؛ bounded rerun63927 جاری، completed6/6 و marker/RTO هنوز ادعا نمی‌شوند.
- CIa899/run38314369665 جاری؛ CI613 و25 پذیرفتهٔ تاریخی، cart/UUID/privacy/analytics WIP را اثبات نمی‌کنند. بندهای پایین تاریخچه‌اند و این بخش مقدم است.

## نتیجهٔ تازهٔ ۲۱:۲۴ UTC، ۱۲ اکتبر ۲۰۲۶

به‌روزرسانی۲۱:۳۹: اصلاح guest-form،۱۹/۱۹ کنترل‌شده و رگرسیون‌های مربوط را گذراند؛ build85404/lint83679exit0/server29607ready200. اجرای بومی6205 باز هم **۹/۱۰،300.990929s**،start21:33:34.509Z،skip/flaky/retry0 و یک Chrome account-switch failure دارد؛ علت تا تشخیص trace ادعا نمی‌شود. CI25 verify۴۱۳/۳۵فایل75.64s+۴۲/۴۲8.6min و image۴۲/۴۲8.7min پذیرفته‌اند؛ collector/cart جدید را اثبات نمی‌کنند. روی server613،ChromiumT25۱/۱15.216108s و physicalmediaSHA موفق؛ encryptedbackup کامل؛ restoreقبل ازcontainer/PG با invaliduppercaseComposeproject شکست خورد،partialretained و پذیرش بازیابی همچنانpending.

- cart اصلاح‌شده build1434/server61844: **۹/۱۰،301.029727s**؛ unexpected1،skip/flaky/retry0. تنها Chrome در account-B send-OTP observer timeout داشت؛ fill/click موفق، هیچ درخواست OTP ثبت نشد، فیلد خالی شد. علت lifecycle نامشخص است. WebKit recovery/payment/stock/receipt/shipment/account-switch کامل قبول شد. cleanup/window release تأیید؛ T25/whole38 جدید اجرا نشده‌اند.
- آزمون جامع همین حوزه پیش از اصلاح محدود catalog: **۵۰۳/۵۰۳،۳۹فایل،809.33s**. build1434 و lint18887 اصلاح catalog exit0. شمارهای مستقل و جامع جمع نمی‌شوند.
- Ops-only main25e1b19،۲۶فایل/Gitleaks142.29KB بدون یافته؛ CI38308235787 verify موفق/image در جریان. پذیرش613 به cart جدید منتقل نمی‌شود.
- سرور: adoption7472/prepare86160/deploy51706 همگی exit0. archive+OCI wire-layer+RootFS+config/source به proof محافظت‌شدهv2/immutableengineID تطبیق یافتند؛ namespace/roles/config جدا و bundled migration/seed/app/worker با SSHorigin3100 ایجاد شدند. baseline قبلی در prepare ثابت بود. native fixture،backup/restore،RTO،alert/timer،privateIP و ظرفیت هنوز آزموده نشده‌اند.

گزارش تاریخی پایین با source/run خود حفظ می‌شود؛ این بخش بر ادعاهای زمانی قبلی مقدم است.

## آخرین پذیرش معتبر

اولین پذیرش nativecart UI/API رویbuild39584/server74636: **۵/۱۰،210.445434s**؛API۴/۴ وWKgenericconflictUI قبول،سهChromeUI پس ازPOSTcart200 درaddsuccessnotice fail. WKguest،quoteobserver هنگامwait واقعیOTP429/47s timeoutشد(نقصfixtureمشاهده‌شده)؛WKloss/recovery،savedreplay201/keybody/mockpaid/ordernavigation موفق اماrecipientvisibility درline220fail وDOMclassificationpending. skipped/flaky/retries صفر؛ هنوزwhole جاری/قبول یاnativeUIfull ادعا نمی‌شود. FEdiagnostic فقطmaintainedclient+syntheticHTTP،نهappnativePG است. نتیجهٔ unit۵۰۳ وbuild مستقل با این۵failed مرورگر جایگزین نمی‌شود.

اجرای جامع تازهٔ sourceCART/UUID/privacy: **۵۰۳/۵۰۳،۳۹فایل،809.33s،session54199،exit0**؛ build39584/closure530/WindowsWebP واقعی وglobal lint/types موفق. source منجمد ولی هنوزWIP است. production74636/localhost3000/schema11/ready200 تازه راه افتاد؛ targeted UI/API/native QA و whole دو موتور هنوز نتیجه ندارند. CI613 image نیز اکنون۴۲/۴۲ در8.4min/nativeworker/scan/promotion/export موفق دارد؛[CI_613_ACCEPTANCE.md](CI_613_ACCEPTANCE.md) هویت پذیرفته‌شده،سهMedium scan و شکستlookupconfigID پس ازDockerload سرور را ثبت می‌کند. تصویر source613،آزمون‌هایsource جدید را اثبات نمی‌کند.

تازه‌ترین CI منتشرشده6130f4ed7ec090344a5a4a1937a65ef04572975b،[run38300142070](https://github.com/AmirMo10/Morphiume/actions/runs/38300142070)،verify موفق دارد: **۴۱۳/۴۱۳ در۳۵فایل،73.68s و۴۲/۴۲ سه موتور Linux،8.6min**؛ guideFirefox این بار قبول شد. علت شکست قبلی فقط با این عدم تکرار اثبات نمی‌شود. image build/scan موفق است، اما native/browser/worker تصویر و publish/export هنوز در جریان‌اند؛ برنامهٔ سرور هنوز مستقر نشده است.

نسخهٔ CART فعلی هنوز WIP جدا از613 است: تجارت fullنهایی **۱۸۰/۱۸۰،۱۸فایل،739.50s،exit0**؛۱۵۴قبلی+۲۶cart،target۳۳/۳۳ در152.38s زیرمجموعه است. fullاول۱۷۷/۱۷۸ در733.33s با یک فرض قدیمی fixture lock نگه‌داری شده و حذف نشده است. Root actors/domain کنترل‌شدهٔ ingress19+obs10،۲۹/۲۹ در1.91s بدون SQL واقعی؛ readiness ابزار load۲۰/۲۰ در384ms با فایل‌های مصنوعی و types/scopedlint موفق. setupnative۲۰۰حساب/بار واقعی اجرا نشده؛ whole rootsession54199 اکنون جاری است و نتیجه‌ای از آن ادعا نمی‌شود.

تشخیص دقیق CI fd74961: Firefox full-purchase در native **admin password sign-in** ابتدا429 با X-Retry-After7 و پس از7.351s دوباره429 بدون هر دو header retry گرفت؛ OTP مشتری علت این شکست نبود. WebKit shipping با TypeError از current.version شکست خورد چون پاسخ GET فاقد data بود؛ status آن GET ثبت نشده بود. Firefox rename مستقل500 داشت. هیچ server request.completed در log دریافت‌شده نیست؛ علت پاسخ‌های برنامه هنوز طبقه‌بندی نشده است.

| اجرای مشخص | نتیجهٔ مشاهده‌شده |
|---|---|
| working tree یکپارچه |۲۲۸/۲۲۸،۲۶فایل،635.89s،exit0؛ اجرای جامع پیش از discovery فایل guard تازه بود |
| guard اتصال QA بعد از آن |۴۸/۴۸،327ms؛ رد query/fragment/override واقعی parser و هدف‌های غیرمجاز؛ در شمار۲۲۸ نیست |
| build/server تازه | production89652، closure۵۳۰فایل، Windows WebP واقعی موفق؛ server36884/schema10 و health200 آماده |
| پنج spec جدید هدفمند | در هر دو Chrome/WebKit موفق: مجموعه۲/۲، ظاهر/توقف خرید۲/۲، HTTP۲/۲، گزارش۲/۲ و refund/return۲/۲؛ شاهد مستقل هر اجرا در docs/qa/NEW_SOURCE_QA.md |
| مرورگر یکپارچهٔ تازه |۱۱spec/۲۲case،۲۲/۲ در560.980110s؛ صفر unexpected/skip/flaky/Playwrightretry؛ build89652/server36884/source/DB ثابت؛۱۳۱وضعیت امن native-auth،۶۰آمادگی مدیریت و۴۸metadata |
| اصلاح جداگانهٔ شاهد تصویری | در دو موتور، فرم draft مصنوعیِ واقعاً آماده و تصویر decodeشده؛ کاتالوگ SSR با API client کنترل‌شده و scroll/decode واقعی؛ چهار PNG، بدون خرید/مشتری/پرداخت تازه |
| Linux static زیرساخت |۱۵/۱۵ آزمون خالص، symlink واقعی، Python/Bash syntax، چهار systemd unit و calendar03UTC موفق؛ هیچ سرویس/PG/Docker/checkout/key/config اصلی تغییر نکرد |
| ابزار ارتقا/backup واردشده |۹/۹ آزمون محلی با مرزهای DB/Docker/encryption کنترل‌شده؛ فراخوانی واقعی تابع بدون CLI-global، ترتیب backup پیش از migration و حفظ حالت شکست؛ اجرای ارتقا/backup واقعی سرور نیست. CI اجرای Linux هر دو suite خالص را به verify اضافه کرده است |
| CI checkpoint fd74961 | [run38286418414](https://github.com/AmirMo10/Morphiume/actions/runs/38286418414)،۲۷۶/۲۷۶ در۲۷فایل؛ Python safety، lint/types/audit/build موفق؛ مرورگر۳۰/۳۳ در6.8min. Firefox collection rename500، Firefox nativeadmin429 پس از retry، WebKit shipping شکست جدا با علت هنوز نامعلوم؛ image skipped |
| CI پیشین d7d0c0c | verify۱۵۰/۱۵۰ و۱۸/۱۸ Linux؛ image۱۷/۱۸ و Firefox gallery شکست؛ nativeTLS/Sharp و فرمان Grype exit0؛ worker/publish/export اجرا نشدند |
| delta هدفمند بعد از checkpoint | CSV سه آزمون286ms؛ observability10+CSV3،۱۳/۱۳ در805ms برای طبقه‌بندی ثابت خطای داخلی بدون metadata خصوصی؛ این اجراها مستقل‌اند، نه شمار اضافه بر۴۰۱ |
| اطلاعات کالا و مجوز نهایی | تجارت۱۵۴/۱۵۴ در۱۷فایل،628.70s؛ شامل۱۰محتوا و اصلاح۷baseline واقعیِ ثبت غیرمجاز پس از قفل؛۲۰هدفمند و۳archive زیرمجموعه‌اند و جمع نمی‌شوند |
| PUBLIC0011 | یک migration در1.271s؛ total11/checksumfc4feb95…؛۴۸جدول قبلی و۳۴۱تعریف ستون قدیمی ثابت،۸۵۲۴محصول دارای۳متن خالی/nonNULL؛ history۱..۱۰ حفظ، بدون backfill/DML |
| خواندن build قدیمی بعد از0011 | old production89652/server36884، GETcatalog200/یک عضو/فیلدهای legacy؛ فیلد جدید absent و X-Request-ID معتبر. این probe Windows runtime بود، نه Linux image؛ سپس server متوقف/listener3000صفر |
| scope محدودیت auth | خود BetterAuth1.7.7+memoryadapter/limiter کنترل‌شده: baseline۲fail/۱pass در2.01s؛ اصلاح۳pass. authscope3/budget4/obs10/CSV3،۲۰/۲۰ در3.90s؛ صفر SQL واقعی، آستانه HTTP200/60 وSMS500/hour ثابت |
| رگرسیون یکپارچهٔ همین delta | session10069،۴۰۱/۴۰۱ در۳۴فایل و695.85s،exit0؛ source منجمد، window آزاد. شمار۱۵۴و۲۰هدفمند و نتایج قبلی، به۴۰۱ افزوده نمی‌شوند |
| production تازه | build96266 exit0/compile4.9s/types12.8s،CLIclosure۵۳۰/worker181.9KB/WindowsWebP واقعی موفق؛ server1792 localhost3000/schema11 وready200/serverUUID |
| سه case جدید در دو موتور |۶/۶ در83.859755s،صفر unexpected/skip/flaky؛ native MFA/محتوا/CSV،۲۰۵خواندن نشست بومی و سهمیهٔ ثابت، PATCH منتظر قفل و لغو نقش با403/بدون اثر محصول؛ همان build/server/schema11 |
| مرورگر کامل همین منبع |۱۲spec/۲۸case درChrome/WebKit،۲۸/۲۸ در627.080353s،exit0؛ start2026-10-12T18:50:25.575Z؛ صفر unexpected/skip/flaky، بدون اصلاح source/assertion/fixture؛ cleanup محدود و window release صریح. FirefoxWindows اجرا نمی‌شود؛۴۲case سه موتور Linux فقط برنامهٔ CI است |
| native rate-limit در همین اجرای کامل |JSON نهایی۱۵۶وضعیت امن و شش429 واقعی ثبت کرد؛ هرکدام فقط یک retry محدود مطابق زمان پاسخ داشت: wrongOTP→400 مورد انتظار و پنج ورود/send/TOTP→200. شمار Playwrightretry صفر است؛ عبارت «429 مشاهده نشد» در progress میانی به علت parser ناقص بود و نتیجهٔ نهایی نیست |
| تصاویر همین اجرای کامل |هشت PNG بازبینی و فاقد credential/OTP/TOTP URI/cookie/providerref خصوصی‌اند؛ تنها fixture مصنوعی. دو مستطیل تصویر lazy در catalogWebKit هنگام capture خالی‌اند؛ آن PNG شاهد decode کامل تصویر نیست و نقص محصول از آن نتیجه گرفته نمی‌شود |
| private-IP profile آماده |عامل زیرساخت۲۲/۲۲ purepreview در0.415s،upgrade۹/۹،safety۱۵pass/یک Windowssymlinkskip،scopedlint/syntax و سه مدل quietCompose را گذراند؛ OpsSHA256=1b19bab6a039029cc51c10a13787c5b64b116814b6724175f34bc0ac8d9b8161. هیچ SSH/HTTP/PG/service/credential واقعی اجرا نشد؛ LinuxNginx/unit/access و baseline/restore/nativeIP هنوز اجرا نشده‌اند |
| بازبینی نهایی root |همان۲۲purepreview در0.421s،exit0؛ fingerprint دقیق یکسان؛ lint/TypeScript سراسری session56853،exit0. source برنامه بعد از build96266/مرورگر۲۸case تغییر نکرده است؛ docs/Ops/CI تکمیل شدند |
| سرور/بازیابی/ظرفیت | برنامه، restore کامل، هشدار واقعی و۲۰۰VU/RPS هنوز اجرا نشده‌اند؛ تصویر پذیرفته‌شده نداریم |

اعداد اجراهای هدفمند، مستقل و جامع جمع نمی‌شوند. اصلاح PUTquantity1 در fixture خرید دوم و ترتیب shipped→delivered، خطای آزمون را رفع کردند؛ منطق برنامه در این بازاجراها تغییر نکرد. گزارش مالی خالص منفی در مرورگر DTO کنترل‌شده داشت؛ شاهد aggregation مالی منفی واقعی از چهار آزمون PG جداست. بررسی امنیت کامل/ASVS پس از رد خودکار عامل امنیت انجام‌شده ادعا نمی‌شود.

## سابقهٔ اجراها

عبارت‌های pending و وضعیت‌های جاری پایین متعلق به اجرای تاریخی همان بندند؛ جدول بالا و گزارش هر اجرای مشخص مقدم‌اند.

تازه‌ترین پذیرش working tree: production89652 و closure۵۳۰/Windows WebP موفق؛ server36884/health200/X-Request-ID آماده. collection-routes۲/۲ در27.7s، Chrome11.3s/WebKit13.6s: normal-UA/noJS308 باLocation canonical و حفظpageSize13/page2؛ unknown/private404؛ public۲۴+۱عضو، same-variantfilter، nativeversion409/hiddenretention/newhidden400 و axe0. سه اجرای ابتدا0/2 قبل از پذیرش نهایی، ناشی از INSERTjsonb/locatorحجم/انتظار پارامتر پیش‌فرض زائد بودند؛ علت هرکدام در fixture اثبات شد. قابلیت‌های دیگر همین build هنوز در حال آزمون‌اند.

CI checkpoint `d7d0c0c`: [run38279356243](https://github.com/AmirMo10/Morphiume/actions/runs/38279356243)، verify۱۵۰/۱۵۰ و۱۸/۱۸ مرورگر4.4min قبول؛ داخل تصویر۱۷/۱۸ در4.1min، فقط Firefox gallery نام محصول را نیافت. Native ldd/inventory/TLS1.3/Sharp و فرمان واقعی Grype fail-on high exit0 داشتند؛ جزئیات count اسکن مستقلاً خوانده نشده. heartbeat/SIGTERM/promotion/export نرسیدند؛ هیچ تصویر پذیرفته‌شده‌ای وجود ندارد. این CI برنامهٔ قدیمی76df را اجرا کرد، نه working tree جدید.

تازه‌ترین CI منبع `538ff1c`: [run38275593404](https://github.com/AmirMo10/Morphiume/actions/runs/38275593404)،۱۵۰/۱۵۰ واحد/DB و۱۷/۱۸ مرورگر Linux؛ تمام ورود/OTP/خرید قبول شدند. تنها Firefox public-rtl با document-title خالی در axe شکست خورد؛ route/علت ثبت نشده و image skipped است. اصلاح تازهٔ صرفاً QA، عنوان دقیق/HTTP200/diagnostics محدود را به آزمون اضافه می‌کند؛ هیچ قاعدهٔ axe حذف نشده است. probe خواندنی شش صفحهٔ واقعی Chrome/WebKit در21.972s، HTTP200/عنوان دقیق/axe0 داشت؛ API client کنترل‌شده بود. دو fixture دیررس بازیابی و دو عنوانِ همیشه خالی رد شدند. این، بازتولید Firefox اصلی نیست.

working tree بعدی: آزمون جامع `pnpm test` با۲۲۸/۲۲۸ در۲۶فایل و635.89s، exit0، قبول شد. guardهای تازهٔ ابزار QA بعد از discovery افزوده شدند و این اجرا شامل آن‌ها نیست؛ نتیجهٔ هدفمندشان جدا ثبت می‌شود. full تجارت۱۳۱/۱۳۱ در۱۵فایل،573.10s، صفر skip/error و fingerprint public ثابت؛ پس از آن فقط متن توقف پرداخت اصلاح شد. PUBLIC0010 در2.35s با checksum ثبت‌شده اعمال شد؛ هر۲۶جدول قدیمی ثابت و return_decision خالی بود. root گزارش مالی۴/۴PG در6.31s، واحد بازه/مبلغ۴/۴ در418ms و جلالی۳/۳ در353ms با۱۸۰ round-trip قبول شدند. شمار اجرای مستقل تجارت و اجرای جامع جمع نمی‌شود. build/مرورگر جدید، سرور، restore و بار همچنان نتیجه ندارند.

آخرین شواهد قبل از checkpoint تازهٔ fixture مشتری: CI منبع `3f999fd`،۱۵۰/۱۵۰ واحد/DB و۱۴/۱۸ مرورگر Linux؛ چهار شکست WebKit و image skipped. سه send429 مشاهده شدند؛ status مورد چهارم ثبت نشده است. اصلاح ادمین پذیرفته‌شده باعث تضعیف محدودیت نشد.

اصلاح صرفاً آزمون مشتری روی runtime منجمد48583: بازتولید بومی send429 با انتظار60.25s، حفظ فرم، send200، wrong-code400 و verify200 موفق شد. اجرای کامل Chrome/WebKit،۱۲/۱۲ در275.777459s؛۷۱ وضعیت امن، صفر skip/flaky/Playwrightretry. verify429 مشاهده‌شده با11.25s انتظار و خواندن کد جاری بدون resend به200 رسید. cleanup دقیق انجام شد. شرح و شاهد امن در `qa/CI_CUSTOMER_OTP_DIAGNOSTICS.md` است؛ Linux همین اصلاح هنوز اجرا نشده است.

منبع برنامهٔ بعدی هنوز build/مرورگر نشده: تجارت۱۰۵/۱۰۵ در۱۲فایل و397.50s در پنجرهٔ آرام DB؛ پس از delta مجوز۵۲/۵۲ درچهارفایل و300.03s جدا. اجرای قبلی هم‌زمان۱۰۵ assertion موفق داشت ولی دو fingerprint پس از suite به علت checkout مستقل تغییر کردند و exit1 بود؛ آن اجرا قبولی کامل گزارش نمی‌شود. root native config+presentation۱۰/۱۰ در35.76s؛ final presentation۵/۵ در16.01s و unit config۱۲/۱۲ در1.31s. fixture presentation grant کنترل‌شده دارد؛ ورود بومی همان هفت آزمون مستقل است. همهٔ نتایج به scope همان اجرای مشخص محدودند؛ استقرار/restore/بار هنوز نتیجه ندارند.

تاریخ: ۲۰۲۶-۱۰-۱۲. checkpoint پیشین `1a4fa4433d720b490ce222e8898cb09f73ba4abf` است. نسخهٔ یکپارچهٔ صفحه‌بندی/ارسال/مجوزها در این checkpoint با build24244/server48583 و مرورگر کامل پذیرفته شد؛ CI Linux و تصویر همان منبع هنوز نتیجه ندارند. شمارها مربوط به اجراهای مشخص‌اند و جمع نمی‌شوند. جدول پایین سابقهٔ اجرا را حفظ می‌کند؛ شواهد تازهٔ این بخش مقدم‌اند.

| اجرای تازه | نتیجهٔ واقعی |
|---|---|
| CI checkpoint76dfcd1 | [run38266486931](https://github.com/AmirMo10/Morphiume/actions/runs/38266486931)،۱۵۰/۱۵۰ در۱۵فایل؛ نصب/اسکن اسرار/migrations/seed/lint/types/audit/build موفق. مرورگر Linux۱۱موفق/هفت شکست در2.2min؛ image skipped، صفر تصویر پذیرفته‌شده |
| شکست مرورگر همان CI | gallery در Chromium/WebKit و full-purchase در Firefox در صفحهٔ ورود ماندند؛ inventory هر سه موتور heading MFA را نیافت؛ catalog Firefox renewal200 را به‌جای429 انتظار داشت.429 فقط برای مورد مشاهده‌شده قطعی است؛ تشخیص سایر شکست‌ها و helperهای fixture جاری است |
| اصلاح fixture ورود بومی | روی runtime منجمد48583، سه ورود معتبر200 و ورود UI بعدی429/X-Retry-After10، نبود headingMFA را بازتولید کردند؛ انتظار10.25s و ورود بومی200 آن را بازیابی کرد. چهار حساب مصنوعی غیرفعال/session0؛ این مکانیزم، علت همهٔ شکست‌های قبلی Linux را ثابت نمی‌کند |
| مرورگر helper اصلاح‌شده |۱۲/۱۲ محلی در272.984489s با صفر skipped/flaky/Playwrightretry؛۴۶diagnostic فقط stage/category/status/interval، دو429 مشاهده‌شده در enrollment/renewal پس از۸.25/۳.25s و TOTP تازه به200 رسیدند. محدودیت/IP/limiter/runtime تغییر نکرد؛ نتیجهٔ Linux تا اجرای همان checkpoint pending |
| CI منبع1a4fa44 | [run38248764072](https://github.com/AmirMo10/Morphiume/actions/runs/38248764072)، verify موفق:۹۷آزمون در۸فایل و۹مورد Chromium/Firefox/WebKit Linux؛ build/lint/types/audit/Gitleaks موفق |
| image همان CI | build بدون secret و native musl WebP موفق؛ Grype نه High در OpenSSL/zlib ثبت کرد؛ publication/deployment اجرا نشد |
| بک‌اند نسخهٔ جاری | full58/58 در۸فایل،168.49s، پیش از آخرین recheck قفل مجوز؛ پس از آن targeted8/8 bulk در32.94s؛ full59 ادعا نمی‌شود |
| تنظیمات ارسال | native-MFA/DB پنج از پنج،8.86s؛ تبدیل دقیق، نسخه/مجوز، قفل ردیف غایب و انقضای proof حین انتظار واقعی advisory lock |
| بازهٔ قیمت | pagination18/18 در28.95s، شامل چهار مورد تازه؛ حدود inclusive صفر/سقف، ارقام محلی، خطای محدوده و جلوگیری از ترکیب قیمت/حجم/موجودی تنوع‌های متفاوت؛ اجرا پس از suite125 بود |
| مجوز تنظیمات/نقش | native-MFA دو از دو در7.85s؛ proof منقضی پس از قفل حساب هدف و نقش لغوشده پس از انتظار تنظیمات، بدون اثر |
| invariant ارسال/refund | delivered→shipped در baseline واقعاً بازتولید شد (یک fail/هشت skip،8.11s)؛ پس از اصلاح،۱۳/۱۳ در84.40s؛ سپس شرط فعال‌بودن MFA و fixture معتبر افزوده و۱۴/۱۴ در91.29s قبول شد. fixture دامنه grant کنترل‌شده دارد و ورود بومی محسوب نمی‌شود؛ issuance بومی در root/QA جدا آزموده شده است |
| full owned regression نهایی | ۷۳/۷۳ در۹فایل،259.92s، بدون skip؛۸واحد/۶۵PG؛ شامل ارسال/refund/عامل فعال و tick/sweep روی schema مهاجرت‌یافتهٔ جدا. fingerprint صف/رزرو public ثابت و cleanup دقیق موفق؛۱۵dead اصلی بدون تغییر. پس از آن guard پیش از connection با۹/۹ در357ms قبول شد؛ branch ساخت role محدود CI تا اجرای واقعی pending |
| native config پس از delta | root config suite هفت از هفت در۲فایل،21.05s، موفق؛ helper فقط429 مشاهده‌شده را با interval واقعی یا rule10s plugin1.7.7 رعایت می‌کند |
| مرورگر کامل build نهایی |۱۲/۱۲ در Chrome154.0.8037.93/WebKit27.2،272.570747s؛ expected12/unexpected0/skipped0/flaky0/retries0. شش spec روی production24244/server48583؛ خرید بومی/پرداخت mock، گالری/موجودی/صفحه‌بندی/ارسال و guard تازهٔ mutation واقعاً اجرا شدند. fulfillment GET/PATCH/replay بدون مبلغ و event مالی؛ CSV سفارش مجاز با پنج ستون غیرمالی/private no-store، CSV محصول و receipt403؛ stock6→5/receipt1/shipment1 |
| صف پیش از استقرار | snapshot14:13:57UTC:708completed/315pending/15dead؛ deadها همه payment.reconcile با۱۲تلاش،۹«payment in progress» و۶«create result unknown» و حساب‌های disabled@fixture.invalid. lineage آزمایشی تأیید شد، نه tick ایجادکنندهٔ هر retry. هیچ replay/تغییرstatus انجام نشد؛ snapshot شناسه‌ها خصوصی است |
| fixture limiter | اجرای اولیهٔ جامع115pass/4skip/1failed suite به‌علت429 ورود fixture؛ fixture اکنون X-Retry-After واقعی را رعایت می‌کند. auth+shipping9/9 قبول شد؛ limiter حذف یا تضعیف نشد |
| build یکپارچه | Next production، worker/migration/seed bundle، closure530فایل و encoder واقعی Windows WebP موفق؛ هیچ secret در build تولید نشد |
| component harness | Chromium با اجزای واقعی و API/router fixture: صفحه‌بندی/فیلتر/نشانی/ارسال/علاقه‌مندی/تعویض حساب موفق؛ جای DB/MFA/E2E واقعی نیست |
| delta UI/metadata | build96791 موفق؛ robots/sitemap دینامیک شدند، Windows WebP موفق؛ harness بازهٔ قیمت/خطای400/scroll region با axe و SSR ورود با delayed JavaScript موفق؛ علت شکست قبلی WebKit هنوز اثبات نشده |
| مرورگر source83122 | اجرای دوم۱۲مورد:۱۰موفق/دو locator قدیمی موجودی؛ سپس Chrome موجودی26.2s و WebKit35.6s موفق. پوشش هر شش سناریو در هر دو موتور قبول شد، نه یک اجرای واحد۱۲/۱۲. native429 با انتظار واقعی۱۰s و کد تازه رعایت شد؛ limiter تغییر نکرد |
| تصویر T25 | در دو موتور، img.decode/naturalWidth16/naturalHeight20 و HTTP200 تصویر مصنوعی آبی پیش از screenshot تأیید شدند؛ عکس واقعی کالا نیست |
| zoom بومی۲۰۰٪ | Chrome154.0.8037.93 headless، چهار HTTP200 route محصولات/حساب/ورودمدیر/راهنما؛ profile جدید و preference بومی، outer/screen ثابت، inner764×485→382×242 و DPR1→2، CSSzoom1/visualViewport.scale1؛ overflow صفر، Tab موفق و WCAG axe صفر؛ شواهد native-zoom-observations.json. آزمون دستی GUI/device/screenreader نیست |
| زیرساخت | guard mount، پایش DB-only و هشدار غیبت با expect-app، syntax/Compose/systemd و metrics15s smoke موفق؛ timer نصب و restore کامل انجام نشده |
| مجوز وابستگی | snapshot29وابستگی مستقیم از metadata نسخهٔ نصب‌شده با منبع/SHA؛ transitive/OS به SBOM تصویر وابسته است |

اجرای جامع۱۲۵/۱۲۵ در۱۲فایل،199.75s، exit0 پس از recheck قفل bulk انجام شد؛ lint و TypeScript سراسری نیز exit0. تغییرات بعدی با آزمون‌های هدفمند جدا در جدول ثبت شده‌اند. هر شش spec مرورگر source83122 در دو موتور، از اجرای کامل و بازاجرا، پذیرفته شد. zoom بومی headless جدا تأیید شد؛ CI Linux و reflow جای دستگاه یا آزمون دستی صفحه‌خوان نیستند.

اجرای نخست مرورگر ویژگی‌های جدید:۱۲مورد در Chrome/WebKit، چهار موفق و هشت شکست. نقص واقعی scrollable-region-focusable جدول سفارش رفع و در harness قبول شد؛ locatorهای قدیمی متن و واحد SQL cleanup5seconds به5s اصلاح شدند. policy تنها با تشخیص نویسندهٔ fixture و snapshot خصوصی اولیه برگردانده شد. مجموعهٔ کامل روی build تازه در حال بازاجراست. نتیجهٔ suite125 به تغییرات بعدی قیمت/مجوز/رابط تعمیم داده نمی‌شود؛ شمارهای هدفمند بالا مستقل ثبت شده‌اند و CI بعدی suite کامل همان commit را اجرا خواهد کرد.

آزمون‌های قدیمی commerce، tick و sweep جهانی را روی DB مشترک اجرا می‌کردند؛ انتقال به schema تولیدشدهٔ جدا با migration/constraints اصلی و runtime DML مستقل اکنون در full73 قبول شد. claim/sweep زمان اجرا تغییر یا فیلتر نشدند. schema/role موقت CI فقط با guardهای محیط و شناسهٔ این اجرای آزمون ایجاد/پاک می‌شوند؛ شاخهٔ ساخت role در CI هنوز نتیجه ندارد. build24244، lint سراسری و WebP واقعی موفق شدند. دو اجرای نخست build نهایی هرکدام۱۰موفق/دو شکست داشتند: اول assertion اشتباه `.irr` به‌جای قرارداد `.amountIrr`، سپس انتظار نادرست403 برای CSV غیرمالی مجاز نقش انبار. این خطاهای آزمون اصلاح شدند؛ خروجی‌های امن قبلی حفظ شدند و سومین اجرای کامل۱۲/۱۲ قبول شد. منبع برنامه در این سه اجرا ثابت بود؛ نتیجهٔ ترکیبی جای اجرای کامل گزارش نمی‌شود.

| بررسی | نتیجهٔ موجود |
|---|---|
| سند اجرایی و native agents | فایل ۵۷۵خطی کامل؛ CLI 0.162.0-alpha.17.2؛ desktop 26.1007.21434؛ اجرای واقعی نقش‌ها |
| Skillها | ۱۰ entrypoint؛ validator پروژه و quick_validate رسمی موفق |
| DB | PostgreSQL 18.6 staging؛ migrationهای 0001–0007 واقعاً اعمال شدند؛ checksumها LF بودند و به تعمیر نیاز نداشتند |
| suite کامل واحد/DB/auth | اجرای تازهٔ root: ۸۵ آزمون، هفت فایل، exit0؛ 128.55s؛ گالری و checksum audit نیز آزموده شدند |
| auth | OTP هم‌زمان/انقضا/replay/بودجهٔ تلاش، identity واحد، MFA TOTP/recovery بومی و نقش لغوشده |
| مالی و انبار | رقابت آخرین واحد/کوپن، idempotency actor/payload، verify/double receipt، refund budget، late payment، outbox retry، bulk/نسخه/رزرو، shipping threshold |
| نوع و lint | TypeScript و ESLint یکپارچه موفق |
| build | Next16.4 optimized production build موفق؛ اصلاح CSP/image در build 52517 نیز موفق |
| مرورگر پیش از اصلاح CSP | چهار مورد Chrome154.0.8037.93/WebKit27.2 موفق؛ 20.1s و 30.5s برای مسیر کامل |
| T25/T17/T19/T12/T05 | MFA/UIproduct/upload/publish، guestOTP، حفظ فرم در 503، unknown سپس paid، receipt1/shipment1/stock3→2، tracking، دسترسی customer دیگر رد؛ بدون انتقال پول واقعی |
| RTL و accessibility | 320px سفارش پس از اصلاح موفق؛ axe صفحهٔ محصول/سفارش و سه صفحهٔ عمومی صفر violation در دو موتور |
| CSP | CspImage و دو hash ثابت اعلان مسیر اصلاح شدند؛ Chrome baseline صفر و اعلان دسترس‌پذیری صحیح؛ هشدار Windows WebKit27.2 با select بومی در HTML جدا، بدون کد/سبک برنامه بازتولید شد. مرتب‌سازی در دو موتور قبول شد؛ سبک دلخواه همچنان رد شد |
| dependency | pnpm audit --prod پس از override محدود esbuild: صفر advisory |
| secret | Gitleaks8.30.1 digest رسمی؛ شش commit موجود، بدون یافته؛ diff نهایی قبل push جدا بررسی می‌شود |
| CI منبع منتشرشده | [run38242058151](https://github.com/AmirMo10/Morphiume/actions/runs/38242058151): verify موفق، ۷۷ آزمون و شش مورد Chromium156.0.8078.4/Firefox157/WebKit27.2 Linux، build/lint/type/audit/history scan موفق |
| container | همان run تصویر اولیه را بدون env ساخت؛ Grype high/critical gate شکست خورد، تصویر منتشر/مستقر نشد. نسخهٔ کم‌حجم جدید تا پذیرش واقعی Linux/scan فقط candidate است |
| restore/load | هنوز نتیجهٔ کامل اجرا ندارند؛ encryption/collector smoke و harness به معنی قبولی restore یا ظرفیت نیست |

پس از اصلاح CSP، چهار مورد مرورگر دوباره موفق شدند: Chrome 24.0s/2.9s و WebKit 33.5s/5.3s. رخداد تشخیصی WebKit مانع جریان آزموده‌شده نبود؛ نسبت‌دادن آن به ابزار تا آزمایش کنترل جدا نتیجهٔ قطعی محسوب نمی‌شود.

پذیرش خروجی standalone تازه ابتدا شکست خورد: فایل native Sharp موجود بود ولی DLLهای همراه Windows در trace نبودند؛ `/api/admin/session` و `/api/cart` خطای 500 دادند. بسته‌بندی اکنون فقط بسته‌های native/libvips همان platform و نسخه را همراه مجوزهایشان اضافه می‌کند و encoder واقعی WebP را پیش از پایان build اجرا می‌کند. پس از اصلاح و restart، چهار regression موجود قبول شدند: Chrome خرید27.3s/عمومی3.9s، WebKit خرید41.9s/عمومی5.8s. پذیرش native Linux/musl هنوز به CI تصویر وابسته است.

دادهٔ مناطق: آزمون مستقل منبع جدید ۱۲ از ۱۲ قبول شد؛ bytes شهر/استان/مجوز با hashهای manifest تطبیق داشتند، تمام ۳۱ استان/۱۱۱۹ شهر رابطهٔ معتبر داشتند و شش مرکز مهمِ جاافتاده در منبع اولیه، در رکوردهای صریح منبع جایگزین حضور داشتند. این آزمون شمار تقسیمات رسمیِ جاری یا پوشش حمل را اثبات نمی‌کند.

گالری واقعی روی standalone اصلاح‌شده: Chrome11.6s و WebKit23.1s، دو از دو موفق. سه upload واقعی، alt/SKU/ترتیب در DB، حذف/ذخیره/reload، thumbnail و aria-pressed، تعویض حجم و جداسازی عکس، 320px/axe، رد خالی‌کردن گالری منتشرشده و حفظ ویرایش پس از بایگانی بررسی شدند. خطای نخست harness از ستون قدیمی SQL بود؛ با JOIN درست به variant اصلاح و همان سناریو دوباره اجرا شد. CI بعدی سه spec در سه موتور، یعنی نه مورد، خواهد داشت؛ نتیجهٔ آن هنوز ثبت نشده است.

راهنمای تکرار: `pnpm lint`، `pnpm typecheck`، `pnpm test` با env/DB جدا، `pnpm build` و مرورگر روی production server. برای این workstation، `E2E_CHROMIUM_CHANNEL=chrome` و انتخاب پروژه‌های `chromium` و `webkit` استفاده شدند؛ Firefox دانلودی با `spawn UNKNOWN` پیش از شروع مرورگر شکست خورد و علت نامعلوم است. همهٔ موتورهای Linux در CI باید جدا اجرا و گزارش شوند.

اعداد واقعی پذیرش در [ماتریس QA](qa/ACCEPTANCE_MATRIX.md)، خروجی بی‌اطلاعات حساس در [خلاصهٔ مرورگر](qa/browser-summary.json)، جزئیات بک‌اند در [CHECKS](backend/CHECKS.md) و متن فارسی در [بازبینی](persian/REVIEW.md) آمده‌اند. trace/password/OTP/کلید/dump به Git یا artifact عمومی منتقل نمی‌شوند.

موارد اجرا نشده: Firefox Windows/دستگاه واقعی/صفحه‌خوان دستی، پوشش همهٔ ترکیب‌های ماتریس پنل، بررسی مستقل امنیت کامل/ASVS، PSP/SMS واقعی و sandbox حساب، CDN/network ایران، restore کامل، alert/offsite و اندازه‌گیری۲۰۰VU/RPS. بخشی از پنل، هزینه/رضایت خرید، مرجوعی/بازپرداخت، نقش انبار و CSV اکنون در دو موتور آزموده شدند. قابلیت‌های مستقلِ هنوز تکمیل‌نشده در IMPLEMENTATION_PLAN ثبت‌اند و نبود دادهٔ کسب‌وکار جایگزین نقص پیاده‌سازی نیست.
