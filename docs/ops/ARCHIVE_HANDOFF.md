# Accepted image handoff to protected staging

No image is accepted at this handoff. Server image/source/app operations remain gated on the coordinator supplying the successful CI run, accepted full source commit, tested platform config ID, matching registry manifest digest and archive SHA256. Read these from that run's accepted evidence, not a newly invented local checksum or a mutable tag. This is protected synthetic staging; no public mock route or live data/provider credentials are introduced.

## Current read-only baseline

On2026-10-12 the exact reserved source/filesystem and staging path guard passed. Server checkout is clean at7f403a9834aee3f392d182d58f37b1ee12cb56a0; published main at this review is1a4fa4433d720b490ce222e8898cb09f73ba4abf, whose image did not pass acceptance. Only `morphiume-staging-db-1` is running/healthy. App/worker are stopped.

| Observation | Actual sample |
| --- | --- |
| Root/staging free | 21,011,329,024 bytes |
| Docker filesystem free | 38,518,431,744 bytes |
| Reserved live filesystem | `/dev/mapper/vg0-lv--2`, ext4, preserved;31,766,970,368 bytes free |
| Staging PG directory / database | 81,312,147 bytes /23,606,975 bytes |
| PostgreSQL / migrations | 18.6 /7 applied |
| Server staging media / backups | Empty at this sample |
| Existing synthetic outbox | 269 pending/running,15 dead, oldest~12,615s before app/worker/load |
| Protected runtime configs | app/worker/migration JSON uid1001, mode600; values not printed |
| Host app/DB listeners | No app listener; DB only127.0.0.1:5433, SSH15433 tunnel retained |

The queue includes integration-fixture work and intentional failure cases. Record a new baseline before worker startup and before load; preserve/triage pre-existing dead jobs with Backend rather than attributing them to new workload, deleting all jobs or blindly replaying financial effects. Disk samples are headroom evidence at this time, not a guarantee for an unknown archive or restore size.

## Trusted artifact and verification

CI exports `accepted-runtime-image` only after the unchanged Grype gate, actual image/browser/worker tests and tested-config registry promotion. It contains `accepted-image.tar.gz`, `accepted-image.sha256` and `image-identity.json`; current retention is seven days. The archive is the locally accepted Linux platform image from `docker save` and gzip. Registry provenance/SBOM stays on the matching manifest; the platform archive is not claimed to carry that attested multi-platform envelope.

Download from the exact successful run through authenticated repository access. Keep local bytes under ignored/private storage. Validate the artifact filename set before extracting the GitHub ZIP; never execute any archive entry or blindly extract paths outside the intended private directory. Expired/missing artifacts require a new accepted build/export, not a host build or a package-visibility change.

`deploy/staging/verify-release.py` defaults to read-only inspection without tar extraction or Docker access. It compares explicit trusted identities and checksum sidecar, hashes the compressed archive and config bytes, validates source labels/platform/uid/entrypoint, rejects baked credential environment, and verifies every uncompressed layer against the config diff-ID. It accepts ordinary or gzip-compressed layer entries. Unknown export formats/multiple platform manifests fail pending actual review.

```sh
python3 deploy/staging/verify-release.py PRIVATE_DIRECTORY/accepted-image.tar.gz PRIVATE_DIRECTORY/image-identity.json \
  --source ACCEPTED_40_CHARACTER_SOURCE \
  --config-id sha256:ACCEPTED_64_CHARACTER_PLATFORM_CONFIG \
  --manifest-digest sha256:ACCEPTED_64_CHARACTER_REGISTRY_MANIFEST \
  --archive-sha256 ACCEPTED_64_CHARACTER_ARCHIVE_HASH
```

Windows uses the same Python script from the repository with its private local paths. Script output contains identities/byte counts only. Synthetic validator probes passed for uncompressed/gzip layer archives; corrupt layer, unsafe path, baked credential, wrong trusted config and wrong archive SHA were rejected. These are verifier tests, not an accepted application image, actual Docker load or deployment.

## Steps only after accepted dispatch

1. Recheck strict SSH host key, exact reserved mount, staging path resolution, clean checkout, DB health/data/migrations, media and root/Docker free space. Preserve existing secret files and passwords. Fetch published source, confirm the accepted SHA descends from current checkout, and fast-forward specifically to that SHA; do not pull an unreviewed newer main tip. The original three untracked staging files were already preserved/reconciled; no blanket clean/reset is needed.
2. For registry access, use the immutable accepted manifest reference and verify its platform config/source after pull. If private pull credentials are unavailable, transfer only the three verified artifact files through strict SSH/SCP into a new root-owned0700 `/srv/morphiume/staging/releases/ACCEPTED_SOURCE` directory, with files0600. Recheck SHA256 on received bytes before loading. Do not render runtime secrets or change package visibility.
3. Re-run `verify-release.py` against the received artifact and the same explicit trusted arguments. Its opt-in `--load` mode is Linux/root/staging-path guarded, requires the clean accepted checkout and exact reserved mount, checks Docker free space against twice observed uncompressed layer bytes plus1GiB, serializes archive loads and calls `docker image load --platform linux/amd64 --input ...`. It then inspects only ID/source/platform/user, writes protected `loaded-release.json` and starts no app. The loading mode is prepared but unexecuted.
4. Use `testedPlatformConfig` as the immutable loaded image ID. Quietly validate full/integration Compose; retain loopback DB access during QA with `MORPHIUME_KEEP_DB_TUNNEL=1`. Run `deploy.sh ACCEPTED_SOURCE sha256:ACCEPTED_PLATFORM_CONFIG` only after the explicit deployment dispatch. It backs up before migration, runs a single migration job and waits for app/worker readiness.
5. Verify stage through3100, record actual worker drain/heartbeat/shutdown and correct initial queue baseline, create the retained native customer/order/media fixture, then perform encrypted isolated restore and the worker-stop/recover alert drill. Compare business/media/dedup evidence, timed RTO and observed recovery-point gap. Schedule templates remain uninstalled until successful restore and explicit schedule dispatch; owner alert delivery/offsite/PITR remain unclaimed.

The load headroom formula is a conservative initial check. Retain the actual artifact size, load duration/exit, image identity, server resource peak and post-load free space. Recheck root space for encrypted backup and a separate restore database/media copy; preserve the source DB and the original reserved mount throughout.

## Canonical staging and restore URLs

| Purpose | Browser origin | SSH forward | Server listener | Container |
| --- | --- | --- | --- | --- |
| Protected stage | `http://localhost:3100` | `127.0.0.1:3100:127.0.0.1:3001` |127.0.0.1:3001 |3000 |
| Isolated restore | `http://localhost:3101` | `127.0.0.1:3101:127.0.0.1:3002` |127.0.0.1:3002 |3000 |
| Temporary DB QA | No browser origin | `127.0.0.1:15433:127.0.0.1:5433` |127.0.0.1:5433 |5432 |

`restore.sh` sets APP_BASE_URL3101 and `compose.restore.yaml` binds server3002. Use `ssh -N -L 127.0.0.1:3101:127.0.0.1:3002 morphiume-deploy` and QA origin3101. Port3200 is not this restore contract. The restored app has cloned stage auth keys, fresh DB passwords and no worker; native fresh login and owned-order/media/payment reconciliation must be exercised there.
