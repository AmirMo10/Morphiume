# E4 runtime cutover dispatch and preservation gates

Prepared 13 October 2026. The new companion and its mock tests are preparation only. Root owns publication, immutable tool materialization and a separate explicit dispatch for each mutating phase. This agent ran no SSH, server command, PostgreSQL connection, writer operation, transfer, image load, backup or native request. Root's completed transfer/load/preflight below are distinct reported operator evidence.

## Exact accepted and retained identities

| Identity | Accepted E4 candidate |
| --- | --- |
| Application source | `e4bed691dc938a9c0f79022696d24f063ad97724` |
| Acceptance run | CI38352565901:837 domain/78 browser verify,78 image browser plus worker/native acceptance, as reported by Root; scopes are not summed |
| GitHub artifact |11791954889; ZIP86185674bytes; SHA256 `36571e21d07548af43721f709e749dfff6bef4ad5b7ce2c28ee1a49321da422e` |
| Tested Linux config | `sha256:246b9226db86bf63b37499c2b4a80c2e5e8f62265b3546674de48c480f524665` |
| Registry manifest | `sha256:dea7a91aa15b8ea653f92d68aee16a168a204f8c0da79a2459e5f748df659c47` |
| Inner accepted archive |86184814bytes,15 layers,230841344 uncompressed layer bytes; SHA256 `aed2f8a7b868d32410c55708042dcf945a0491a1f747632df16689e3d072432c` |
| Proven Engine run reference | `sha256:3b78dc30dcaa2a6d9b88f913e8bec4002454a0eef7b81ea83a953c5e8a5c2b6d` |
| Engine proof SHA256 | `3f1b15a278706ac09be6f644b2042728b1a5ae3cacf3dfb5315181c51de03810` |
| Reviewed21-file Ops | `68bc527a9c34ccefef72bb4427288da47c75c3a584e7cb140ecfc3c3fbdad6a3` |
| Ops publication source | `c749f796d62b9680a26dd7ee5a84f38f2fd43da6` |

The Engine ID is a separate cryptographically proven config/manifest mapping, not a replacement label for the tested config. Never use a mutable tag as the run reference. Retain app613 source `6130f4ed7ec090344a5a4a1937a65ef04572975b`, Ops591 `591ad92162d1747238db946c9a9a22724edde79627c6995a353c5064b39a77db`, their full archive/config/manifest/proof and the active3100 profile under their own identities. Previous release arguments and the previous profile hash come from Root's protected verified eight-identity handoff, not an inferred current file or a rewritten old marker.

Root reported actual inventory06:51:20Z: healthy app/worker613, UID1001/read-only/unchanged limits, root free20679262208bytes, Docker free38048321536bytes, reserved `/srv/morphiume/postgres` on `vg0-lv--2`/ext4. These are dated facts, not current capacity guarantees. The explicit shared window was released06:53:32Z. Transfer/server checksums completed06:52:25Z, clean checkout moved specifically to E4 at06:54:09Z, Ops68 bytes were materialized/verified06:54:41Z, and image load/proof completed06:55:27.773769Z in22.078080185s. The v2 proof has `applicationStarted=false`; no SQL or E4 app/worker start followed.

Root's network-none accepted-image preflight passed07:12:09.571168Z in0.421130923s: interactive stdin attached, packaged `pg.Client` importable, Node24.21/root UID, dropped capabilities/read-only/128MiB/0.5CPU, no DB connection or app start. Protected evidence is the E4 release's `observer-preflight-20261013T071200Z` directory. This establishes that small preflight, not the forthcoming observer/comparison/service execution.

## Checkout, bundle and backup sequencing

`verify-release.py --load` and `contract.verify_release()` require `/opt/morphiume` to be clean at the **accepted application source**, even when the executing public Ops bundle was published independently at C749. Preserve old archives/bundles/profiles; do not pull a newer main tip or overwrite an immutable bundle. The accepted checkout is now E4 as reported above; runtime containers still use613. Current source/scripts being prepared here have no inherited application image proof.

