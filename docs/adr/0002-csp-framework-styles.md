# CSP و سبک اعلان مسیر

آزمون واقعی production در Chrome 154 و WebKit 27.2، نقض enforce برای سبک داخلی تصویر Next/Image و اعلان مسیر را ثبت کرد؛ نقض script مشاهده نشد. استفاده از تصویر محلی با ابعاد مشخص و CSS خارجی، سبک `color:transparent` غیرضروری را حذف می‌کند. تصاویر مشتق در Sharp پردازش می‌شوند و SVG هویت دارایی ثابت پروژه است.

Next.js پین‌شدهٔ 16.4.0 در `app-router-announcer.js` برای اعلان دسترس‌پذیری، دو `style.cssText` ثابت می‌سازد. اعلان داخل shadow DOM است؛ hash فقط همان دو رشته در `style-src-attr` مجاز است. `script-src` و style element همچنان nonce دارند؛ `unsafe-inline` و eval در production اضافه نشده‌اند. رشته‌ها و SHA256 در `src/proxy.ts` و شواهد QA ثبت هستند؛ تغییر نسخهٔ Next باید تطبیق آن‌ها و آزمون مرورگر را دوباره انجام دهد.

مرجع رفتار hash attribute: [پیش‌نویس CSP3](https://w3c.github.io/webappsec-csp/#unsafe-hashes-usage). وضعیت سند W3C پیش‌نویس است؛ پشتیبانی در موتورهای واقعاً اجراشده جداگانه آزموده می‌شود. تا پیش از بازآزمایی، صفر بودن violation پس از اصلاح ادعا نمی‌شود.
