# Read-only CI diagnosis — fd74961

Observed on 2026-10-12 for commit `fd749616a31706a1c177bb107bb07c8aa73f9643`, [run 38286418414](https://github.com/AmirMo10/Morphiume/actions/runs/38286418414), verify job `114935764290`. The job passed **276/276 unit and PostgreSQL tests in 27 files**, then **30/33 Linux browser cases in 6.8 minutes**. The image job `114939234847` was skipped; this run produced no accepted runtime image.

The GitHub connector supplied the private verify-job log. Inspection exported only fixed stages/categories, statuses, engine/spec, timing and retry-header diagnostics. The artifact listing identifies `sanitized-browser-evidence`, ID `11763537265`, 3202 bytes, reported digest `sha256:25c9021e66f32ee71243a2dd39926d2c99215877150a795ff98b3e0c96d20200`. Its download reference was obtained without exposing the temporary URL; ZIP bytes were not independently parsed or hashed locally. The classifications below come from the fetched job log and exact committed source, not an inferred artifact payload.

## Three distinct observed failures

| Engine / case | Observed failure | Evidence limit |
| --- | --- | --- |
| Firefox / collection-routes | Rename POST expected 200, returned **500**, at test line 41; case duration 1.2 seconds. Native password sign-in, MFA enable and TOTP enrollment had each returned 200. | No server failure category, exception or database cause was captured. No assertion on alias 308 was reached in this case. |
| Firefox / full-purchase | **Admin password sign-in**, not customer OTP, returned **429 on both attempts**; assertion in `native-auth-actions.ts:62`; case duration 9.2 seconds. | The first response supplied a usable `X-Retry-After: 7`. The second diagnostic was `absent`, meaning no accepted bounded retry interval, not independently proving every response header was absent. |
| WebKit / shipping-consent | Test code threw **TypeError reading `version` from undefined**, at line 17; case duration 8.9 seconds. The preceding shipping GET's parsed JSON had no `data` value. | That GET status and error category were not asserted/captured. The failure is not a demonstrated transport error or a proven 429/500. The PUT was not reached. |

Safe full-purchase chronology, UTC:

- `17:51:49.8410085`: admin password sign-in attempt 1, HTTP 429, usable `x-retry-after`, 7 seconds.
- `17:51:57.1919895`: the same stage attempt 2, HTTP 429, retry diagnostic `absent`.

The responses were 7.350981 seconds apart. The existing helper waited the observed 7 seconds plus its 250 ms margin and permitted only one retry. The failure therefore does not establish that the helper ignored the first interval. No customer OTP action was reached.

Safe WebKit shipping chronology, UTC:

- `17:55:38.7740824`: admin password sign-in attempt 1, 429, usable `x-retry-after`, 7 seconds.
- `17:55:46.1476688`: attempt 2, 200.
- `17:55:46.3434853` / `17:55:46.4618301`: MFA enable / enrollment, each 200.
- `17:55:46.7154092` / `17:55:46.7309502`: customer OTP send / verify, each 200.

Successful retry and subsequent authentication do not explain the later missing shipping payload. The fetched job log contains no `request.completed` server records; CI redirected them to a private server log that this checkpoint did not upload or summarize.

## Source-confirmed mechanism to investigate

Exact committed `src/server/auth/index.ts` unconditionally applies the application's `admin-auth:global` counter, 200 calls per fixed 60-second window, in `hooks.before`. `src/server/auth/otp.ts` throws BetterAuth `APIError(TOO_MANY_REQUESTS)` when that counter is exceeded, without setting a retry header. This application hook differs from BetterAuth's built-in per-path/IP limiter.

Installed BetterAuth **1.7.7** `api/to-auth-endpoints.mjs` and `api/dispatch.mjs` show that direct `auth.api.*` calls also run configured before hooks. Therefore `adminAuth.api.getSession`, used by `src/server/auth/actors.ts` for ordinary protected requests, also consumes the application counter. The library's built-in limiter applies to client requests and gives sign-in its separate **3 requests / 10 seconds** rule; it calculates its header using `Math.ceil`, so the captured 7.351-second response interval is not evidence of rounding down that header. [Official rate-limit documentation](https://better-auth.com/docs/concepts/rate-limit), [server API documentation](https://better-auth.com/docs/concepts/api).

Exact committed `src/server/http.ts` converts SyntaxError, CommerceError and ZodError explicitly, then converts other thrown objects to `INTERNAL` HTTP 500. A BetterAuth APIError from a direct session call therefore follows the generic 500 branch. This is a **source-confirmed possible mechanism** for an ordinary admin API 500 and a distinct headerless application-auth 429. No captured counter value or original server event proves it caused either original application failure. Database constraint/deadlock, unrelated exceptions and the shipping GET status remain unclassified.

The documentation CLI was unavailable in the active PATH; official BetterAuth documentation and the exact installed implementation were read instead of relying on recalled library behavior.

## Proposed correction and validation contract

1. Add a pure allowlist sanitizer for private `request.completed` HTTP-500 server evidence. Accept only fixed route aliases and failure enums, bounded integer duration, HTTP status, server-generated UUID and valid UTC event time. Never copy error messages, SQL/SQLSTATE, parameters, order/payment IDs, headers, cookies, contact data or raw log lines. Export a bounded safe JSON artifact from both verify and image runtime logs. Root owns its CI wiring and application observability.
2. Before any shipping response field access, assert its actual HTTP status and validate the required success shape. Emit only a fixed shipping-read stage/status and whitelisted category if available. Keep 200 required; do not retry unknown 500s or allow missing data. This is a proposed test improvement, **not yet applied or run** during this diagnosis.
3. In an explicitly released controlled database window, reproduce the application's global-hook budget separately from native per-path limiting. Verify protected-session reads, APIError response mapping and header timing with actual statuses; do not reset counters, spoof IPs, raise limits, alter clocks or create synthetic MFA grants. Application changes belong to root. Preserve the one observed-429 retry budget; do not add unrelated retries or blanket timeouts.
4. After an owner-approved correction and frozen rebuild, rerun the affected scenarios and the complete three-engine Linux acceptance on the exact commit. Local Windows Firefox remains unavailable; no Linux reproduction or new runtime acceptance is claimed here.

No application/test source, runtime, native account, shared PostgreSQL data, limiter row or public fingerprint was changed by the read-only diagnosis. Existing Linux results and prior local 22/22 evidence remain distinct checkpoints.