Canonical server paths:

| Purpose | Exact namespace |
| --- | --- |
| E4 three-file archive | `/srv/morphiume/staging/runtime/releases/e4bed691dc938a9c0f79022696d24f063ad97724/` |
| E4 independently reviewed Ops | That release's `ops-bundles/68bc527a9c34ccefef72bb4427288da47c75c3a584e7cb140ecfc3c3fbdad6a3/ops/` |
| E4 loaded proof | That release's `proofs/68bc527a9c34ccefef72bb4427288da47c75c3a584e7cb140ecfc3c3fbdad6a3/loaded-release.json` |
| New independently published companion | That release's `tools/TOOL_SHA256/runtime-preserved-upgrade.py` |
| Public observer files | That tool directory's `observation/observe-runtime-preservation.mjs` and adjacent `upgrade-original-observation.mjs` |
| Fixed staged state | `/etc/morphiume-staging-runtime/preserved-upgrade.json` |
| Immutable phase journal | E4 release's `preserved-upgrade-OPERATION_UUID/NN-PHASE.json` |
| Candidate Compose environment | `/etc/morphiume-staging-runtime/deploy.candidate.env` |
| Actual Root-prepared observation namespace | `/srv/morphiume/staging/runtime/preservation/8df98db3-9359-4cc5-b083-d2ea7ee2222a/` |

Directories are real/root-owned700, protected JSON/env/ciphertext files600/singly linked; public source may be0644 without relaxing private parents. Materialize only hash-verified published files, with an exact21-member Ops manifest. The companion verifies all21 bytes and their manifest digest **before** any Ops Python import. Its tool-local `unused-bytecode-cache` must not exist or be a symlink; `-I -B`, `sys.dont_write_bytecode` and this fresh prefix prevent cached old bytecode from bypassing source verification. Do not remove old caches or overwrite old files to make a guard pass.

After HEAD moves to E4, invoking old591 `backup.py --apply --source613` is intentionally rejected by its clean-HEAD gate. The companion instead verifies candidate E4 through Ops68, re-proves the retained613 archive/proof with `archived_image(previous)`, then calls imported Ops68 `backup.create_backup(previousReport)` while the release lock is held and old writers are stopped. Its manifest retains source613/Ops591/old config/archive/engine identity and records `backupOpsSha256=68…` separately. It is an actual runtime DB/media backup, not a backup of the separate original database or of the E4 checkout. An old prior backup cannot replace this fresh writer-free capture.

The first-deployment `prepare.py`/`deploy.py` cannot upgrade populated runtime data; deploy would seed and rejects the existing namespace. The one-shot frozen `upgrade.py --apply` also cannot satisfy this protocol: it starts writers immediately after DDL, without the required before49/after53 gate. Do not invoke it as a shortcut. The new staged companion imports its verified helpers but supplies the missing finite phases outside OPS_FILES; the Ops68 fingerprint stays unchanged.

## Finite dispatch order

