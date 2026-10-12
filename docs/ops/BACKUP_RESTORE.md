# Backup and restore

No full restore rehearsal has been executed yet. Encryption preparation installed Ubuntu's signed `age=1.1.1-1ubuntu0.24.04.3` and passed a real encryption/decryption digest roundtrip. The dedicated identity is in ignored, user-ACL-protected `deploy/staging/.local/backup-age-identity.txt` on the local computer; only its recipient is in server `/etc/morphiume-staging/backup-recipients.txt` mode600. This key separation is not an owner-approved offsite backup/key-custody solution. A daily/local dump does not establish order-data RPO<=15 minutes or RTO<=2 hours.

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
