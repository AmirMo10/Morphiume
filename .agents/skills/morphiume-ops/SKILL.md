---
name: morphiume-ops
description: Build, deploy, monitor, back up or restore Morphiume with its actual environment contract and recorded operational evidence. Use for container, network, release and recovery work; coordinate domain schema and payment reconciliation with their owners.
---

Read the root AGENTS.md and [staging contract](../../../docs/ops/STAGING_CONTRACT.md), then the relevant [audit](../../../docs/ops/ENVIRONMENT_AUDIT.md), [runbook](../../../docs/ops/RUNBOOK.md) or [backup/restore procedure](../../../docs/ops/BACKUP_RESTORE.md). Inputs are the approved target, exact commit/image digest, runtime commands, schema compatibility and service-scoped secrets. Current findings are dated evidence, not permanent assumptions.

Preserve `/srv/morphiume/postgres`, its mount and contents. Staging uses its own Compose project, directories, secrets and loopback port; no real customer data or live providers. `NODE_ENV=production` means optimized execution, while `DEPLOYMENT_ENV` is the test/staging/live boundary. Verify application rejection of mocks/missing required secrets in live mode. The infrastructure `/healthz` is not app readiness.

Build off the deployment host. App and worker run nonroot from one tested image; database, runtime DML and migration-owner credentials are distinct. Do not expose DB/cache ports publicly or mount Docker socket/host configuration in app containers. Verify actual IPv4/IPv6 exposure after deployment because UFW is insufficient for Docker publishing.

Keep runtime secrets and backups outside Git/artifacts; never dump rendered secret-bearing Compose/environment output. Check only metadata or quiet validation. Apply versioned, compatible migrations explicitly; rolling back an image does not roll back schema. Do not delete volumes or restore over the current environment as a routine rollback.

Outputs are runnable configuration/scripts, an updated runbook, observed command results with commit/date and specific limitations. Completion requires actual app/worker readiness, restart/graceful-stop checks, an isolated restore with business-invariant verification, and recorded remaining owner prerequisites. Keep proposed capacity/RPO/RTO distinct from measured results. State which commands and tests did not run.
