# Redesign recovery guard: historical storage and record formats

Observed 2026-10-18 during deployment of the CI-accepted `7feb4fe` application. The first launch paused the existing timers and stopped before its upgrade child because both scheduled services were already failed. The old scheduled backup required the ACF8 checkout, but the earlier artifact preparation had advanced it to `7feb4fe`; backup runs therefore failed, and health subsequently reported an aging logical backup. The current app/database were healthy. The failed service journals and both deployment attempts are preserved privately.

After those failures were archived and only the two failed service states cleared, the first actual upgrade child stopped before creating its preservation journal, stopping writers or taking a backup. Its old-restore inventory collector incorrectly required every media directory to have mode `0750`. The accepted immutable baseline already recorded `0750` for the first 613 restore and `0700` for both the E4 and ACF8 restores, all owned by UID/GID1001. This was an incorrect code assumption, not permission drift. No preserved media directory was changed to satisfy the guard.

The corrected helper binds an explicit version-two policy to the three exact historical projects. Capture and inventory validation require each project's specific mode, owner, group, path and metadata shape. The upgrade verifies that exact revised policy before importing Ops. The old tools and their hash-addressed server directories remain intact; corrected tools require new directories and their actual published source commit, independently of the unchanged application image and reviewed release plan.

Local verification: the operations agent passed 42 portable guard cases; the coordinator independently passed the same 42 in 0.121 seconds, parsed all three changed Python files, and scanned them with Gitleaks8.30.1 (zero findings). Five new cases cover exact historical modes, rejection of every swapped mode, unknown/changed policy and version, storage metadata drift and rejection of the old blanket policy. These are offline checks and do not establish a completed deployment or restore. Actual continuation, native purchase, backup, recovery and scheduler results belong in [the deployment execution report](REDESIGN_STAGING_EXECUTION.md).

Independent QA also checked the corrected validator against the protected historical baseline: all three actual storage metadata records matched after Windows path-separator normalization, and sixteen invalid mode/policy counterexamples were rejected (0.758 seconds). This check used local preserved evidence, not a new server inventory or a native purchase.

| First storage-policy correction | Raw SHA256 |
| --- | --- |
| `redesign-isolated-restore.py` | `51fdabd81c59d55063a7e26be0f3053012edb50affa6724bc16b71317a70be8e` |
| `redesign-preserved-upgrade.py` | `0def5a30c651754060915b5ebad718f639f0ab8706e29524a259196ac39f989e` |

The frozen twenty-one-file Ops68 bundle, accepted application image, schema, financial behavior and service budgets are unchanged. A fresh encrypted backup remains mandatory before image activation; no automatic rollback, seed or replay was added.

## Complete historical acceptance contracts

The next actual preflight passed the corrected storage metadata, then exposed another incorrect uniform-format assumption. The preserved ACF8 acceptance record uses `restoreReadySha256`, `restoreJournalSha256` and `restoreConfigCanonicalSha256`; the older 613/E4 records use `readyRecordSha256`, `journalSha256` and `restoreConfigSha256`. No image switch, writer stop, fresh backup or candidate SQL probe occurred in that rejected preflight.

The guard now selects an exact contract for each known historical project. ACF8 additionally requires its raw app-config, recovery-start and business-result links; E4 requires its raw app-config link. Missing, mismatched, mixed-alias, unknown-project and stale-policy records fail. The original 613 result digest describes the result before its historical server-side serialization, so no new universal raw-result equality assertion was imposed on that record. The accepted records were not rewritten.

Independent QA checked all nine actual accepted/ready/journal files against their protected preserved hashes and verified the identity/profile, phase/root/project/worker and available digest relationships. It found no additional existing record-predicate mismatch. This was a local audit of freshly exported read-only records; fresh archive, mount and media revalidation still belongs to the server preflight. The source fix adds five focused cases, bringing the portable suite to 47 cases.

The coordinator passed all 47 in 0.111 seconds and parsed all three Python files. Independent QA then ran the three actual acceptance records through the revised helper: their respective three, four and six required links passed, and forty-three invalid mutations were rejected (0.568 seconds). This does not replace the next actual server preflight.

| Storage and acceptance-policy correction | Raw SHA256 |
| --- | --- |
| `redesign-isolated-restore.py` | `a1afdc162db1e809ad092373a5d35d36a5c6a56c9ba31f84fdea435c5db38e61` |
| `redesign-preserved-upgrade.py` | `e7056b62396fd931ed117c62c8d5f3b7eea00c0fd7daedb6ee88c43422419069` |

These corrected tools require new hash-addressed directories and their new published tooling commit. Both previous versions remain preserved. The application image and its reviewed identity plan stay unchanged.
