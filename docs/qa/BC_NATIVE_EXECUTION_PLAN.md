# B/C native execution plan and remaining gates

Current checkpoint: the corrected focused native run on production **96160/server92789/schema13** completed **13/14 passed,1 failed**, duration **457838.256 ms**. All eight notification HTTP/UI cases passed; Windows WebKit analytics Cookie-omission remains failed. See `BC_CORRECTED_NATIVE_QA.md`. The earlier **5/14** failed run remains preserved in `BC_INITIAL_NATIVE_QA.md`. Future three-engine selected21/whole78 and local whole52 are **unrun** and need a separate coordinator GO. Published Cart52ee407/57-Linux and dedicated Cart38 evidence remain independent.

## Exact source scopes and counts

Static source inspection found16 `.spec.ts` files,26 cases per engine: prior19 Cart/commerce cases plus3 analytics and4 notifications. Both actual focused discovery/executions were7 cases per available engine,14 total. Future selected B3+C4 is **14 Chrome/WebKit** or **21 Chromium/Firefox/WebKit on Linux**; future whole scope is **52 local available-engine cases** or **78 Linux three-engine cases**. The standalone selected-worker fixture is one separate controlled factory case, not a browser/native case and not counted in these totals.

The normal Windows engine inventory was Playwright1.64.0: installed Chrome154.0.8037.93 available through projectchromium/channelchrome; bundled Chromium absent; WebKit27.2 available; Firefox executable present but ordinary launch failed `spawn UNKNOWN`. No flags, policy workaround, substitution or Firefox passing claim is permitted. Linux CI must actually execute all three requested engines separately before a three-engine B/C claim.

After the coordinator hands off `.env.local` for the exact fresh database/origin and grants another native window, the selected local command is:

```powershell
$env:E2E_CHROMIUM_CHANNEL='chrome'
$env:E2E_BASE_URL='http://localhost:3004'
# Use a unique, ACL-verified child of the protected .local runtime directory.
$env:PLAYWRIGHT_HTML_OUTPUT_DIR='S:/Morphiume/.local/native-bc-b625408702be90db/UNIQUE-private-html'
pnpm exec playwright test -c tests/e2e/playwright.config.ts tests/e2e/analytics.spec.ts tests/e2e/notifications.spec.ts --project=chromium --project=webkit
```

On an authorized Linux CI/runtime with compatible private configuration and installed pinned browser engines:

```sh
pnpm exec playwright test -c tests/e2e/playwright.config.ts tests/e2e/analytics.spec.ts tests/e2e/notifications.spec.ts --project=chromium --project=firefox --project=webkit
```

Do not force the WindowsChrome channel in Linux. Whole-scope commands omit the two selected spec paths and retain the same project arguments. Root decides whether/when whole52/78 runs; the accepted38 command against the previous11 database cannot establish B/C behavior.

## Runtime and fixture prerequisites

The native window must bind the same final app/test source hashes, rebuilt runtime, canonical origin and exact newly approved `morphiume_staging_qa_<16lowerhex>` database for both the app and all helpers. Reject original/runtime/previous7f59 targets in the acceptance preflight. Canonical migrations0012_anonymous_analytics and0013_operator_notifications must be present, with53 public tables and authenticated runtime DML-only privileges. Store53-table private fingerprints, immutable migration checksums and full app/test/deploy source hashes before creating a fixture. Runtime has app URL only, no owner/migration URL; all private config/reports/traces/logs require Admin/SYSTEM-only ACLs and protected archives.

Require explicit non-live test/staging with mock SMS/payment, fresh library AUTH/ADMIN_AUTH/mock-control secrets and `ANONYMOUS_ANALYTICS_ENABLED=true`. The browser cases intentionally assert real config captureEnabledtrue instead of toggling or skipping a disabled runtime. Seed only the separately approved fresh database before the native window; no old-history deletion or global export/rate-cap increase. Keep no broad worker process/tick during native feed cases. Accounts are real native OTP/MFA identities issued by the maintained helpers; products/orders/payments/shipped→delivered/returns/refunds are real controlled API operations. Legacy customer rows and operator feed rows are explicit own-row fixtures, not canonical worker-delivery proof.

