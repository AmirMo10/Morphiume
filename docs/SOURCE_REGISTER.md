# منابع و شواهد

تاریخ مشاهدهٔ موارد زیر: ۲۰۲۶-۱۰-۱۲. هر منبع برای تصمیم مرتبط استفاده می‌شود؛ لینکِ خوانده‌نشده، بررسی‌شده محسوب نمی‌شود.

| منبع | استفاده/شاهد |
|---|---|
| https://github.com/gitleaks/gitleaks#configuration | مشاهده۲۰۲۶-۱۰-۱۲: useDefault=true و ruleallowlists/AND/secret+paths؛ exception فقط publicprofileSHAدقیق/دوguard و canaryباینری واقعی؛ هنوز اسکن جدید باید ثبت شود |
| فایل صاحب پروژه در docs/spec | ۵۷۵ خط کامل؛ مشخصات اجرایی و T01–T30 |
| https://learn.chatgpt.com/docs/agent-configuration/subagents | TOML مستقل با name/description/developer_instructions؛ سقف هم‌زمانی؛ متن Markdown واقعی بازیابی شد |
| https://learn.chatgpt.com/docs/build-skills | discovery پوشهٔ .agents/skills و frontmatter |
| https://nextjs.org/docs/app/getting-started/installation | App Router، Node حداقل 20.9؛ نسخهٔ نمایش‌داده‌شده 16.4.0 |
| https://registry.npmjs.org/next/latest | Next 16.4.0 و license/engine واقعی |
| https://registry.npmjs.org/better-auth/latest | Better Auth 1.7.7؛ peer compatibility به‌کمک عامل تجارت |
| https://registry.npmjs.org/drizzle-orm/latest | stable 0.45.4؛ از rc استفاده نمی‌شود |
| https://registry.npmjs.org/pg/latest | 8.23.1 |
| https://registry.npmjs.org/react/latest | 19.3.0 |
| https://api.github.com/repos/gitleaks/gitleaks/releases/latest | 8.30.1، digest آرشیو Windows/Linux؛ دانلود Windows و اسکن واقعی تاریخچه |
| https://api.github.com/repos/anchore/grype/releases/latest | 0.120.1، digest آرشیو Linux؛ تصویر اولیه واقعاً gate high را رد کرد، بدون انتشار |
| https://raw.githubusercontent.com/anchore/grype/v0.120.1/cmd/grype/cli/options/grype.go | flags دقیق output/file/fail-on برای گزارش JSON و gate ثابت بررسی شدند |
| https://github.com/tafakoritech/Provinces-and-Cities-of-Iran-Dataset | snapshot MIT pin/hash، ۳۱ استان/۱۱۱۹ شهر صریح؛ پوشش رسمی/ارسال ادعا نمی‌شود؛ docs/LOCATIONS |
| https://github.com/actions/checkout و actions/setup-node | v6 با commitهای remote tag مشاهده‌شده و SHA ثابت در workflow |
| https://w3c.github.io/webappsec-csp/#unsafe-hashes-usage | پیش‌نویس CSP3 و hash دقیق style attribute؛ همراه source واقعی Next16.4 و آزمون دو موتور |

CLI محلی: `codex --version` → `0.162.0-alpha.17.2`؛ `codex features list` → `multi_agent stable true`. Desktop tool → `26.1007.21434`, build `13901`, channel `prod`, update `up_to_date`. این مشاهده به معنای stable بودن CLI alpha یا جدیدترین نسخهٔ جهانی نیست.

Context7 از pnpm dlx امتحان شد ولی به‌علت dependency مفقود chalk اجرا نشد؛ منابع رسمی مستقیم جایگزین شدند. منابع طراحی و پرداخت/زیرساخت در تحویل تخصصی `docs/design`, `docs/backend`, `docs/ops` ثبت و در پذیرش یکپارچه می‌شوند.
