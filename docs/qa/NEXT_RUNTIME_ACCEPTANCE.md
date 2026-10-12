# پذیرش runtime بعدی — هنوز اجرا نشده

این فهرست برنامهٔ آزمون است، نه نتیجه. اجرای browser/API/DB فقط پس از اعلام هماهنگ‌کننده دربارهٔ build، migration و slot مشترک آغاز می‌شود. ابزارها و داده‌های auth بومی/checkout قبلی حفظ می‌شوند؛ freshness، limit، IP و زمان دست‌کاری نمی‌شوند.

- collection و alias: مسیر slug اصلی، alias قدیمی با HTTP308 و Location دقیق، slug ناشناخته HTTP404؛ واکنش مرورگر و metadata همان مقصد. source registry/trigger و انتقال نام را با fixture مستقل و audit واقعی بررسی کنیم.
- presentation/config: بارگذاری عمومی از دادهٔ واقعی منتشرشده، metadata معنایی همان محتوا، محیط آزمون آشکار؛ مدیر مجاز با MFA تازه ذخیره کند و نقش ممنوع/نسخهٔ قدیمی رد شود. policy مشترک فقط با شرط آخرین نویسندهٔ fixture و همان قفل بازگردد.
- wrapper بومی auth و mock: ورود/MFA/OTP واقعی، وضعیت400/429/503 متمایز و فقط انتظار مجاز پس از429 ثبت‌شده؛ سرویس کنترل‌شده از live جدا بماند.
- failure بازپرداخت و return UI: از خرید کنترل‌شدهٔ واقعی به درخواست مشتری، تصمیم مدیر و نتیجهٔ ناموفق/موفق adapter برسیم؛ state terminal/replay و ledger/receipt/shipment واقعی را مستقل بررسی کنیم. failure تاریخی تغییر یا حذف نشود؛ fresh factor/actor/payload conflict طبق source نهایی بررسی شود.
- reports: HTTP و UI مبلغ‌های تجمیعی دقیق، timezone و permission/no-store را با PG مستقل مقایسه کنیم؛ fixture سفارش پرداخت‌شده از checkout ایجاد شود، نه paid SQL جعلی. مالی برای fulfillment پنهان بماند و CSV مجاز وضعیت فقط پنج ستون غیرمالی داشته باشد.

نتیجهٔ جاری۱۲/۱۲محلی و۱۷/۱۸CI متعلق به برنامهٔ قدیمی است و این قابلیت‌های بعدی را اثبات نمی‌کند. پیشنهاد guard دقیق DB `morphiume_staging_runtime` هنوز فعال نشده؛ پذیرش stage/load/restore تنها پس از تأیید جداگانهٔ هماهنگ‌کننده، تصویر واقعاً پذیرفته‌شده و deployment کنترل‌شده آغاز می‌شود.
