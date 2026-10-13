# محیط generator لینوکس — ۲۰۲۶-۱۰-۱۳

این گزارش inventory و آماده‌سازی واقعی WSL است؛ پذیرش native سه‌موتوره، مجموعهٔ کامل۷۸ و ظرفیت۲۰۰ اجرا نشده‌اند. Docker Desktop راه‌اندازی نشده است. نصب و کنترل مصنوعی بعد از inventory با مجوز جداگانهٔ هماهنگ‌کننده پیش می‌روند؛ نتیجهٔ نهایی هر مرحله جدا ثبت می‌شود.

## مشاهدهٔ واقعی پیش از نصب

در `03:56:13.904Z` Ubuntu-24.04 از حالت Stopped با فرمان headless شروع شد: exit0، مدت9821ms. inventory در `03:58:15Z` با exit0/1162ms ثبت شد. Ubuntu24.04، Linux x86_64، kernel `6.18.33.2-microsoft-standard-WSL2`، Python3.12.3، Git2.43.0 وcurl8.5.0 در دسترس بودند. چهارCPU،16769462272byte حافظه و1021261348864byte فضای آزاد در filesystem لینوکس مشاهده شد؛ این مقادیر ظرفیت آزموده‌شده نیستند.

Node/pnpm/npm/corepack بومی، executable مرورگرهای Chromium/Firefox/Chrome، packageهای global Playwright وcache مرورگر لینوکس وجود نداشتند. مسیر workspace ویندوز قابل خواندن بود؛ node_modules ویندوز برای لینوکس استفاده نشد.

