# ADR 0001 — یک برنامهٔ ماژولار با PostgreSQL

پذیرفته‌شده در ۲۰۲۶-۱۰-۱۲: Next.js 16.4.0 و React 19.3.0، TypeScript strict، PostgreSQL، Drizzle 0.45.4 با pg 8.23.1؛ Better Auth 1.7.7 برای سشن، ورود و MFA. نسخه‌ها از registry رسمی و peerهای واقعی بررسی شده‌اند؛ lockfile پس از نصب مرجع resolution است.

تراکنش مالی/انبار در PostgreSQL؛ worker مستقل outbox و reconciliation؛ shared rate limit در DB تا وقتی اندازه‌گیری نیاز به کش جدا را نشان دهد. یک schema owner، یک lockfile owner و قرارداد typed مشترک از برخورد عامل‌ها جلوگیری می‌کند.

هزینهٔ نگهداری: state machine و invariants تجارت باید با آزمون مستقل نگهداری شوند؛ adapterهای PSP/SMS واقعی به دسترسی صاحب کسب‌وکار وابسته‌اند. Kubernetes، microservice، موتور جست‌وجو و AI در runtime اولیه لازم نیستند.

پول BIGINT IRR، JSON string، تبدیل تومان فقط در utility مرکزی و adapter. `DEPLOYMENT_ENV` از `NODE_ENV` جدا؛ build بهینهٔ staging با mock به معنای live نیست. طرح live با mock/secret ناقص fail-closed است.
