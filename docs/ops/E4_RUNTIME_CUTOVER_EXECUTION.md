# E4 runtime cutover execution

Root completed the protected staging runtime cutover to accepted E4 at **2026-10-13T07:44:07.468774Z**. The separate `morphiume_staging_runtime` database moved from migration 11 / 49 tables to migration 13 / 53 tables. Actual before/after observations accepted preservation of the 49 existing table projections, their catalog/ACL/sequence evidence and the first 11 migration-history entries while runtime writers were stopped. E4 app and worker then started together. Resuming old 613 consumers is forbidden after the new notification schema/consumer activation.

This report records Root's execution from seven supplied safe result files and the public release evidence. The documenting agent performed no server, database, native-browser or service operation and did not reopen raw private captures. The machine-readable record is [e4-runtime-cutover-safe.json](e4-runtime-cutover-safe.json). Status is bounded to Root's **08:12 UTC handoff**: deployed Chromium retained T25 was running; its acceptance was not yet available to this report.

## Accepted identities

| Binding | Value |
| --- | --- |
| Accepted application source | `e4bed691dc938a9c0f79022696d24f063ad97724` |
| Tested platform config | `sha256:246b9226db86bf63b37499c2b4a80c2e5e8f62265b3546674de48c480f524665` |
| Registry manifest | `sha256:dea7a91aa15b8ea653f92d68aee16a168a204f8c0da79a2459e5f748df659c47` |
| Platform archive SHA-256 | `aed2f8a7b868d32410c55708042dcf945a0491a1f747632df16689e3d072432c` |
| Immutable Engine image | `sha256:3b78dc30dcaa2a6d9b88f913e8bec4002454a0eef7b81ea83a953c5e8a5c2b6d` |
| Engine proof SHA-256 | `3f1b15a278706ac09be6f644b2042728b1a5ae3cacf3dfb5315181c51de03810` |
| Frozen Ops bundle | `68bc527a9c34ccefef72bb4427288da47c75c3a584e7cb140ecfc3c3fbdad6a3` |
| Cutover companion SHA-256 | `30d521ea58b66917b9365d4d1b88d33a81e8ea8b739d172698a8fa2bfc5f2112` |
| Promoted profile SHA-256 | `67f77b1636d0ae2b9b81df9e46f4a3c93087b01e0d4e6fdaa730b2604e60dd96` |

The tested config, registry manifest and Engine image are distinct identities connected by the accepted archive and read-only Engine proof. They are not interchangeable tag references. [Accepted image evidence](E4_ACCEPTED_IMAGE_EVIDENCE.md) retains artifact/checksum, unchanged High/Critical scan gate, container/native/worker and both 78-browser acceptance scopes. Those CI suites are separate runs, not 156 unique cases. The scan still reported three Medium findings; acceptance is not a zero-vulnerability claim.

## Actual phase results

Operation: `8df98db3-9359-4cc5-b083-d2ea7ee2222a`. All times below are recorded completion timestamps converted to UTC; durations are the phase measurements, not derived downtime or recovery objectives.

| Phase | Completed UTC | Measured seconds | Result |
| --- | --- | ---: | --- |
| Stop/backup preparation | 07:32:28.798707 | 62.679803 | Exit 0; encrypted previous-release backup completed; writers not started |
| Writer-free preservation gate | 07:35:11.565366 | Not reported | Writers stopped; runtime client backends 0; history 11; PG version 180006; no SQL mutation |
| Read-only before observation | 07:38:07.238382 | 0.772435 | Exit 0; 49 tables / 11 migrations; baseline captured |
| Owner-only migration | 07:40:48.694099 | 33.212321 | Exit 0; migration phase complete; no seed; writers remained stopped |
| Read-only after observation | 07:41:28.159535 | 0.960156 | Exit 0; 53 tables / 13 migrations; preservation accepted |
| Proof and activation | 07:44:07.468774 | 37.475752 | Exit 0; actual network-none comparison accepted; profile promoted; E4 app/worker committed |

The safe inputs expose matching operation, gate, before, backup, catalog and committed-state bindings. Their raw-file hashes and preservation digests are retained in the JSON. The full E4 reference catalog digest is `d1b313d5291756e74dea9011df45e8e887e7860ce0cc20446f1fc061add4d2a4`; its raw file digest is `ec92b04adf34e3d9f9c6b19d8f26e7fa6fc0f47effec1e1d669eccd2683c92f0`. These are distinct from the narrower addition-catalog digest. [Schema compatibility](E4_SCHEMA_COMPATIBILITY.md) and the [dispatch contract](E4_RUNTIME_UPGRADE_DISPATCH.md) define the projections and finite migration/activation gates.

Preservation applies to the stopped-writer before/after interval in the **runtime database only**. The first 11 history entries remain equal while 0012/0013 are appended. The notification table gains five columns and four analytics tables are added with pristine add-on state, so whole post-migration schema equality is not asserted. Neither original `morphiume_staging` row equality nor post-activation global row equality was measured by this cutover.

## Backup and post-activation observation

The fresh stopped-writer backup is `/srv/morphiume/staging/runtime/backups/20261013T073228Z-7a9c830f`. Its manifest retains previous application 613 / previous Ops 591 identity; the executing backup bundle is Ops 68. It has not been relabeled as E4. Encrypted database and media objects are **120,662** and **720** bytes; manifest and ciphertext hashes are in the JSON. Ciphertext checks establish neither decryption nor successful restoration. No offsite or PITR result is claimed.

Root's separate read-only inventory at **07:47:01.811046 UTC** observed a clean E4 checkout and two healthy running containers with the immutable E4 image/source, UID `1001:1001` and read-only roots. App limits were 1.5 CPU / 1,536 MiB / 128 PIDs; worker limits were 0.5 CPU / 384 MiB / 128 PIDs. These are configured limits, not measured capacity. Root and Docker free bytes were 20,585,222,144 and 37,926,895,616. The reserved `/srv/morphiume/postgres` mount remained `/dev/mapper/vg0-lv--2`, ext4. Runtime storage/config parents remained root-owned 0700, and observed config/record files were 0600 without symlinks. This inventory recorded `ready=null`; it supplies no additional HTTP readiness sample. It made no SQL or service mutation.

Root separately reported tools checkpoint `c059260`, CI run **38362550966**, completed successfully. Its raw test counts have not been parsed for this report, and that tools conclusion does not replace the E4 application/image bindings above.

## Remaining acceptance and retained history

As of the handoff, deployed E4 retained T25, scoped notifications/analytics, a fresh E4 backup plus isolated business/media restore, private-IP native acceptance in all three engines, external capacity testing, and new-release scheduled-health/timer approval remained pending. Historical 613 restore/health evidence cannot be promoted into E4 acceptance. The staged origin/profile remains the SSH preview contract; this report does not activate private-IP access, live payment/SMS providers or a domain, nor establish RTO/RPO, load capacity or ASVS completion.

Earlier failed preparation/download/security outcomes remain retained in [Linux runtime execution](../qa/LINUX_RUNTIME_EXECUTION.md), [browser toolchain cache](../qa/BROWSER_TOOLCHAIN_CACHE.md), [image security](IMAGE_SECURITY.md) and [E4 accepted image evidence](E4_ACCEPTED_IMAGE_EVIDENCE.md). The separate [Linux E4 focused native execution](../qa/LINUX_E4_FOCUSED_NATIVE_EXECUTION.md) records acceptance on its own local generator target; it is not the deployed runtime T25 result. Prepared dispatch documents and the previous immutable 613/Ops591 records remain historical evidence rather than being overwritten by this execution report.