Retain immutable order/receipt/inventory/source/outbox/notification/analytics/limiter history. Finally disable only tracked synthetic actors, remove their sessions and archive only tracked products; finish with run-scoped four-category readonly cleanup and fresh-target/immutable-schema audit, then explicitly release the window.

## Separate worker gate

The native app environment intentionally has no owner credential or `NOTIFICATION_OWNED_WORKER_GO`. Only a separate coordinator-authorized generated-schema DDL/worker window may privately provide the matching fresh runtime and migration URLs and set:

```powershell
$env:NOTIFICATION_OWNED_WORKER_GO='true'
node --conditions=react-server --import tsx tests/e2e/notification-worker-fixture.ts
```

The first Root worker attempt failed before entry on top-level-await/CommonJS transformation; the footer is now void Promise then/catch and passed the normal loader with GO absent. Root subsequently executed the corrected controlled selected-worker fixture in11.751s:1 job,2 messages, replay0 and2 preserved reads, with nativeAuthfalse. Its parent report parser initially rejected migration-log prefixes and reconciled the same capture without another PG run. This is a separate controlled factory result, not native UI/authentication. The corrected standalone fixture calls existing `purchase(true)`, producing a controlled paid/delivered order before request.return. It uses controlled domain authorization flags, not native OTP/MFA. Existing guarded schema creation/table resolution/FK/DML-only/public-queue-fingerprint checks apply. Only the exact fresh selected notification.event UUID is leased/processed; a second tick processes0 and exact dispatcher replay preserves read timestamps. No historical/public job tick, replay, worker deployment, provider delivery or backfill is authorized by this command.

Backend gates `ANONYMOUS_ANALYTICS_PG_TESTS`, `NOTIFICATION_EVENTS_PG_TESTS` and `NOTIFICATION_INTEGRATION_PG_TESTS` are separate integration/CI scopes; they are not native-case activation flags and their results are not added to browser counts.

## Unresolved risks and honest limits

- WebKit's positive anonymous-emission case remains failed on Cookie-omission. The initial events were403/Origin:null; the corrected native events are202/canonical Origin with Cookie still present. Real loopback frontend diagnostics are separate evidence. Do not change privacy/CSRF assertions, rewrite headers, allow-null Origin, or assume an application fix. Root/frontend must decide/reverify actual behavior before full B acceptance; WebKit outage/payment assertions behind the failed privacy gate have not run.
- Corrected C cases passed8/8 on Chrome/WebKit, including previously blocked operator/current-factor/UI assertions. Disabled retained-customer session is exact403; anonymous/absent/revoked session remains exact401. Operator return uses actual native shipped→delivered, never direct SQL fabrication. Native feed-row fixtures remain separate from the selected worker factory and future deployed worker proof.
- B role withdrawal tests subsequent fresh denial, not deterministic revocation during repeatable-read. There is no sanctioned post-RR native pause hook; injected-authorizer factory tests have a separate scope. Do not occupy the shared pool or change report deadlines to invent that proof.
- The safe generic reporter currently omits notification-http-status annotations. Those are fixed audience/stage/status/serverUUID records retained in protected artifacts/private logs; future exported support needs reviewed allowlists. No raw trace/body/cookie/contact report is uploaded.
- No native pending/late-response transport cases or marketing/external-delivery/load/capacity proof is inferred from controlled frontend harnesses. Analytics counts are advisory, best-effort and nonfinancial; the real server receipt/cohort invariants remain distinct.

Retries0, action10 seconds, new-case120 seconds and current aggregate25 minutes remain unchanged. Native429 permits only one bounded retry after its real numeric header, with fresh TOTP/current controlled OTP as appropriate. Successful old38 took about910 seconds; the initial failing14 took410.5 seconds but skipped later positive branches. These measurements do not prove the expanded52 will fit25 minutes. Report an actual budget failure to Root instead of inflating budgets or weakening assertions.
