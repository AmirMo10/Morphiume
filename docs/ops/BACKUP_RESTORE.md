# Backup and restore

## Current private preview — 18 October 2026

Application `3b62c340cbcb9becec3b1a9552eedeecb4837be2` is deployed at `http://192.168.240.51`. The owner-authorized preview opens the storefront/shared admin without browser Basic or admin login/MFA, only behind `192.168.240.46/32` and the protected test operator. Normal/default/restore/live authentication and owner credentials remain preserved.

The 17-check purchase, 12-route/eight-boundary browser review, six-check fifth recovery and scoped fixture cleanup passed. All five restore pairs remain stopped with data retained; the temporary RAM key is absent. One actual health job and encrypted backup exited 0 with source/config preservation; recurring approval binds their exact accepted hashes. Final read-only observation `2026-10-18T12:27:06.374753+00:00` confirmed healthy app/worker, clean exact-source checkout and both timers active/enabled, with original cadence/base units/locks preserved. [Actual execution and limits](../qa/PRIVATE_PREVIEW_EXECUTION.md), [access contract](PRIVATE_PREVIEW_ACCESS.md), [accepted CI](../qa/PRIVATE_PREVIEW_CI_EXECUTION.md). Payments/SMS remain controlled tests. Public migration/sales, offsite/PITR and general RPO remain separate; never replay historical commands below.

## Historical accepted redesign runtime — 18 October 2026

The accepted application is `7feb4fe8e8254e917c53f9654b315ee7ef3fada1`, Engine `sha256:f7723802ca524cb16c63988f08220ef14c32f2be136aeaa73f7bbc8720df09df`, with frozen Ops68, thirteen migrations and fifty-three tables. The protected origin remains `http://192.168.240.51`. Three-engine native purchase acceptance and the fourth isolated recovery passed. Recovery acceptance was committed; only the fourth pair was stopped with its data preserved, its temporary RAM key was removed, and the same source app/worker resumed healthy. All three older stopped pairs, owner credentials, original database and reserved mount remain preserved. [Current deployment and scheduling status](REDESIGN_STAGING_EXECUTION.md), [native purchase](../qa/REDESIGN_STAGING_T25_EXECUTION.md), [actual recovery](../qa/REDESIGN_RECOVERY_EXECUTION.md).

Server checkout stays clean at this exact application commit. Later main commits publish tooling/reports and do not redeploy their images. The current optimized preview uses controlled staging PSP/SMS and local encrypted backups. The later different-VPS move to `morphiume.ir` is a [separate migration](MORPHIUME_IR_MIGRATION.md). Public TLS/sales, real providers, offsite/PITR and general RPO are not established by this preview. The dated ACF8/E4 procedures below are historical; do not replay them against the current runtime.

## Historical accepted ACF8 runtime — 2026-10-14T07:53:23.596075+00:00

The running application is acf8e96ee348c487df0fcefe89d568f2bf93367a with immutable Engine sha256:5bf00e2bc40523dd9eaf85d7ef50eecc320bd2c40baf6d10cc38e65e66e2b482, frozen Ops68, schema13 and protected private-IP origin http://192.168.240.51. Read [actual deployment, native purchase, isolated restore and scheduler evidence](ACF8_STAGING_EXECUTION.md) before another action. App/worker are healthy and both existing timers active/enabled at the observation. All three stopped restore pairs, reserved storage and owner data remain preserved. Published tools come from c7b1f0ee210fb0a6a6eeb57462bf2ad6c5c51022; checkout stays ACF8. Main reports/tools do not redeploy an image. Local backups, mock providers and no TLS/offsite/PITR remain the explicit scope.

The E4 and generic sections below are historical procedures, not the current release or an instruction to replay a first-deploy/seed/restore command. Never start613 against schema13 or overwrite an existing restore. A new operation requires exact source/image/profile and individually hashed tool bindings.

## Historical E4 recovery evidence

The later E4 rehearsal supersedes the older613 result below for the active runtime: a fresh encrypted backup with13 migrations was restored into a separate database/application, all eight media files matched, and six native business checks passed. Acceptance at2026-10-13T09:11:27.877614Z measured full incident-to-business RTO516.390835s. The retained-fixture-to-capture gap1657.188s is not PITR or a measured general RPO. Both restore pairs remain stopped with their data/evidence preserved, and the temporary RAM key was removed. [Full execution and limitations](E4_RESTORE_EXECUTION.md).

The live runtime subsequently accepted its protected private-IP profile; the restored application's3101 origin remains a separate historical recovery environment. Future backups must bind the current canonical profile and exact accepted image. Offsite storage, key custody, WAL/PITR and an actual alert recipient remain owner prerequisites; a successful local restore does not establish them. Do not use the generic scripts below to overwrite either restore pair or the current runtime.

## Earlier613 rehearsal and generic preparation

The fresh-runtime encrypted isolated restore rehearsal is now accepted: actual613 retained fixture, encrypted writer-free backup, diagnosed first-project failure, finite tool923 recovery and QA6/6 native/business/media checks. Root wrote acceptance, stopped the restore pair, removed the guarded temporary RAM key/directory and resumed healthy runtime writers. [Measured full RTO3333.396461s and retained-fixture-to-capture gap122.003162s](POST_RESTORE_OPERATIONS.md) describe that specific staging rehearsal; they do not establish general order-data RPO<=15 minutes or offsite/PITR.

