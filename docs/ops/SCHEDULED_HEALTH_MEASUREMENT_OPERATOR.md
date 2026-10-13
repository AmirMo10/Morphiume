# One-shot full scheduled-health companion for accepted app613/Ops591

Prepared locally on2026-10-13. **No SSH, server probe, approval, unit installation/start, backup, timer or credential write was executed.** An earlier QA window release is not this action's GO. The coordinator must separately publish/review these tools and all three drop-ins, provide a freshly reviewed released-window request, and explicitly dispatch execution. Default invocation is a pure unexecuted plan; it creates no file and launches no subprocess.

This companion implements [the full sandbox recipe](FULL_SCHEDULED_HEALTH_PROBE.md), preserving [the accepted recovery and worker drill](POST_RESTORE_OPERATIONS.md). It measures only immutable old591 `scheduled.py health --apply` against accepted app613. Current cart/analytics/notification/QA provisioning source and the future Ops bundle do not inherit app613 image acceptance. Nothing upgrades or adopts them here.

| Prepared source | Responsibility |
| --- | --- |
| `deploy/staging/post-restore/measure-591-health.mjs` | Pure plan, explicit Root/hash/publication gates, private local capture and exactly one strict-alias SSH invocation |
| `deploy/staging/post-restore/measure-591-health-remote.py` | Independent all21-byte/cache bootstrap, preserved eight-identity/recovery checks, health-only disabled unit installation and one measured service start |
| `tests/unit/ops/scheduled-health-measurement.test.mjs` | Pure Node guards plus injected Python runner/files/loader cases; no real SSH/systemctl/Docker/PG |

The tools are outside OPS_FILES. Their canonical-LF SHA256 and published tool source commit are independently supplied; existing deployed Ops591 and all accepted release/config/profile/history records stay bound to their original identities. This document deliberately refers to the existing eight-identity table instead of copying the public profile hash into new exception paths. No Gitleaks exception was changed.

## Before any execution

Root verifies the actual current shared PG/native window is released and reserves this operation; no concurrent native/load/provision/preview/upgrade/backup work is allowed. Prepare a new UUIDv4-lowercase request locally in the coordinator checkout's existing protected `.local/` directory. Review Windows ACLs before explicitly using `--ack-private-acl`; POSIX private input must be singly linked, non-symlink, owned by the operator, mode0600 under a private parent. Do not generate credentials or copy owner URLs into this request.

The request has exactly:

```text
schemaVersion: 1
action: "measure-old591-scheduled-health"
measurementId: <new UUIDv4-lowercase>
rootDispatch: true
sharedDatabaseWindowReleased: true
approvalAction: "create-if-absent"
identity: <all eight exact accepted613/Ops591/proof/profile bindings>
publication:
  toolSourceCommit: <reviewed published tools commit, 40hex>
  configurationSourceCommit: <reviewed published three-drop-in commit, 40hex>
  localToolSha256: <canonical-LF mjs SHA256>
  remoteToolSha256: <canonical-LF py SHA256>
  dropinSha256: <exact three filename→SHA256 pairs below>
evidence:
  acceptanceSha256: <Root-trusted existing recovery-accepted.json raw SHA256>
  remoteResultRawSha256: <Root-derived Python-reserialized remote result raw SHA256>
  resultSemanticSha256: <Root-derived compact/sorted result semantic SHA256>
  localResultRawSha256: <pinned original local result raw SHA256>
  fixtureSha256: <pinned original retained fixture raw SHA256>
  readyRecordSha256: <pinned ready raw SHA256>
  journalSha256: <pinned journal raw SHA256>
  restoreConfigSha256: <pinned canonical restore app config SHA256>
  backupManifestSha256: <pinned original completed backup manifest raw SHA256>
  recoveryToolSourceCommit: <published recovery923 source commit>
```