دو GET بدون احراز هویت به health انجام شد: localhost ویندوز/port3004 از داخل WSL به transport نرسید؛ IP خصوصی/port80 پاسخ503 داد. هیچ cookie/header محرمانه ارسال یا body چاپ نشد. `wslinfo` حالت **NAT** را تأیید کرد. وجود route کرنل، اتصال TCP موفق نیست. دسترسی localhost در حالت NAT با دسترسی mirrored متفاوت است؛ مرجع [مستندات رسمی شبکهٔ WSL](https://learn.microsoft.com/en-us/windows/wsl/networking). هیچ listener عمومی/firewall/Docker تنظیم نشد.

## source و runtime پین‌شده

workspace خصوصی `/var/tmp/morphiume-linux-native-d7a36bb4-20261013T035613Z` باmode700 ساخته شد؛ rawlogها600 هستند. snapshot نخست از Gitarchive دقیق `d7a36bb4df0ed97792ee508b892774be589654cc` است:776member،7485440byte،SHA256 `33c53e2d9759e56b5f3c737fc9e1c3d8f9e70c670692dcfd6d46e0b2d36c897d`. archive در انتقال byteبرابر بود؛ تغییرهای working tree،node_modules،.local وcredentialها وارد آن نشدند. D7source محفوظ ماند. snapshot تازهٔ جدا از commit منتشرشدهٔ `db928f4b5a84f65ac24be5257f43ca5b90c8bddd` در `/source-db928f4` زیر همین workspace ساخته شد:777member،7495680byte،SHA256 `8f14d856f0573810e6d45b3dbdb4911a8496d18f04eeb18208b7393e239f207a`. نصب frozen آن8434ms/exit0 بود؛661file tracked مستقل hashشدند، صفر تغییر وlock ثابت.

Node **24.21.0 linux:x64** واقعاً دانلود/extract/version-check شد:31890184byte،SHA256 `fd8e59d5a511510f6a298afb548f18c7d2b1be404d8b4a27d94fbe49f56cb2d6` با [SHASUMS رسمی همان نسخه](https://nodejs.org/dist/v24.21.0/SHASUMS256.txt) برابر بود؛ مرحلهexit0/20278ms. شرط نسخهٔ مخزن `>=24.19.0 <25` است.

نخستین آماده‌سازی pnpm در925ms/exit1 متوقف شد: npm نگاشت یک فایل یکسان `/dev/null` به user/global config را رد کرد. هیچ frozen source/browser install در آن تلاش انجام نشد؛ لاگ شکست محفوظ است. دو فایل خالی خصوصی جدا600 وcapture جدید استفاده شد؛ pnpm11.25.0 واقعاً در4569ms/exit0 نصب ونسخه‌اش تأیید شد. frozen-lock install در43459ms/exit0 موفق شد وlock تغییر نکرد.

مرحلهٔ رسمی Playwright1.64.0 در89392ms/exit1 پایان یافت:243 خط واقعی «Setting up» از apt ثبت شد، اما دانلود Chromium با پنج پاسخ403/AccessDenied از CDN رسمی شکست خورد. cache دارای صفرdirectory موتور وdownloadcompletion صفر است؛ هیچengine اجرا نشد. این نتیجه پذیرش engine یاnative نیست. فرمان مجاز: `pnpm exec playwright install --with-deps chromium firefox webkit`. بستهٔ نصب‌شدهٔ1.64 تعریف native Ubuntu24.04-x64 دارد:12tools،21Chromium،25Firefox،52WebKit package-entry، با هم‌پوشانی. این فهرست درخواست dependency است، نه تعداد packageهای واقعاً نصب‌شده. [نیازمندی‌های رسمی](https://playwright.dev/docs/intro#system-requirements) Ubuntu24.04/WSL را پوشش می‌دهند و [مستندات مرورگر](https://playwright.dev/docs/browsers) وابستگی نسخهٔ browser به نسخهٔ Playwright وinstall-with-deps را بیان می‌کنند. ابزارCLI مستندات اجرا نشد؛ منابع رسمی مستقیم وcode نصب‌شده بررسی شدند.

## مرز اجرا و کار باقی‌مانده

QA هیچ SSHkey/env/ownerURL منتقل نکرد وهیچ SQL،fixture،nativeOTP/MFA،Morphiume browser،worker،migration یاnetwork-load اجرا نکرد. هماهنگ‌کننده مالک انتقال credentialDML/tunnel وbinding آن به source تازه است؛ نتیجهٔ آن مستقل از این inventory ثبت می‌شود. endpoint3004،secretها وپایگاه تازه باید قبل از native بعدی در پروف خواندنی واقعی یکسان ثابت شوند.

پس از آماده‌شدن browser، فقط echo-control واقعی loopback باcookie **مصنوعی** وبدون route interception مجاز است. source منتشرشدهٔ echo دوengine دارد؛ افزودن Firefox وبازگشت Chromium به binarybundled تنها درcopy خصوصی باbefore/after SHA/diff مجاز است. canonicalOrigin وCookie-omission وassertionهای اصلی ثابت‌اند. نتیجهٔ آن به source دوengine یاnative کامل تعمیم داده نمی‌شود. هیچ browserflag/policy-bypass/quotareset/retryافزوده مجاز نیست؛ پذیرش native وfull78 فقط پس از GO تازه/frozen source/window جدا اجرا خواهند شد.

## مسیر بعدی cache رسمی

از آنجا که دانلود رسمی همان نسخه در GitHub Actions در دسترس بود، هماهنگ‌کننده آماده‌سازی workflow/exporter جدا را مجاز کرد. [قرارداد browser toolchain](BROWSER_TOOLCHAIN_CACHE.md) و8/8 آزمون نهایی واقعی Node/Linux در469ms آماده‌اند؛ workflow هنوز توسط QA منتشر یا واقعاً اجرا نشده وartifact رسمی وارد نشده است. هیچ echo،launch سهengine،native21/full78 یاcapacity اجرا نشده است. شکست دانلود اولیه محفوظ است؛ منبع نامعتبر،TLS/browserflag bypass،cache قدیمی یاحذف شرط Cookie-omission استفاده نشد.
