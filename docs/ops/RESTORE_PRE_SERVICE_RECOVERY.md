# Failed pre-service restore and finite forward recovery

Current state: the coordinator retained the native613 Chromium T25 fixture (1/1 passed15.216108s, nine native requests, no retry), stopped only runtime app/worker, and completed an encrypted backup at `/srv/morphiume/staging/runtime/backups/20261012T212644Z-fe6ca5ce`. First restore session96238 failed before DB initialization. The separately published tool923/sourcea899 then completed the finite recovery, and QA passed all six native/business/media checks in33.8336788s, accepted at2026-10-12T22:23:03.008Z. The coordinator wrote protected business-result and recovery-accepted records, stopped only the restore pair, removed the exact temporary RAM key/directory after guarded checks, and resumed the healthy runtime pair at22:31:04.930595Z. Restore data and the original database/reserved mount remain retained. Offsite protection isfalse. See [measured recovery and next operator recipe](POST_RESTORE_OPERATIONS.md); the worker critical/recovery drill subsequently passed; no timer or full scheduled-health service has been executed.

## Proven failure and retained state

Authorized read-only observation at2026-10-12 21:29:50 UTC found the exact prepared physical root:

```text
/srv/morphiume/staging/runtime/restore/morphiume-runtime-restore-20261012T212729Z-d03c35
```

Existing app.json, restore.env, recovery-start.json and three generated password files retain their intended ownership/mode. App origin3101, restore DML URL shape and cloned runtime auth/control keys passed pure checks. Backup release/profile and both ciphertext hashes match; temporary memory identity is protected. PostgreSQL/media directories are entirely empty, no PG_VERSION/ready/accepted file exists, and no restore-labelled container exists. No raw config, key, private media path/content, SQL or log was printed.