All fields are explicit and verified against actual protected mappings, not a remote/main HEAD lookup. The local driver also checks its own and the remote source bytes against exact `git show <toolSourceCommit>:<owned-file>` objects, and each drop-in against `<configurationSourceCommit>`. These Git commands are local reads, not fetches. Nothing follows a newer tip or uses arbitrary source/config paths.

Root must independently materialize an exact root-owned0700 tool directory:

```text
/srv/morphiume/staging/runtime/releases/<accepted613 source>/tools/<remoteToolSha256>/
  measure-591-health-remote.py             root:root0644
  operator-tool.json                     root:root0600
  configuration/                        root:root0700
    591-python-cache-guard.conf           root:root0644
    591-health-budget.conf                root:root0644
    591-health-probe-accounting.conf      root:root0644
```

`operator-tool.json` equals the complete request `publication` object plus `applicationSourceCommit` (accepted613) and `opsSha256` (old591). It is an independently reviewed tool-publication binding, not an application deployment record. All ancestors must be real root-owned directories with no group/other write access. The SSH bootstrap verifies the exact remote source file before compiling its bytes; no `.pyc` is used for this companion. It does not transfer/install/materialize anything itself.

| Drop-in | Canonical-LF SHA256 | Exact destination |
| --- | --- | --- |
| `591-python-cache-guard.conf` | `672e07d612751b0ce919d7900ad9c32528256ff7e9c82cfce36374dd67f113f7` | `/etc/systemd/system/morphiume-runtime-health.service.d/10-verified-python-source.conf` |
| `591-health-budget.conf` | `ff3857c5919d36c7b12716d30c72613a6de8b2f580133b378b11fc2a4c1d2234` | `/etc/systemd/system/morphiume-runtime-health.service.d/20-reviewed-operator-budget.conf` |
| `591-health-probe-accounting.conf` | `33c359ca12b9b50f00b6198e01573fc977385a37750f8949681f9531cb798998` | `/run/systemd/system/morphiume-runtime-health.service.d/30-one-shot-probe.conf` |

Old591's base unit must come from the existing byte-verified immutable bundle; canonical SHA256 is `4433c82ded1f43f18c896b4e38c68e9aa640b719d95c58ee5c089cfeb86bfb5d`. Do not copy a future bundle's unit. Existing targets are accepted only if their bytes match exactly; unknown files, aliases/drop-ins, enabled state, old execution or conflicting timer/backup service state stop preparation rather than being overwritten/reset.

## Original and reserialized business-result hashes

Root's accepted marker binds the **original local** result raw SHA256 `139f916c48f32308894025d002d91f287ff175d3e33549560c29344141aa3498`. Root wrote the server `business-acceptance-result.json` with Python `json.dumps(result,sort_keys=True)+'\n'`, so its raw bytes differ. A local-only derivation from the pinned original result produced:

| Evidence | SHA256 |
| --- | --- |
| Remote sorted Python result raw bytes | `3959d85e8649fd7d000597dfadb04c1727d418ce4aacacd88be822ce38dda95a` |
| Compact/sorted semantic result | `3c580ebc205a24abdd6a5a82cc1c83d9aa4ff7782d2306e51d098f91b3703ef4` |

This derivation read only the Root-pinned local JSON and printed hashes/field count; it made no server call or marker rewrite. Root must supply the actual acceptance-marker raw SHA256 separately. The companion checks both transformed raw bytes and semantic fields while retaining the marker's original139 binding. It never equates the server raw hash with139 or normalizes/replaces accepted records.

The strict physical path remains the retained uppercase `.../restore/morphiume-runtime-restore-20261012T212729Z-d03c35`; its Docker project is the separately journal-bound lowercase `morphiume-runtime-restore-20261012t212729z-d03c35`. The old591 scheduled action itself uses its old restore validator. The companion checks the exact physical mapping, completed ready/journal phases, recovery923 source/file binding, fixture/backup/config hashes and all eight identities. It checks the six actual boolean-true business results, restore origin3101/no worker, real time ordering and observed RTO3333.396461s/gap122.003162s. The gap remains the retained-business-fixture-to-writer-free-capture observation, not PITR or general RPO. Preview's distinct origin/fixtureManifestSha256 normalization remains separate and unperformed.

