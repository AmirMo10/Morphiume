# E4 protected private-IP native handoff

Prepared source only. No SSH, HTTP, PostgreSQL, browser, worker, credential,
profile, timer or Nginx action ran for this task. Root owns the released execution
window and activation/acceptance dispatch. The image stays accepted E4
`e4bed691dc938a9c0f79022696d24f063ad97724`; independently bind the actual Ops/Engine
proof and fresh private-IP access profile before running. The existing SSH67
profile cannot be reused as the candidate private-IP profile.

Root's current [E4 restore acceptance](../ops/E4_RESTORE_EXECUTION.md) records a
separate6/6 clone check at3101. The retained source fixture SHA is
`cea16d8896babf6303e1f29c287dcd4a433f5a6668cda489594e4bf64e27395d`; its staged
T25 at3100 passed1/1, with native password/TOTP, guest OTP, unknown→successful
payment, stock, shipment and media evidence. **Unknown→success is not a successful
callback replay.** The remaining seven-check3100 baseline `paymentReceiptDedup`
must be observed against the deployed runtime and retained customer before Root
creates the complete baseline record. The3101 clone replay cannot supply it.

## Executable runner and inputs

The existing executable remains `node node_modules/@playwright/test/cli.js test`.
The new `tests/e2e/private-preview.config.ts` selects only the existing
`full-purchase.spec.ts`, Chromium/Firefox/WebKit, one worker, zero retries/skips,
120s per test,10s actions and10min global budget. No channel/launch flag/secure-
context override is added. Ordinary `tests/e2e/playwright.config.ts` remains
unchanged at25min and must not be used for this20min preview acceptance lease.

Use a fresh private off-server Linux runner with the byte-bound tool/test source,
the accepted three browser binaries/dependencies and an actually approved network
route/source IPv4. CI localhost results and the old dated WSL route inventory do
not establish access to192.168.240.51. The runner has **no `.env.local`** or owner
credential. The existing validated operator profile loader can supply the runtime
app settings; revalidate its actual new private-IP profile/config hashes first.

Required environment, supplied by Root's protected launcher without printing it:

- `E4_PRIVATE_PREVIEW=1`, `APP_BASE_URL=E2E_BASE_URL=http://192.168.240.51`;
- `DEPLOYMENT_ENV=staging`, `PAYMENT_PROVIDER=SMS_PROVIDER=mock`;
- explicit `DATABASE_URL` for `morphiume_runtime_app` at the existing loopback
  `127.0.0.1:15434/morphiume_staging_runtime`, no URI parameter override;
- actual runtime `AUTH_SECRET`, `ADMIN_AUTH_SECRET`, `MOCK_CONTROL_SECRET` and
  `MEDIA_ROOT=/app/media`, following the existing server config contract;
- `E4_PREVIEW_PROFILE_SHA256`: actual fresh private-IP profile64hex, not SSH67;
- `E4_PREVIEW_BASIC_USER/PASSWORD`: Root reads the new protected transaction's
  Basic JSON and passes these in memory; username `preview-<12lowerhex>` and
  password64lowerhex are the specific frozen preview credential generator format;
- existing validated browser-cache/Node/toolchain paths, no `DEBUG`, `PWDEBUG`,
  `PLAYWRIGHT_DEBUG`, `NODE_DEBUG`, `E2E_CHROMIUM_CHANNEL`, owner/bootstrap credentials or
  `QA_RETAIN_RESTORE_FIXTURE`.

The minimal helper supports the protected-launcher **env variant only**; direct
`E4_PREVIEW_CREDENTIALS_PATH/SHA256` values are rejected. It never reads a Basic
file or dotenv. Root must validate/protect the file it reads, then spawn with only
the authorized environment. Do not put credentials in command argv, public
annotations, config/report metadata, traces or error messages. The config never
serializes `httpCredentials`; the test injects origin-scoped credentials with
`send: always` into active admin/customer/foreign contexts and their API request
contexts. Browser authentication still handles the actual Nginx challenge.
Intentional unauthenticated/wrong-Basic contexts are separate perimeter probes.