Exact `docker compose --project-name morphiume-runtime-restore-20261012T212729Z-d03c35 ... config --quiet` exits1 with the safe classifications invalidProjectName/requiresLowercase. Changing **only** the CLI project to `morphiume-runtime-restore-20261012t212729z-d03c35` passes quiet configuration, exit0; no up/pull/service/PG operation occurred. Compose requires lowercase names, and its explicit project flag has highest precedence. Earlier synthetic quiet checks did not pass the generated uppercase value through the explicit project flag, so they missed this defect. [Docker project-name constraints and precedence](https://docs.docker.com/compose/how-tos/project-name/).

## Two distinct source identities

Deployed app613/Ops591/profile3a246/enginead5/proofc6f83/accepted archive and backup remain immutable. The accepted image is not rebuilt, loaded again or silently rebound to new Ops.

The future normal restore generator/pattern now uses lowercase timestamp delimiters. Its future-only Ops hash is `4d6269ce7269efe4b99e684f8b5070b85fef9fe77535f356104a60ac31095b31`; only runtime/restore.py changed inside OPS_FILES. This successor is **not** adopted for this recovery or existing deployment. Future ordinary restore guards reject uppercase names.

The one-case operator tool is outside OPS_FILES: `deploy/staging/recover-pre-service-restore.py`, canonical-LF SHA256 **`9236650e13fe20a437283869154e544cb47045950af5682f12d66ad1a299947d`**, published source **`a89997232dd76fda69dd4177d1682e92c405683d`**. Earlier provisional57625/e1f983 tool hashes were not published/applied and are superseded. The tool imports only the byte-verified immutable **old591** contract/restore helpers, and oldc.verify_release checks unchanged trusted bindings/profile/proof. No frozen591 executable, profile, backup, record, root or credential is edited.

Materialize only the reviewed tool and protected exact sidecar at:

```text
/srv/morphiume/staging/runtime/releases/6130f4ed7ec090344a5a4a1937a65ef04572975b/tools/9236650e13fe20a437283869154e544cb47045950af5682f12d66ad1a299947d/
```

Parent directories are root:root0700; recover-pre-service-restore.py is root:root0644 and tool-identity.json root:root0600. Exact sidecar fields are `sourceCommit` (the published tool source), `toolSha256`, `applicationSourceCommit` (613 full SHA), `opsSha256` (old591 full SHA). Its contents must equal the independently trusted CLI values, and public tool bytes must hash correctly. No main-tip lookup, source fetch or tool publication is implicit.

Before any old/helper import, the tool redirects `sys.pycache_prefix` to the exact **nonexistent** `unused-bytecode-cache` child of that protected tool directory and disables bytecode writes. Any existing/link/unknown prefix fails; no old cache is removed. This prevents SourceFileLoader from preferring pre-existing unverified old .pyc, including contract's dynamic verifier/engine imports. All old OPS_FILES are hashed before import; the canonical manifest must equal591. A stale-valid-bytecode test proves the cached payload is bypassed and verified source executes without deleting old cache bytes.

## Preflight and one-shot forward stages

Apply requires the coordinator's released window and specific tool/source/app/backup/profile/fixture dispatch. It pins this exact uppercase physical root, lowercase project and completed backup; no generic legacy normalization is permitted. Every prepared file is root/expected-UID600, single-link, with exact nonsymlink boundary checks. Both directories must remain wholly empty, the prepared top-level set exact, no ready/journal/recovery env/unknown file, no restore container or recovery network, and runtime writers paused. Backup manifest/ciphertext/fixture hashes, actual start record, preserved secret independence/app clone, source sizes/resource headroom and old immutable proof must match before the first exclusive journal is written.

Preflight privately hashes **all** paused source media relative files and byte sizes, bounded by the existing file/count/total limits; its total must equal completed backup mediaBytes. Root separately observed four source files (two originals/two public derivatives),368bytes, matching the backup, and database estimate10,909,375bytes. The retained fixture names only its public derivative. Its strict `/media/UUID.webp` route maps to `public/UUID.webp` and is checked separately; it is not falsely treated as an exhaustive physical inventory. After authenticated decrypt/bounded extraction, every restored private/public file must match the full source map, while public fixture hashes also match. Private names/content remain only in protected state, never shared logs.

Exclusive root600 recovery-journal.json and **new** restore.recovery.env record the lowercase-project→unchanged-uppercase-root mapping. Old restore.env, app/config/password/start bytes remain unchanged; nothing is renamed/regenerated/cleaned. Every mutating step is preceded by an atomic journal stage:

1. compose-validation-started
2. db-initialization-started
3. db-identity-started (fixed limited-owner read-only SELECT)
4. database-restore-started (old single-transaction limited-owner decrypt/restore helper)
5. media-restore-started (bounded extraction/full inventory/public fixture validation)
6. app-start-started (accepted immutable app, no worker)
7. readiness-started (health/container/source/user checks)
8. ready-record-started
9. ready-business-acceptance-pending

No seed, source/schema rollback, original DB write, private-key cleanup, credential rotation, root rename, new physical restore root or automatic resume occurs. Failure records failedAfterPhase and failed-preserved-no-resume. If the restore app might have started, only that restore app is withdrawn; PG/state remain retained. TarError/EOFError are explicitly handled, so malformed/truncated extraction cannot bypass the journal/redacted failure. Existing journal/env/partial state prevents replay; a later recovery requires a new bounded reviewed decision.

## Protected record schema for QA

Completed recovery-journal.json binds all four accepted release identities, old opsSha256, runtimeImageId and engineProofSha256, plus:

- version1, toolSha256/toolSourceCommit, profileSha256, fixtureSha256, backupManifestSha256;
- exact physical root, lowercase project, backup and originalRecoveryStartUtc;
- preparedFileSha256 with exactly app.json, restore.env, recovery-start.json, db_bootstrap_password, db_owner_password, db_app_password;
- ciphertextSha256 for exactly database.dump.age/media.tar.gz.age, identitySha256, and private sourceMediaSha256 mapping relative filenames to `{sha256,bytes}`;
- workerStartedfalse, automaticResumefalse, ordered events `{phase,utc}`, final phase and readyRecordSha256.

The root600 recovery-ready.json contains the same binding state at ready-record-started plus mode restored-ready-business-acceptance-pending, browserOrigin3101, recoveryStartUtc, applicationReadyUtc, backupStartUtc/backupCompleteUtc and mediaSummary. Journal.readyRecordSha256 matches its **exact bytes**. Any failed phase, missing stage, `.new`, wrong tool/source/hash/profile/map or incompatible service state fails QA's gate. Actual six native/business checks remain separately required; ready never means accepted.

Original recoveryStartUtc is preserved exactly from the first failed attempt. Measured RTO must include failure analysis, review/publication and recovery delay through actual native business acceptance; it must not reset at the second invocation. No timing is fabricated here.

## Command only after publication and explicit dispatch

Use this immutable tool with the exact published tool source and privately verified manifest/fixture hashes. The static plan omits --apply; actual apply is still undispatched.

```bash
python3 -B /srv/morphiume/staging/runtime/releases/6130f4ed7ec090344a5a4a1937a65ef04572975b/tools/9236650e13fe20a437283869154e544cb47045950af5682f12d66ad1a299947d/recover-pre-service-restore.py \
  --source 6130f4ed7ec090344a5a4a1937a65ef04572975b \
  --config-id sha256:8a5600eeaafa7de6293aadc2807843f13b269244bb583e4d04e90295adbc1968 \
  --manifest-digest sha256:d5bb24a403247f4d42345bef6c9b7b9788a84962c6f44336167af832e3d5f9be \
  --archive-sha256 d6df8cd57720187fddbc47c279d9df306cc41620d304b270716a87ab196b6cb9 \
  --ops-sha256 591ad92162d1747238db946c9a9a22724edde79627c6995a353c5064b39a77db \
  --profile-sha256 3a246edfcd2b1fa6a6754ec848b479e12e12661a6b00947a9d39cf7821b82a1c \
  --tool-sha256 9236650e13fe20a437283869154e544cb47045950af5682f12d66ad1a299947d \
  --tool-source TRUSTED_PUBLISHED_40HEX_TOOL_SOURCE \
  --fixture-sha256 TRUSTED_PRIVATE_FIXTURE_64HEX \
  --backup-manifest-sha256 TRUSTED_BACKUP_MANIFEST_64HEX \
  --project morphiume-runtime-restore-20261012t212729z-d03c35 \
  --restore-root /srv/morphiume/staging/runtime/restore/morphiume-runtime-restore-20261012T212729Z-d03c35 \
  --backup-directory /srv/morphiume/staging/runtime/backups/20261012T212644Z-fe6ca5ce \
  --identity /dev/shm/morphiume-runtime-restore-bb5ee620fd72/identity \
  --quiescent-window-released --apply
```

## Executed checks and remaining work

Final recovery suite20/20 passed1.682s locally. It covers actual daemon-free explicit-name failure/success, exact case/path/source/tool/prefix/hash/metadata/partial-state guards, stale valid PYC bypass, full read-only preflight and writer/container/network/evidence rejection, full original+derived media versus public fixture, missing/tampered/private/public/traversal cases, ordered one-shot stages, DB/app/TarError/EOFError failures, no replay/rotation and original timing preservation. Root independently passed the earlier18 cases in1.393s before the two extraction-failure cases were added. Python syntax/diff checks pass. Existing engine20, preview22, upgrade9 and runtime15/one Windows symlink skip remain passing; historical Linux/unit checks are separate from this new tool.

The coordinator subsequently published/materialized/applied this exact tool and completed the journal-bound QA harness:6/6 passed, protected result SHA256 `139f916c48f32308894025d002d91f287ff175d3e33549560c29344141aa3498`. Full observed RTO is3333.396461s from the original failed restore start21:27:29.611539Z to business acceptance22:23:03.008Z; the retained-business-fixture-to-writer-free-capture gap is122.003162s. These are staging observations, not PITR/offsite or general recovery guarantees. This agent performed no recovery apply, configuration or database write; later separately authorized transient health measurements and the worker-only stop/local-critical-alert/resume drill are recorded in [post-restore operations](POST_RESTORE_OPERATIONS.md). The drill passed94.640045s with unchanged container identities and healthy recovery. Full scheduled-service validation, timers, load, private-IP activation and live providers remain unexecuted. The command above is historical and must not be replayed against the completed journal.
