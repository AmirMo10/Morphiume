# B/C initial native acceptance — 2026-10-13

This is the preserved initial failed-run record. A later distinct corrected focused run completed **13/14**, with all8 notification cases passing and WebKit analytics Cookie privacy still failed; see `BC_CORRECTED_NATIVE_QA.md`. Historical preparation/worker statements below describe this initial checkpoint.

The first focused native run on the new combined application **failed: 5/14 passed, 9 failed**, with0 skipped/flaky/test retries. It used production build **99975**, server **95448**, canonical `http://localhost:3004`, and the new exact database `morphiume_staging_qa_b625408702be90db` with13 canonical migrations/53 public tables. This is separate from the accepted Cart38/38 and published Cart Linux57/57.

Start `2026-10-13T02:29:31.936Z`; end `2026-10-13T02:36:22.431Z`; duration **410495.235 ms**. Chromium project used installed Chrome **154.0.8037.93** (bundled Chromium executable absent). WebKit **27.2** launched normally. Playwright **1.64.0** attempted normal Firefox launch: executable present, launch failed `spawn UNKNOWN`; **0 Firefox native cases ran**, and no workaround was used.

| Scope | Chrome | WebKit | Actual failure |
| --- | --- | --- | --- |
| Analytics | 3 passed | 2 passed / 1 failed | WebKit anonymous wire header omission assertion (`analytics-fixtures.ts:100`, `analytics.spec.ts:102`) found Cookie presence. |
| Customer notification HTTP/UI | 2 failed | 2 failed | Disabled still-authenticated customer denial expected401, received403 (`notifications.spec.ts:43/88`). |
| Operator notification HTTP/UI | 2 failed | 2 failed | Return setup expected201, received409 because delivery had not been recorded (`notifications.spec.ts:105/156`). |

## Preserved evidence and precise correction

Root independently confirmed the two notification fixture mistakes in unchanged application source: `customerActor` returns exact403 when a retained native session belongs to a disabled customer; `requestReturn(kind='return')` requires delivered shipment. QA now expects exact403 only for this disabled-customer condition, preserving exact401 for absent/revoked sessions. Both operator fixtures now perform real owner shipment PATCH transitions shipped→delivered, assert HTTP200 and the returned order/status, then request return201. No SQL shipment/status fabrication or application policy change is made. The separate UNRUN worker fixture now uses the existing controlled domain `purchase(true)` before return. These three QA source corrections passed scoped ESLint and TypeScript; **no corrected run has occurred**.

The independent WebKit analytics failure is retained. `analytics-webkit-initial-wire.json` exports only kind/status/header-presence/origin booleans from the failed browser-network trace, before any collector route was installed. Three event responses were403 with Cookie present and `Origin:null`; referrer, authorization and control-header presence were false. Cookie values/names, request bodies and contact/reference values are not exported. That trace alone is not proof of server-received headers or the cause of Cookie inclusion. Frontend independently reproduced the same behavior on an isolated real loopback echo with synthetic cookies and no application/native/PG calls; its evidence/any implementation decision belongs to the coordinator/frontend role. The privacy assertion remains unchanged. WebKit collector-outage and purchase assertions after this gate did not execute; Chrome's full advisory-outage purchase case did pass.

No complete notification or cross-engine analytics acceptance is claimed. Later UI/operator assertions blocked by the fixture failures did not execute. Source/test fixes do not convert the preserved failed run into a pass.

## Native, server, identity and cleanup

There were **120 observed native POST actions:116 HTTP200 and4 HTTP429**. Password sign-in waits9/1/9 seconds and customer OTP-send wait50 seconds followed the actual numeric `X-Retry-After`, each with one successful second attempt. No native budget/IP/clock/limiter reset or blanket retry was used. Existing action10-second/case120-second/global25-minute limits remained.

Before the first test, **394 app/test/deploy source files** were frozen and an authenticated repeatable-read readonly **53-table** private fingerprint baseline was recorded. The database/app-role/origin matched exactly; role superuser/createdb/createrole/public-create flags were false, and runtime contained no migration-owner credential. Private baseline SHA256: `09ac50b8c2824abfdb73f483ebcf2688472b1564e1f308bd52e6ec471472cde8`. All394 source files remained unchanged during the failed run.

The preflight caught two output directories with inherited extra ACL rules. Only `test-results`, `playwright-report` and their existing10 entries were restricted to the current Admin SID and SYSTEM, reverified before any test. Prior/raw failed reports and traces were archived under protected `.local`; no raw report or headers are committed.

Safe current-runtime evidence: **771 lines collected,0 HTTP500, no byte/line/event cap reached**. It does not erase earlier CI/local failures. `browser-bc-focused-initial.json` SHA256: `7a3d702f6781a782f63b61a02d0ad0944c1554f1b38c7093bef719dd75368200`. Notification-specific safe annotations are retained privately/in fixed console status output; the generic browser exporter currently omits that new annotation pending review.

The dedicated readonly audit at `2026-10-13T02:40:35.365Z` found0 active owned administrators,0 unarchived owned products,0 active owned customers,0 retained owned sessions. All53 tables were recorded after execution;23 were unchanged, including both canonical migration-history tables. Changes in the other tables are the authorized native/commerce/notification/analytics fixtures retained privately, not a claim of original-data equality. No additional cleanup mutation was needed; finance/inventory/audit history and limiter records were retained. No original/accepted-runtime/previous QA database was queried. The exclusive native/PG window was explicitly released after this audit.

No migration/DDL, standalone worker, broad queue tick, load test, build/restart, live provider or corrected native acceptance was performed by QA. Further execution requires a new coordinator source/runtime/window GO.


## Separate worker pre-entry failure and loader correction

After the initial native window was released, Root attempted the corrected selected-worker source with its own explicit fresh-database/owner/worker authorization. The attempt failed before entry with esbuild TransformError: top-level await is unsupported by the normal tsx CommonJS output in this repository. The retained private log was1186 bytes and did not contain the fixture main failure string; no fixture main PG stage ran. This is a loader/preparation failure, not a notification business result.

QA replaced only the top-level try/await footer with a void async Promise then/catch, retaining the exact redacted error, exitCode1 and awaited finally cleanup. The normal Node/react-server/tsx loader with GO absent now reaches the fixed redacted gate failure (exit1), with no TransformError/top-level-await marker and no PG branch. Scoped lint/TypeScript passed again. Root owns a distinct actual worker rerun/log; QA has not executed the business fixture.