After the independent prerequisites and Root GO, the exact selection is:

```text
node node_modules/@playwright/test/cli.js test -c tests/e2e/private-preview.config.ts full-purchase.spec.ts --project=chromium --project=firefox --project=webkit --output=<actual-private-run-directory>/browser
```

No shell-inline Basic value or connection string belongs in that command. The
command is prepared, not executed here. Keep the report, three explicit T25
screenshots and native-status records in the fresh private copy. Automatic traces,
videos and failure screenshots are off. Existing explicit screenshots contain
synthetic UI and do not expose Basic credentials. Fixed preview failures replace
transport messages that could contain Basic request details. Root must sanitize
any independently captured wrapper/server evidence before public reporting.

## Ten checks per engine

Every engine must complete one actual T25 and its final cleanup. Only then does
`private-preview-proof` annotate the ten independently reached checks. The final
Playwright report must also show3/3 passed, zero unexpected/skipped/flaky/retries;
an annotation alone cannot establish PASS or `noUnexpectedBusinessMutation`.

| Check | Source and actual observation required |
| --- | --- |
| nativeLogin | Existing real buyer OTP verification plus native get-session200, verified phone and SQL-owned customer identity |
| adminMfa | `loginAdmin` real password/TOTP enrollment; actual guarded admin-session200 and `mfaVerified=true` |
| csrf | Authenticated API POST/cart with absent Origin, wrong Origin and cross-site Fetch-Site must each yield app403/FORBIDDEN with actual server UUID; perimeter401 is insufficient |
| cookies | Native admin/customer session cookies on192.168.240.51: HttpOnly, path/, SameSiteLax and non-Secure for this explicitly approved HTTP preview; no cookie copying/domain rewrite |
| ownedOrder | Owned API200/no-store/valid server UUID; existing test also proves unauthenticated and different verified-customer denial |
| paymentReceiptDedup | One real GET/mock callback303 to the IP-owned order, using the saved attempt authority; RR before/after exact order/items/attempt/primary receipt/stock/reservation/commit/shipment tuple matches |
| newT25 | Existing product UI creation/upload/publication, guest cart, quote/consent, OTP, controlled unknown→paid, one stock effect and owned tracking; final cleanup succeeds |
| mediaHashes | Both uploaded and displayed WebP bytes are refetched and SHA-compared to their earlier actual bodies, alongside existing decode/MIME/private-path tests |
| perimeter | Bare valid-client requests to document/health/auth/admin/test/media are401 with Basic challenge; wrong Basic401; authenticated wrong Host404 |
| headers | Owned private API no-store/server UUID; real order document200/CSP frame-ancestors none/nosniff/DENY/referrer policy/noindex/no-store |

The additional callback is **not** POST/test/payments/outcome. It neither resets
the mock result nor creates a new attempt. The original controlled UI503 remains
a one-shot `route.fulfill` error-state test and is explicitly labeled
`controlledUi503Count=1`; it cannot become native-server/SMS outage/perimeter
evidence. Native-status records retain the actual attempts/statuses. The existing
`native-auth-actions.ts` behavior and limits are unchanged: at most one actual429
recovery per action, observed Retry-After/X-Retry-After timing, its existing bounded
known60s fallback when absent, no limiter reset/fake IP/clock interception, zero
Playwright test reruns. These are distinct from the stricter restore-only helper.

Before the first fixture write, the preview branch actually reads the current
runtime DML role/DB in an RR read-only transaction: PG180006,13 migrations,53 tables,
no super/createDB/createRole/replication/RLS-bypass/inherit/membership/owner/CREATE/
TRUNCATE rights. Canonical migration/accepted-image/profile byte checks remain
Root's separate preflight, not a claim made by a count alone. Queries ROLLBACK and
use3s statement/1s lock bounds. The callback tuple is scoped to this test's order
and product; it does not query/operate the original staging DB or global queue.