1. **Publish and freeze this separate tool first.** Root independently reviews tests/bytes, assigns its published `toolSourceCommit`/raw Linux `toolSha256`, materializes the exact protected path and two byte-verified observer modules, and re-proves candidate/previous/profile/config/mount/DB identities. Root confirms no pending preview/upgrade/partial file, current writer pair healthy, timers suspended/disabled, and a newly released shared runtime/cluster window. A prior release acknowledgment does not authorize a later occupied window. No credentials are regenerated or exported.
2. **Prepare phase, one explicit dispatch.** Under the release lock, journal immutable previous/candidate identities and snapshots, validate quiet old/candidate Compose, gracefully stop only verified runtime app/worker with30s timeout, verify both actually stopped, then encrypt DB/media directly with age. Keep original DB/container/mount/data, old restore and every unrelated service untouched. Hash the completed manifest/ciphertexts and require schema11. Stop failure cannot claim writer-free capture; failure leaves a private failed journal and never automatically resumes old consumers.
3. **Root before observation.** Root completes protected `cutover-gates.json` from actual accepted/backup/stopped/window facts, then runs the published [runtime observer](RUNTIME_ANALYTICS_NOTIFICATIONS_MIGRATION.md) as its DML-only app role. Before must capture all49 old public tables and exact canonical11 history, old column row multisets/catalog/index/constraint/ACL/sequence state. No checksum normalization, seed, queue cleanup or new consumer/capture is permitted. Capture a finite overall deadline in addition to per-query limits. Root records the resulting raw `before.json` SHA; a placeholder or original-database record fails.
4. **Migrate phase, a new explicit dispatch.** Supply exact fresh state/gate/reference/before hashes. The companion re-proves old stopped writers/unchanged profile/env and backup, runs a bounded network-none pure comparison/preflight through the accepted E4 Engine ID, then journals owner checks and runs `check-owner`, `check-app`, `migrate` once with `--pull never`, no dependencies/seed. The migration config contains only the owner URL/providers, never native operator exports. Before history must be canonical11; only0012/0013 append. The command remains stopped after success. Any failure/partial state prevents replay or automatic rollback.
5. **Root after observation, while still writer-free.** Capture precisely53 tables/history13. Compare original columns of the old49, preserve the first11 checksums/timestamp digests, old row/column/index/constraint/schema/sequence/grant evidence, and the independently trusted additions. Three analytics tables must be empty, coverage a pristine singleton, legacy notification fields/defaults valid. Native traffic, analytics capture, new producer/worker activity and any cleanup remain forbidden until this comparison passes. Record actual raw `after.json` SHA and its accepted comparison; never accept whole-row hashes after adding columns.
6. **Activate phase, a separate explicit dispatch.** Require the same state/before/gate/catalog/backup/source/engine hashes plus actual after SHA. Recompute `compareRuntimeObservations` from byte-verified observer code rather than trusting an `accepted` boolean. The companion checks the closed summary and exact11→13/49+4 counts, persists acceptance, durably promotes the new canonical profile, recreates only E4 app/worker together, waits180s, and validates immutable Engine ID/source/UID/health plus ready200. It preserves prior deployment history and the old encrypted backup, promotes candidate env/record, and writes compatibility evidence. Native fixture acceptance remains pending. New notification materialization is recorded as requiring post-start observation, not invented as zero.
7. **New native/recovery acceptance.** With the new app/required notification worker only, run owned3100 T25, scoped feeds/operator permission/read/replay/delivery tests, retained media/business checks and measured resource/heartbeat/graceful-stop evidence. Create an E4 stopped-writer encrypted backup and restore into a fresh lowercase Ops68 restore namespace at3101 with no worker; complete native six-check business/media/payment reconciliation against that exact fixture and measure actual RTO/RPO scope. Old613 restore acceptance is retained history, not E4 acceptance. Preserve both old and new evidence.
8. **Later independent gates.** Private-IP activation needs accepted E4 native/3101 matching-fixture restore baselines, explicit marker-origin/fixture normalization, fresh authorized IPv4/IPv6/perimeter inventory and protected all-route Nginx/native three-engine acceptance. Keep canonical3100 until separate dispatch. Off-server browser cache/launch gaps and actual private-IP behavior remain independent. Capacity200VU/arrival-rate runs require the external generator, dedicated accounts and actual app/DB/worker/resource/ledger evidence. New timers/full scheduled-health approval require new release/profile/restore evidence; old591 measurements/approval cannot be rebound automatically. No live PSP/SMS/domain/offsite/PITR claim follows.

## Reference and observer bindings

Root reported the independently prepared E4 reference: PG180006,13 migrations/53 tables; raw15510-byte `addition-catalog.json` SHA256 `ec92b04adf34e3d9f9c6b19d8f26e7fa6fc0f47effec1e1d669eccd2683c92f0`. Its **full canonical reference digest** is `d1b313d5291756e74dea9011df45e8e887e7860ce0cc20446f1fc061add4d2a4`, the value for gate `additionCatalogSha256`. It is distinct from the reference's nested `catalogSha256`; do not substitute that subdigest. Root copied/rehash-verified the protected reference07:07:40Z; before/after are not yet observed.