Earlier encryption preparation installed Ubuntu's signed `age=1.1.1-1ubuntu0.24.04.3` and passed a real encryption/decryption digest roundtrip. The dedicated identity remains ignored and user-ACL-protected at local `deploy/staging/.local/backup-age-identity.txt`; the fresh-runtime recipient is independently configured in protected `/etc/morphiume-staging-runtime/backup-recipients.txt`. The original `/etc/morphiume-staging` configuration remains separate. This key separation is not an owner-approved offsite backup/key-custody solution. The historical generic preparation below must not replace the immutable591 runtime/legacy-root recovery contract.

The required live design is encrypted versioned database/media backup outside this server with separate write identity, recovery-key custody and alert ownership. Initial retention proposal is seven daily, four weekly and three monthly recovery points, revised for actual size/policy. The owner has not supplied the offsite destination/key custodian/alert channel. Do not put dumps, passwords, customer data or recovery keys in Git/public CI artifacts.

For a measured 15-minute RPO, select and validate a PostgreSQL-compatible backup tool with base backups plus continuous WAL archive and PITR. Store WAL and base backups offsite, monitor archive age/failure, exercise a chosen recovery timestamp and record the newest recoverable transaction. A logical dump is a useful additional backup, not the PITR mechanism. Measure RTO from incident declaration through application/business verification, including download/decryption and payment reconciliation.

## Synthetic staging rehearsal

With staging writers stopped or using a recorded consistent fixture, run on the server:

```sh
bash /opt/morphiume/deploy/staging/backup.sh
bash /opt/morphiume/deploy/staging/restore.sh /srv/morphiume/staging/backups/ACTUAL_BACKUP_DIRECTORY PROTECTED_TEMPORARY_IDENTITY_FILE
```

Use the real path returned by backup. Backup encrypts the custom-format PostgreSQL and media streams directly into `.age` files, recording source/image identity, start/dump-complete/completion UTC timestamps, aggregate business counters and a SHA-256 manifest under root-only staging storage. Do not run baseline comparison while test writers change the source; stop worker/app after the retained fixture is created, or record the resulting snapshot limitations.

Copy the dedicated identity only for the authorized rehearsal into a root-only temporary RAM directory such as `/dev/shm/morphiume-restore-<random>/identity`, with mode600. Remove that exact temporary identity after decryption/rehearsal; retain the local identity securely. Never put its contents in command arguments, logs, Git or public artifacts.

Restore verifies the manifest, creates a new `morphiume-restore-*` project/network/data directory and fresh bootstrap/owner/runtime DB passwords, decrypts into `pg_restore --exit-on-error --single-transaction --role morphiume_staging_owner`, safely extracts media and keeps evidence/data. It applies DML-only runtime permissions. The restored app uses the backed-up source image, a separate DB, cloned staging auth keys, origin `http://localhost:3101` and loopback server3002. No worker or host DB port exists in the restore project, and the current staging/live DB is untouched.

Forward `ssh -N -L 127.0.0.1:3101:127.0.0.1:3002 morphiume-deploy`. `recovery-start-utc` precedes DB startup/decryption and `application-ready-utc` records readiness; full RTO ends only at `recovery-accepted-utc` after the native login/order/media/reconciliation assertions below. An app readiness timestamp alone is not full RTO.

The canonical restore browser origin is `http://localhost:3101`, server loopback3002/container3000, matching both scripts. Port3200 in an older conversational summary is not an executable contract; do not use it for auth origin or QA. See [handoff URL table](ARCHIVE_HANDOFF.md).

QA will create and retain one dedicated synthetic fixture only after the actual staging app is deployed: native OTP customer login, owned paid order, published product and uploaded media physically in server `MEDIA_ROOT`. Enable the explicit retention flag only for the completed Chromium T25 test against tunnel3100; private `.local/restore-acceptance.json` records the phone/order/product, expected stock/receipt/shipment/amount and media URLs/SHA-256 without cookies or auth secrets. Old Windows media fixtures are insufficient unless deliberately copied and validated.

Acceptance against restore3101 requires a fresh native OTP login for that retained customer, access to their restored owned order, payment status/amount and shipment tracking, exact uploaded-media SHA-256, and repeated callback/verification/reconciliation producing no extra receipt/shipment/stock mutation. Compare aggregate baseline/restored counters with paused source writers. A `pg_restore` zero exit does not pass T22. Keep restored worker disabled until reconciliation is verified.

For recovery-point measurement, record the dump-start/dump-complete window and the retained order's commit time. Ideally create a separate native post-backup marker/paid order before the simulated incident and verify that it is absent from restore; reconcile that gap using independently retained mock-provider evidence. Report the actual lost-marker count and snapshot age/time interval. If no post-backup write is exercised, only preserved fixture/backup-age evidence is available; do not claim zero RPO or validated15-minute PITR. Real external PSP recovery remains blocked by the actual account/contract.

After any real recovery, record payments newer than the selected DB recovery point and reconcile with the actual PSP using authority/reference and amount/currency before resuming fulfillment. Deduplicate captures and refund/fulfillment effects; do not treat missing recovered order data as a declined payment or blindly replay outbox jobs. This provider-specific step cannot be executed without the real PSP account and approved live scope.

After retaining the rehearsal report, remove only the explicitly named restore containers/network and resolved restore directory after owner/coordinator review. `compose down --volumes` against the current staging/live project is not a restore cleanup command. Keep an intact offsite backup and key access independent of this host.
