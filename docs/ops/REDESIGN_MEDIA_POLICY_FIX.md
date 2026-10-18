# Redesign recovery guard: historical media permissions

Observed 2026-10-18 during deployment of the CI-accepted `7feb4fe` application. The first launch paused the existing timers and stopped before its upgrade child because both scheduled services were already failed. The old scheduled backup required the ACF8 checkout, but the earlier artifact preparation had advanced it to `7feb4fe`; backup runs therefore failed, and health subsequently reported an aging logical backup. The current app/database were healthy. The failed service journals and both deployment attempts are preserved privately.

After those failures were archived and only the two failed service states cleared, the first actual upgrade child stopped before creating its preservation journal, stopping writers or taking a backup. Its old-restore inventory collector incorrectly required every media directory to have mode `0750`. The accepted immutable baseline already recorded `0750` for the first 613 restore and `0700` for both the E4 and ACF8 restores, all owned by UID/GID1001. This was an incorrect code assumption, not permission drift. No preserved media directory was changed to satisfy the guard.

The corrected helper binds an explicit version-two policy to the three exact historical projects. Capture and inventory validation require each project's specific mode, owner, group, path and metadata shape. The upgrade verifies that exact revised policy before importing Ops. The old tools and their hash-addressed server directories remain intact; corrected tools require new directories and their actual published source commit, independently of the unchanged application image and reviewed release plan.

Local verification: the operations agent passed 42 portable guard cases; the coordinator independently passed the same 42 in 0.121 seconds, parsed all three changed Python files, and scanned them with Gitleaks8.30.1 (zero findings). Five new cases cover exact historical modes, rejection of every swapped mode, unknown/changed policy and version, storage metadata drift and rejection of the old blanket policy. These are offline checks and do not establish a completed deployment or restore. Actual continuation, native purchase, backup, recovery and scheduler results belong in [the deployment execution report](REDESIGN_STAGING_EXECUTION.md).

Independent QA also checked the corrected validator against the protected historical baseline: all three actual storage metadata records matched after Windows path-separator normalization, and sixteen invalid mode/policy counterexamples were rejected (0.758 seconds). This check used local preserved evidence, not a new server inventory or a native purchase.

| Corrected tool | Raw SHA256 |
| --- | --- |
| `redesign-isolated-restore.py` | `51fdabd81c59d55063a7e26be0f3053012edb50affa6724bc16b71317a70be8e` |
| `redesign-preserved-upgrade.py` | `0def5a30c651754060915b5ebad718f639f0ab8706e29524a259196ac39f989e` |

The frozen twenty-one-file Ops68 bundle, accepted application image, schema, financial behavior and service budgets are unchanged. A fresh encrypted backup remains mandatory before image activation; no automatic rollback, seed or replay was added.
