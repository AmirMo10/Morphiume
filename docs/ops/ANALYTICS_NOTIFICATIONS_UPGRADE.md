# Analytics and audience-scoped notifications upgrade

Prepared contract, not executed deployment. The server still runs accepted app613/Ops591/schema0011. New source, migration files and CI opt-in do not authorize silently changing that runtime. No new image identity is accepted yet; published5cf failed browser acceptance and produced no accepted image.

## Compatibility boundary

| Migration | Canonical LF SHA256 | Effect |
| --- | --- | --- |
| 0012_anonymous_analytics.sql | `5ecc599e8f3be2716d64ba360e9c4be96add27a67fb5011fda8a86747c92dfb4` | Four bounded anonymous observation tables; no financial FK or financial truth derived from client counts |
| 0013_operator_notifications.sql | `6c3dc95837f75e2fc0f2cae1309346199663ee3f42483d3ffa9f78813fba2f25` | Customer/operator audience, canonical event/order binding and per-message operator permission; preserves legacy customer rows |

The migration changes are additive, but **rollback to app613 is unsafe after activation of the new notification producer/dispatcher**. App613's customer feed reads by user ID without an audience filter. Its old worker can silently complete an unknown `notification.event` job. Running either old consumer against new operator messages/queued events risks disclosure or lost delivery. Do not equate additive DDL with application compatibility. Current upgrade.py already performs no automatic rollback; keep that property.

## Required cutover evidence

1. Freeze the exact new application source, immutable accepted platform config/manifest/archive, reviewed Ops bundle, launcher and runtime configuration. Complete native browser and packaged-image acceptance before server transfer. The identity remains pending, not a placeholder asserted as accepted.
2. Release native/load/isolated-PG windows; disable/suspend any actual timer before the controlled cutover. Stop only the current runtime app/worker under the verified release lock. Preserve original database container, unrelated data and `/srv/morphiume/postgres`.
3. Create and verify a new encrypted database/media backup with the **previous** accepted identity, complete ciphertext hashes, writer-free capture and completed manifest. An old backup predating the cutover is not a substitute for this pre-migration record. Do not seed or reset data.
4. Record all existing migration names/checksums and fingerprints/counts of the original columns of every existing business table. After schema0013 adds notification columns, compare an explicit old-column projection; whole-row JSON digests intentionally differ for existing notification rows when columns are added. Preserve legacy read state, financial/event/idempotency/queue/reservation history and the migration prefix.
5. Apply precisely the two reviewed append migrations with a separate migration-owner credential. Verify old prefix unchanged, both exact canonical checksums present and runtime DML-only role privileges. New readiness and worker startup require the current13-file migration history; they do not apply DDL themselves.
6. Start only the exact accepted new app and new required-dispatcher worker. Keep anonymous capture disabled unless an explicit reviewed non-live config opts in. An inherited host flag cannot enable capture; live activation remains gated. Validate actual ready200, audience-scoped feeds, controlled queued-event delivery/replay/read preservation, heartbeat, graceful shutdown and private caching.
7. Write a protected compatibility record binding new source/image/Ops/profile, actual migration before/after, pre-change backup and `minimumCompatibleNotificationConsumerSource` to the accepted new source. It must record whether any new producer job/operator row was materialized. A known-compatible roll-forward candidate must pass the same consumer contract; do not guess compatibility from commit order.

The observed49-table fingerprints in isolated tests establish preservation of that test database during those suites. They are not a pre/post-cutover comparison of the separate deployed runtime database.

## Failure handling

Preserve partial migrations, encrypted backup, queue state and the failed acceptance evidence. Stop incompatible consumers. Repair and roll forward from explicit identities; a newer source is not automatically accepted. Restore is a separate operator action into a fresh isolated restore namespace with native business/media verification, not an overwrite of the active environment or a routine image rollback. Do not delete/replay historical pending/dead jobs, change financial rows or rotate credentials to conceal a failure.

Full-service scheduling, private-IP perimeter/native acceptance, external load200, offsite/PITR and real provider/owner policy inputs remain separate gates. This document and the code's schema readiness check do not establish those outcomes.
