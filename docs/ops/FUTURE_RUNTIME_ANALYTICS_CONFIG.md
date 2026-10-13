# Future runtime analytics configuration and consumer cutover

Prepared and locally tested source only. The server remains accepted app613/Ops591 with its existing eight-key app/worker configs and frozen operator loader. No server/config/profile, DDL, approval, service, timer, backup, native fixture or image operation occurred here. The full scheduled-health recipe still targets old591 and remains unexecuted. Neither new source nor a local pure test accepts a new packaged image.

## Configuration boundary

Future `runtime/contract.py` accepts the exact existing eight required app/worker keys, optionally plus the ninth `ANONYMOUS_ANALYTICS_ENABLED`. Its only allowed values are the strings `true` and `false`. Missing means effective `false` regardless of the operator host environment. Unknown keys, booleans/numbers/null, case variants, padding and NUL strings fail. Migration-owner config remains exactly DATABASE_URL/PAYMENT_PROVIDER/SMS_PROVIDER; it rejects the analytics field.

| Protected app field | Protected worker field | Result |
| --- | --- | --- |
| absent | absent | Accept; both effective false |
| absent | false, or the reverse | Accept; both effective false |
| false | false | Accept; off |
| true | true | Accept; explicit paired opt-in |
| true | absent/false, or the reverse | Reject before profile creation and when loading configs |

Validation resolves the effective flag **without adding it to stored objects**. Eight-key bytes/canonical hashes remain unchanged. Explicit false and absent have equivalent behavior but distinct stored hashes; config/profile integrity still binds the actual supplied representation. The new pair check runs in `make_profile` and `load_configs`; operator handoff continues to read only its existing three protected app/connections/profile files. It trusts the reviewed profile produced from the paired server configuration rather than copying worker secrets to a fourth local file.

Future `operator-config.mjs` validates the optional own field and always emits an explicit effective flag to its child environment. It deletes the ambient flag before merging validated values; a host value or inherited object property cannot opt a legacy config in. Migration-owner credentials remain excluded. The existing server app/worker configuration, old profile and frozen613/591 operator path were not rewritten or replaced.

## Source identity and actual tests

Future Ops canonical-LF SHA256 is **`68bc527a9c34ccefef72bb4427288da47c75c3a584e7cb140ecfc3c3fbdad6a3`**. Within the21 OPS_FILES only `runtime/contract.py` and `runtime/operator-config.mjs` changed in this task. Previous future4d626 source and deployed591 are historical independent identities; no record is rebound automatically. Adoption requires a published reviewed bundle, explicit trusted source/config/manifest/archive, a separately proven engine mapping and a new profile bound to that bundle and raw configs.

Actual local commands/results:

- `python -B deploy/staging/runtime/safety-check.py`:18 cases in0.433s;17 passed, one Windows symlink-creation skip. New cases cover legacy byte preservation, ambient default-off, exact values/types, owner scope, profile and private-load app/worker agreement.
- `python -B deploy/staging/runtime/preview-safety-check.py`:24/24 in2.389s. Added four pure operator positives/eight rejected shapes and nine real child-process cases: legacy/false/true across three ambient flags, with owner credentials excluded.
- `python -B deploy/staging/runtime/upgrade-safety-check.py`:9/9 in0.244s; `engine-image-safety-check.py`:20/20 in0.637s. These are mocked/pure compatibility guards, not server migration or recovery results.
- Python source parsing, Node syntax, scoped ESLint and diff checks passed. Actual available Node was24.19.0; accepted deployment/build candidate remains pinned24.21.0, whose new packaged-image acceptance is still pending. No local test is described as that image's proof.

These suites use disposable synthetic inputs and mocked server commands. The old Linux symlink/unit validation and actual worker drill are separate historical evidence, not execution of this future parser on the server.

## Rollout limitations and required compatibility gate

Follow the coordinator-owned [analytics/notifications upgrade contract](ANALYTICS_NOTIFICATIONS_UPGRADE.md). Analytics activation is independent of the new notification producer/dispatcher: leaving analytics false does **not** make old613 consumers compatible with new notification events/operator rows.

1. Accept the exact new packaged app **and worker** through unchanged scan/functional/browser/identity gates; accept its nine-key launcher behavior and schema0012/0013 migration bytes. No accepted new image currently exists.
2. Publish/review the new Ops fingerprint independently. Release shared native/load/PG windows, hold the release lock and pause both old writers. Re-prove prior source/config/manifest/archive/591/profile/engine identity and take a new writer-free encrypted backup under that prior identity. Preserve old checksums and old-column projections/business history; no seed/reset.
3. Apply only the accepted image's reviewed migration-owner append files to the fresh runtime database. Compare old migration prefix, explicit old-column fingerprints and DML-only grants. Do not mistake isolated test-table fingerprints for an actual runtime cutover comparison.
4. Switch only to the accepted compatible app and required-dispatcher worker together. Keep legacy configs/default-off for the initial cutover unless a distinct paired opt-in/profile revision is explicitly reviewed. Current `upgrade.py` carries `c.load_configs()` into the candidate profile; editing old active configs to force opt-in beforehand would invalidate its protected profile hash. A later opt-in is its own controlled paired config/profile operation, not an ambient variable or an implicit upgrade effect. Old613's image launcher does not accept the ninth key, so a parser-format acceptance alone never authorizes its use with that image.
5. Before releasing traffic/new writers, require the minimum compatible notification consumer contract: audience-filtered customer feed, current operator permission checks, canonical event/order ownership, replay/read-state preservation and a worker that handles `notification.event` explicitly. Record accepted minimum source/image, whether any new producer job/operator row materialized, prior backup and actual schema/profile/queue facts.
6. Once new notifications are activated/materialized, **never restart app613 or its worker** against that state. Its customer feed is unfiltered by audience and its worker completes unknown notification jobs. There is no automatic image/schema rollback; use an independently accepted compatible roll-forward, or a separately approved isolated restore rehearsal. Even a schema-only rollback decision before activation needs explicit Backend compatibility evidence; additive DDL alone is insufficient. Do not delete/replay queues or financial history to manufacture compatibility.

The compatibility record and rollout are still proposals requiring root/Backend review and actual accepted identities. This task does not add a server-side deployment marker, patch upgrade.py, activate analytics/notifications, adopt Ops68, schedule health, change origin, or establish live/provider/offsite/load readiness.