## Guard and mutation sequence under explicit Root GO

The server opens the **existing** protected release lock read-only and takes nonblocking exclusive flock. It creates/truncates no lock file. Before any old helper import it independently hashes every one of21 known OPS_FILES against the protected manifest and old591 aggregate digest; verifies nonsymlink/root ownership/bounds; then rejects the exact recovery923 `unused-bytecode-cache` prefix if it exists, even as a dangling symlink. Only then does it set `sys.pycache_prefix` and `sys.dont_write_bytecode=True` and load old contract source. Dynamic old verifier/engine imports use that same nonexistent prefix; old caches are retained.

Old contract boundaries verify the reserved `/srv/morphiume/postgres` mount and accepted archive/config/manifest/engine proof. Active profile/config mappings must be the existing SSH localhost3100 profile. Protected `deploy.env` must be exactly its three reviewed image/Ops-root/canonical-origin assignments, with no Python override. Runtime pair must be healthy UID1001/immutable image, restore app+DB pair stopped, original PostgreSQL container/network/storage healthy, and fixed loopback readiness200. Docker/containerd must already be active. No daemon is started/restarted; original tables/roles are not queried or rewritten by this companion.

Only after these checks does execution create the exact new root700 `/srv/morphiume/staging/runtime/metrics/scheduled-health-<measurementId>/` directory and root600 exclusive stage journals. Existing measurement directories stop execution. Root's explicit request authorizes exclusive creation of the old-format `schedule-approved.json` **only if absent**, containing the exact eight identities plus mode `quiesce-runtime-only`, current shared-window acknowledgement and exact retained physical `restoreEvidence`. An existing different record fails; nothing replaces it. This old-format acknowledgement is not a perpetual resource lease or authorization to run backup/timers later.

The only installation targets are the disabled/static old health base service, the two persistent health-only drop-ins and runtime-only accounting drop-in listed above. Run `systemd-analyze verify` on that exact service and one daemon-reload. No backup unit, timer, enabled symlink, wildcard install, reset-failed, image build/pull, worker stop/resume or backup is called.

Selected effective properties must prove oneshot/Userroot/UMask0077, unchanged WorkingDirectory/private EnvironmentFile, exact old `scheduled.py health --apply`, both cache exists/link prechecks, two safe Python environment variables and removed Python overrides, NoNewPrivileges, PrivateTmp, ProtectHome=yes, ProtectSystem=strict, CPUQuota100%, MemoryMax256MiB, start50s/stop5s, CPU/MemoryAccounting and journal output. Exact three DropInPaths and disabled/static state are required. Docker/containerd/timer preflight reads only load/active/unit-file state; it does not read their environments. Systemd property formatting/native sandbox/socket behavior still require actual Linux execution; mock fixtures are not that proof.

Then issue **one** `systemctl start morphiume-runtime-health.service`. Observe its cgroup while active, retaining CPU usage, memory peak and OOM events plus the observed InvocationID. Collect final ConditionResult/AssertResult/Result, ExecMainCode/Status and actual monotonic start/exit times. A final cleared InvocationID may use the same ID captured while active; a different cycle is rejected. Private journal retrieval is filtered to that invocation. Raw journal, environment, stderr and config values are never printed publicly.

Acceptance requires a real completed invocation, true condition/assert, result success/exit0, no OOM, positive actual cgroup samples and complete old scheduled health JSON: scope/runtime DB, running/expect-backups, healthy/zero alerts, ready200 and exact image/config/profile. `systemctl start` exit0 or a startup-only/partial JSON is insufficient. Failed/skipped/timeout/unknown evidence remains failed; the same operation never retries or increases its budget. A65s observer ceiling may terminate only the local systemctl client, never issue a service stop/retry; the configured50s+5s service deadlines remain authoritative. Unknown state requires Root review.

