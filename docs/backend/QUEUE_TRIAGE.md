# Controlled queue triage

Read-only PostgreSQL snapshot, 2026-10-12 14:13:57 UTC. This is fixture provenance evidence, not a delivery or worker-readiness claim. No jobs were retried, cancelled, deleted or marked completed during triage.

| Status | Jobs at snapshot |
|---|---:|
| completed | 708 |
| pending | 315 |
| dead | 15 |

All fifteen dead jobs were `payment.reconcile` with twelve attempts. Nine retained the source reason `payment in progress`; six retained `create result unknown; provider support reconciliation required`. A later read-only join confirmed all fifteen match persisted attempts/orders belonging to disabled accounts with the controlled fixture email suffix. The nine in-progress jobs were created 10:21:05–10:23:39 UTC; the six unknown-create jobs were created 10:06:56–10:23:33 UTC. No payload, recipient, address, phone or raw account identity was printed. This evidence does not attribute an individual retry to a particular test invocation.

Job IDs, types, attempt counts, timestamps and classified/hashed reasons are preserved in a private profile file outside the repository for the coordinator. The snapshot is dated: subsequent fixture creation can increase pending counts. Preserve these records until a separate reviewed archival/cleanup decision; unresolved provider outcomes must never be converted into payment failure or completed delivery by a blind retry/status update.

The earlier `tests/integration/backend/commerce.test.ts` worker tests injected controlled providers/callbacks but ran the global outbox claim and reservation-expiry sweep against the shared test schema. Giving their jobs older due times helped their assertions while still allowing unrelated historical jobs to be claimed. This was a test-isolation gap.

The replacement tests-only harness in `tests/integration/backend/isolated-database.ts` requires test/staging deployment, mock payment/SMS providers, a loopback test/staging database name and matching runtime/owner target before constructing any pool. It then creates a unique, validated schema using the migration-owner connection and canonical migrations. Qualified empty migration metadata prevents accidentally inheriting public migration history. Foreign keys and runtime table resolution are checked; the runtime receives schema-specific DML and sequence privileges. The existing `createJobs().tick()` and reservation sweep SQL remain unchanged. Before/after fingerprints check that public queue and reservation state did not change during this isolated suite. Cleanup verifies exact generated schema identity/ownership before removal.

If CI supplies one privileged role for both migration/runtime, the harness creates a temporary restricted login only with explicit CI/test/mock providers, a loopback test/staging database and actual role-creation capability. Its generated password stays in memory, its parsed connection URL changes both username and password, and runtime identity plus privilege flags are checked. Cleanup removes only this run's verified generated role after closing pools and removing the exact schema. Local runtime/migration roles and their passwords remain existing configuration.

This harness scopes the legacy commerce worker tests. Other domain/browser fixtures and the real runtime queue have their separately documented lifecycles. Queue cleanup, production notifications and live payment reconciliation are not implemented or proven by this triage.
