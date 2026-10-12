# Backend source register

Observed 2026-10-12. Official pages and npm registry metadata were read; no real PSP call was made. Context7 MCP was unavailable and npx was absent in the initial bundled runtime, so direct official sources were used.

| Source | Use |
|---|---|
| https://orm.drizzle.team/docs/get-started/postgresql-new | pg driver support and reviewed migration path; guide advertises RC so stable registry tags were deliberately selected |
| https://orm.drizzle.team/docs/column-types/pg | PostgreSQL types |
| https://node-postgres.com/features/transactions | Same-client short transactions |
| https://www.postgresql.org/docs/current/explicit-locking.html | Row locks, lock ordering and deadlock retry |
| https://better-auth.com/docs/adapters/drizzle | Split adapter package and pg schema mapping |
| https://better-auth.com/docs/plugins/phone-number | OTP hook; docs explicitly require atomic custom consumption for parallel strict single-use |
| https://better-auth.com/docs/plugins/2fa | Password/TOTP and recovery; default passwordless enforcement exclusions |
| https://better-auth.com/docs/plugins/passkey | Optional future passkey support, not currently enabled |
| https://better-auth.com/docs/concepts/session-management | Revocable DB sessions |
| https://better-auth.com/docs/concepts/rate-limit | Native database limiter requires id primary key, unique key, count and bigint lastRequest; reconciled with installed 1.7.7 schema |
| https://www.zarinpal.com/docs/paymentGateway/connectToGateway | Request, redirect, callback, verify 100/101 |
| https://www.zarinpal.com/docs/paymentGateway/moreFeatures/currency | IRR/IRT explicit request unit |
| https://www.zarinpal.com/docs/paymentGateway/otherMethods/Inquiry | Inquiry states, no substitution for verify |
| https://www.zarinpal.com/docs/paymentGateway/moreFeatures/reverse | 30-minute reverse and IP prerequisite |
| https://www.zarinpal.com/docs/paymentGateway/sandBox | Sandbox host/authority/merchant contract |
| https://www.zarinpal.com/docs/paymentGateway/errorList | Amount/merchant/authority mismatch and reverse errors |

Registry metadata via `registry.npmjs.org/{package}` reported stable: drizzle-orm 0.45.4 Apache-2.0; drizzle-kit 0.31.11 MIT; pg 8.23.1 MIT; better-auth 1.7.7 MIT; @better-auth/drizzle-adapter 1.7.7 MIT. Better Auth peer ranges accept selected stable Drizzle, Next 16 and React 19. Registry compatibility is not proof of runtime integration.