Canonical-LF public observer SHA is `9cdf78bd28211c28d1f1365ba4ac69d8b64d27fd560750560cb03b9f7806a615`; shared helper SHA is `49b0fc6ab478c632132161c548a4934434e4ba0b9295eda7f4029ef5f39abc83`. Root must verify actual Linux raw bytes from their explicit published observer source before use; CRLF workspace raw hashes are not substitutes. The13-migration manifest digest is `4d4c96b6c3c04e9ee6807d57b419dfe0c7760df13925298754dfeba0957f1119`, with the two appended checksums in [the compatibility contract](ANALYTICS_NOTIFICATIONS_UPGRADE.md).

Packaged E4 contains runtime/migrations, not the two public observer scripts. Both comparison and actual capture must mount the byte-verified scripts individually and adjacently at `/app/deploy/staging/`, read-only. The pure comparison uses `docker run -i --pull never --network none --read-only --user0:0 --cap-drop ALL`, no privileges,384MiB/0.5CPU/64PID/90s deadline, backup directory read-only at its **same absolute host-style path**, and JSON evidence on private stdin. `-i` is necessary for the stdin stream according to [Docker's documented interactive option](https://docs.docker.com/reference/cli/docker/container/run/#interactive). It performs no DB connection; it independently calls the existing backup/reference/history/row/catalog/pristine-addition validators. Its root UID enables reading root-private evidence/ciphertexts and does not change app/worker UID1001.

Root's separately dispatched actual observer capture uses root UID/dropped capabilities/no privileges/read-only rootfs, the same two public files, exact preservation directory rw and backup directory ro at `/srv/...` paths, existing internal database network only, and minimal DML-only config on private stdin capped16KiB. Use `--entrypoint node` so the maintained protected capture CLI runs directly; no migration-owner config, Docker socket, unrelated host bind or ambient DATABASE_URL is passed. Actual CLI source/gate/catalog/baseline/output flags and root-private checks remain exactly those in the runtime-preservation runbook. Do not run it from Windows15433 or call an image-packaged path that does not exist.

## Companion invocation contract

Root sets an explicit Bash array `DISPATCH` from the reviewed protected handoff. It contains every required pair: new `--source/--config-id/--manifest-digest/--archive-sha256/--ops-sha256/--ops-root/--ops-source-commit`; independent `--tool-source-commit/--tool-sha256`; exact `--operation-id/--evidence-dir`; observer `--observer-source-commit/--observer-sha256/--shared-helper-sha256`; and all eight previous identity flags `--previous-source/--previous-config-id/--previous-manifest-digest/--previous-archive-sha256/--previous-ops-sha256/--previous-runtime-image-id/--previous-engine-proof-sha256/--previous-access-profile-sha256`. These are explicit public/protected metadata identities, never secret values or inferred main HEAD.

```bash
# Default plan: no imports, files, server/DB commands or mutations.
python3 -I -B "$TOOL/runtime-preserved-upgrade.py" "${DISPATCH[@]}" --phase prepare

# Root-only, after review/publication/materialization and phase-specific GO:
python3 -I -B "$TOOL/runtime-preserved-upgrade.py" "${DISPATCH[@]}" \
  --phase prepare --migration-reviewed --quiescent-window-released --apply

# After Root actually captured/verified before49:
python3 -I -B "$TOOL/runtime-preserved-upgrade.py" "${DISPATCH[@]}" \
  --phase migrate --state-sha256 "$PREPARED_STATE_SHA" \
  --gate-sha256 "$ACTUAL_GATE_RAW_SHA" --catalog-sha256 "$REFERENCE_RAW_SHA" \
  --before-sha256 "$ACTUAL_BEFORE_RAW_SHA" \
  --migration-reviewed --quiescent-window-released --apply

# After Root actually captured/verified after53:
python3 -I -B "$TOOL/runtime-preserved-upgrade.py" "${DISPATCH[@]}" \
  --phase activate --state-sha256 "$MIGRATED_STATE_SHA" \
  --gate-sha256 "$ACTUAL_GATE_RAW_SHA" --catalog-sha256 "$REFERENCE_RAW_SHA" \
  --before-sha256 "$ACTUAL_BEFORE_RAW_SHA" --after-sha256 "$ACTUAL_AFTER_RAW_SHA" \
  --migration-reviewed --quiescent-window-released --apply
```

Each state hash is the actual raw600 file after the preceding phase; preserve all phase snapshots. Unknown/missing/extra journal entries, stale hashes, wrong source/bundle/profile, active writers, partial `.new` files, unsupported phases or replay fail. The script does not make before/after evidence, approval, credentials or a passing gate. Any started phase failure leaves stopped/partial state and fixed redacted output; a stop failure may leave writers running and is explicitly **not** writer-stop/backup success. Root must diagnose that preserved state without blind retry.

## Compatibility and remaining blockers

Never resume app613 or its old worker after E4 notification activation. Old customer feeds do not filter audience and the old worker may complete unknown notification jobs. An additive schema does not make those consumers safe. Failed activation retains canonical/partial state and stops the same project once; it performs no credential regeneration, queue/financial cleanup, schema rollback, restore-over-current operation or old image restart. A separately accepted compatible roll-forward or independently dispatched isolated restore is required; commit order alone cannot establish compatibility.

The companion is not yet published/materialized/dispatched. Its frozen canonical-LF SHA256 is `30d521ea58b66917b9365d4d1b88d33a81e8ea8b739d172698a8fa2bfc5f2112`; the safety suite is `f204475c23624aa05b707750589c612e1c855569f88c8c8fa3347f508df1fae5`. Root must bind the actual new published tool source commit before materialization/execution. The actual fresh stopped-writer backup, before49, owner-only0012/0013, after53, E4 profile/paired start, nativeT25/new restore/private-IP/capacity/scheduling remain unexecuted. The full phase resource cost and one-shot timeout outcome are unmeasured; a failed budget/crypto/DDL/comparison gate is preserved, not silently enlarged or retried. Source preparation cannot approve these actions.

Actual preparation checks:24/24 companion safety tests on WSL Ubuntu24.04/Python3.12.3,0 skip/failure/error,0.321s. Commands/services/PG/HTTP are mocked and only disposable files are used. They cover old backup identity, before/after gates, stale/partial/unknown state/action, source/hash rejection, owner/migration single execution, profile ordering, stopped failures, no seed/old restart, closed comparator output/sandbox/stdin contract, and a timestamp-valid stale-PYC control versus verified source. Independently, existing pure original/runtime observer suites passed121/121 on Node24.21 in1392.470388ms, with no connection; they exercise exact history, projected rows, catalogs, grants, pristine additions and rejection semantics. These are distinct test scopes, not145 deployment tests. Python AST/embedded Node syntax and owned whitespace checks passed; frozen21-file Ops digest remained68bc…6a3.

Root independently reported the exact frozen source checks passed again:24/24 in0.294s (wall0.5202044s),121/121 with zero failure/skip (wall0.722171232s), and all19 copied source hashes unchanged. Its protected Linux review directory `review-preserved-upgrade-20261013T072000Z` retains raw logs/hash map; no actual DB/Docker/browser action was part of those regressions. These repeats are not additional unique acceptance cases.

During test development a misplaced indentation and a mock-reference mistake were corrected; no server operation was involved. Root also found the missing Docker stdin attach flag before any companion execution; `-i` and a concrete detached-stdin counterexample now pass, and Root's independent actual small preflight is recorded above. No gate was removed, no actual failure converted to acceptance, and no commit/push was performed by this agent.