After success, independently rehash21/profile/archive/engine, recheck cache absence, unchanged accepted recovery records and same original-container/runtime-container identities/healthy pair/readiness; restore pair stays stopped. Original equality is **container/storage metadata**, not a table digest assertion. The health branch's byte-verified SQL is read-only against the fresh runtime; there is no original DDL, writer-stop, seed/replay or queued-job mutation path in this operator. Normal running worker activity is not mislabeled as table equality. The safe report explicitly keeps `originalTableEqualityMeasured:false`.

## Invocation and evidence

Default, executed locally in tests:

```text
node deploy/staging/post-restore/measure-591-health.mjs
```

Future Root-only dispatch, **not executed here**:

```text
node deploy/staging/post-restore/measure-591-health.mjs --execute
  --request <coordinator-root>/.local/<reviewed-request.json>
  --request-sha256 <raw-private-request-sha256>
  --tool-source <published-reviewed-tool-commit>
  --tool-sha256 <canonical-LF-local-mjs-sha256>
  --remote-sha256 <canonical-LF-remote-py-sha256>
  --ack-private-acl
```

The ACL flag is for an actually reviewed Windows private parent/input. Root must generate/hash this request privately after the new dispatch; no approval/request/credential file was created by this preparation. The driver passes only narrow OS environment variables to Git/SSH, preserving Windows ProgramData (required by the actual native OpenSSH finding) and excluding API/GH/auth/DB/Python/Docker overrides. Host alias is fixed `morphiume-deploy` with BatchMode and strict host-key checking; private request data goes on stdin, never shell arguments.

Before SSH the driver exclusively reserves `.local/scheduled-health-<measurementId>.json` with a pending marker; interruption retains the file. Completion stores private bounded stdout/stderr, exact publication/request binding and the sanitized summary in that reserved file. The remote retains exclusive stage files and `private-evidence.json` root600. Failed evidence and installed disabled files remain for review; no cleanup/resume/reset is automated. Public output contains only allowlisted identity/status/count/duration/digest fields; local and remote evidence hashes bind private captures.

The measured service cgroup includes its Python/helper subprocesses, not Docker/PostgreSQL daemon CPU/RAM, host capacity, process peak RSS or a new recovery objective. Actual elapsed/CPU/peak values remain unavailable. Prior direct-health18.6s and worker drill success remain separate evidence, not completion of the two-proof scheduled action.

## Local checks and remaining gates

Run the dedicated suite explicitly (the repository Vitest include currently selects `.test.ts`):

```text
node --test tests/unit/ops/scheduled-health-measurement.test.mjs
node --check deploy/staging/post-restore/measure-591-health.mjs
node --check tests/unit/ops/scheduled-health-measurement.test.mjs
pnpm exec eslint deploy/staging/post-restore/measure-591-health.mjs tests/unit/ops/scheduled-health-measurement.test.mjs
```

Final local execution passed33/33 Node tests, zero skips, in1006.2124ms; that suite includes18 passing embedded Python pure/mock test methods. Both Node syntax checks, Python AST parse and scoped ESLint exited0. Python AST compilation and the embedded Python tests run with bytecode writes disabled. All OS commands/old loader/file calls in the Python measurement cases are mocks; no real systemctl/Docker/SSH/PG command or old helper import occurred. Mock cases cover all21-byte verification, failed/positive cache-loader ordering, exact approval/case mapping, full-unit completion, failure/no retry, condition/assert/timeout/exit/OOM/missing samples, weaker sandbox/budget/env/command, malformed journal, actual timestamp normalization and six exact booleans. Frozen raw/canonical source hashes are handed off separately to avoid a self-referential document hash.

Publication/materialization, actual Root request/approval creation, full Linux effective-unit/parser/sandbox verification, both-proof50s service cost, post-service actual proof and cadence decision are **unrun**. The proposed five-minute health interval is not configured; the old60s timer remains absent. Manual backup pause/restore assurance, timer installation/activation, private-IP preview, external alerts,200VU/RPS, offsite/PITR and live provider/domain inputs remain separate gates.
