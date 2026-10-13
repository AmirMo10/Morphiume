# E4 isolated restore business verification

Actual prerequisite update,2026-10-13 at09:05UTC: the fresh isolated E4 app/DB reached readiness and all eight physical media files (736bytes) matched. The first business invocation stopped before evidence reservation or native HTTP because Windows PowerShell inherited an incompatible PowerShell7 module path; the real ACLs were already correctly limited. Running its ACL check with a minimal Windows transport environment returned `verified`. Both ACL child processes now use that environment; ACL requirements remain unchanged. This failure does not establish native acceptance.

This separate acceptance tool is scoped to the accepted E4 image, Ops68 and SSH staging profile67f77. The old613 acceptance tool and its fixture remain unchanged. Default invocation prints a blocked plan and performs no network or database action.

The root coordinator verified the retained E4 Chromium purchase and cleanup, then accepted its private fixture on 2026-10-13 at08:38:22Z. Its raw SHA256 is `cea16d8896babf6303e1f29c287dcd4a433f5a6668cda489594e4bf64e27395d`. The fresh E4 encrypted backup is `20261013T084014Z-8e5fa45e`; backup manifest SHA256 is `d3163b5964e4711be35dbdfce9a9f6fe8c786fd2ecd5be48452cae310ebd24d1`. These facts do not establish restore acceptance.

Before apply, supply a protected JSON handoff matching `validateTarget` in `tests/ops/e4-restore-business-contract.mjs`. It requires all eight immutable source/image/Ops/profile identities, the actually created fresh lowercase restore project and root, the backup directory, retained fixture path, published tool commit and exact hashes of fixture, two ciphertext files, backup manifest, recovery start/ready, restored application config and both tool sources. Every attestation must be backed by observed execution. Pending values remain null in the default plan.

The browser origin is `http://localhost:3101`, forwarded over strict SSH to server loopback3002. The original runtime remains separate. The restored PostgreSQL instance uses database `morphiume_staging_restore`, DML role `morphiume_restore_app`, canonical13 migrations and server180006. Its worker must never start during acceptance. No owner/bootstrap credential is passed to the local test process.

Six independent checks run once: fresh native customer OTP/session; access to the customer's own restored order; one deliberate duplicate callback with unchanged receipt, payment and order; one stock commitment with consumed reservation; persisted shipment tracking; and the retained public WebP's exact bytes. Authentication and callback requests use real HTTP. This harness uses Playwright's HTTP context; it does not claim an additional browser UI run. Exactly one observed numeric `X-Retry-After`429 per OTP action permits one bounded wait and second attempt. No other retry, mock outcome reset, queue reset, seed or global cleanup occurs.

The SSH observer validates immutable sources and restored containers before executing a scoped repeatable-read, read-only transaction ending in rollback. Secrets, fixture identities and raw evidence stay in private files; stdout contains only bounded counts/statuses. A new result file is reserved before native activity, so failure retains completed checks and cannot silently overwrite an earlier attempt. Windows files and their parent require explicit protected ACLs granting only the current user and SYSTEM full control; Linux requires owned700 parents and600 files. Never weaken this check to make a run pass.

```text
node tests/ops/e4-restore-business-acceptance.mjs
node tests/ops/e4-restore-business-acceptance.mjs --apply ABSOLUTE_PRIVATE_HANDOFF --handoff-sha256 ACTUAL_HANDOFF_SHA256
```

Root independently executed105 pure tests on Windows (364.359ms) and Linux (480.113ms), with zero failure/skip. These exercised injected observations and HTTP responses; they did not contact the server. During source integration Root corrected the observer's disk lookup to `media/public/<UUID>.webp`, matching the existing media store. The actual restored-data checks remain pending. RTO is measured separately from fixture-to-backup age; neither a logical backup nor one successful rehearsal establishes offsite protection or PITR/RPO15minutes.
