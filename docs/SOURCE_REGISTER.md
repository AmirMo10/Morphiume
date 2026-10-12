# منابع و شواهد

تاریخ مشاهدهٔ موارد زیر: ۲۰۲۶-۱۰-۱۲. هر منبع برای تصمیم مرتبط استفاده می‌شود؛ لینکِ خوانده‌نشده، بررسی‌شده محسوب نمی‌شود.

| منبع | استفاده/شاهد |
|---|---|
| فایل صاحب پروژه در docs/spec | ۵۷۵ خط کامل؛ مشخصات اجرایی و T01–T30 |
| https://learn.chatgpt.com/docs/agent-configuration/subagents | TOML مستقل با name/description/developer_instructions؛ سقف هم‌زمانی؛ متن Markdown واقعی بازیابی شد |
| https://learn.chatgpt.com/docs/build-skills | discovery پوشهٔ .agents/skills و frontmatter |
| https://nextjs.org/docs/app/getting-started/installation | App Router، Node حداقل 20.9؛ نسخهٔ نمایش‌داده‌شده 16.4.0 |
| https://registry.npmjs.org/next/latest | Next 16.4.0 و license/engine واقعی |
| https://registry.npmjs.org/better-auth/latest | Better Auth 1.7.7؛ peer compatibility به‌کمک عامل تجارت |
| https://registry.npmjs.org/drizzle-orm/latest | stable 0.45.4؛ از rc استفاده نمی‌شود |
| https://registry.npmjs.org/pg/latest | 8.23.1 |
| https://registry.npmjs.org/react/latest | 19.3.0 |

CLI محلی: `codex --version` → `0.162.0-alpha.17.2`؛ `codex features list` → `multi_agent stable true`. Desktop tool → `26.1007.21434`, build `13901`, channel `prod`, update `up_to_date`. این مشاهده به معنای stable بودن CLI alpha یا جدیدترین نسخهٔ جهانی نیست.

Context7 از pnpm dlx امتحان شد ولی به‌علت dependency مفقود chalk اجرا نشد؛ منابع رسمی مستقیم جایگزین شدند. منابع طراحی و پرداخت/زیرساخت در تحویل تخصصی `docs/design`, `docs/backend`, `docs/ops` ثبت و در پذیرش یکپارچه می‌شوند.