The IP test creates three new synthetic purchases and archives/disables only its
own fixture products/users/sessions in the existing `finally` path. Financial,
receipt, shipment, alias and event history stays retained. The old3100 fixture is
never overwritten, disabled, repriced or recycled; preview retention is rejected.
Root independently audits cleanup and planned/unrelated financial effects before
setting `noUnexpectedBusinessMutation=true`. Expected OTP/session/provider
verification and worker effects are reported honestly; no global row equality is
inferred from scoped callback comparisons.

## Root's finite activation and evidence sequence

1. In a released capacity/native/DB window, observe the one successful callback
   replay on the **retained3100** order. Read scoped before/after receipt IDs,
   attempt/order/money/line values, commitment/reservation/stock/shipment; use a
   genuine retained-customer native session and saved authority; no outcome setter,
   limiter reset, worker sweep or new checkout. Preserve the existing fixture and
   original T25/restore reports. The restore-only CLI rejects3100; do not relabel it.
2. Root constructs actual root600 seven-check `metrics/preview-baseline.json` and
   already accepted3101 `recovery-accepted.json` aliases exactly as
   `preview.validate_baselines` requires. Keep the different runtime/clone origins
   and their original raw hashes/evidence intact.
3. Re-observe the authorized generator and the excluded source. Check the finite
   IPv4 allowlist and Basic protection for every route, including media and login.
   Check IPv6, default hosts, alternate interfaces and direct app/DB denial,
   SSH continuity and Nginx worker access.
   Per-engine Basic probes do not replace that12-check network inventory. Verify
   the separately guarded lease callback under its real unit/source/cache boundary.
4. Root dispatches exact E4 origin-only activation using actual baseline/restore/
   inventory/dispatch raw hashes. The immutable preview source establishes the
   new profile, backs up stopped writers and exposes the protected site only after
   readiness and installing its persistent20min acceptance deadline. Read the real
   state deadline; never infer it from a local proposed start time.
5. Start the prepared three-engine runner promptly. Its10min global limit leaves
   room for final audit, evidence transfer and `preview accept` image/profile/
   Nginx reproof before the actual20min deadline. Reserve that room explicitly;
   no deadline extension or retry after expiration.
6. Root creates `metrics/preview-acceptance.json` only from the actual3/3 report,
   all three ten-check annotations, cleanup/financial audit and capped-log gate.
   Bind actual candidate release/Ops/Engine/profile/IP origin and UTC acceptance;
   each engine must have integer0 unexpected/skipped/testRetries. Run the exact
   guarded `preview.py accept` dispatch before its deadline. Failure/expiry closes
   preview and stops writers; recovery is explicit E4 config/proxy rollback only.
   No financial/schema rollback or613 consumer resume is permitted.

The `preview.py` record validators establish shapes/identities/time, not whether
a human invented a boolean. Root's independent native report, network inventory
and bounded audit are required sources for those records. All-route Basic may
cause the advisory analytics collector's credentials-omit fetch to401/drop;
never embed Basic in JavaScript or bypass the perimeter to recover telemetry.

## Preparation evidence and remaining execution

Initial pure48 cases:45 passed/3 failed due test assertions (empty-string secret
check, nested annotation JSON and a comment falsely matching a dotenv import).
Initial typecheck found one header-array typing issue. Corrected pure48/48 passed
346ms/exit0; final scoped lint/global types and hashes are reported in the handoff.
These tests use synthetic roles/cookies/payment states and injected context
constructors; no Basic file, local env file, native proof or DB fixture is read.

Actual private-IP three-engine run, native errors/429 timing, fresh profile/network
activation, cleanup/financial audit and accept/rollback remain unexecuted by this
task. Current-profile load/capacity/timers, live PSP/SMS/domain, offsite/PITR and
the separately blocked full security audit are not covered by this handoff.
