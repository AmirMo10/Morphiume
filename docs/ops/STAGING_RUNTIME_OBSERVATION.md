# Protected runtime bootstrap: actual read-only observation

Observed server time: **2026-10-12 21:23:59 UTC**. This is a single post-bootstrap snapshot, not load, native purchase or recovery acceptance. Coordinator bootstrap was explicitly authorized after release of the original database window; this agent then performed only the dispatched narrow read-only checks. No app/service/container configuration, SQL DML/DDL, credential, Nginx, timer, tunnel, fixture or load mutation was performed by this observation.

**Later coordinator state:** retained Chromium T25 passed1/1 in15.216108s and encrypted backup20261012T212644Z-fe6ca5ce completed. After the diagnosed uppercase project failure, published tool923/sourcea899 completed the [finite recovery](RESTORE_PRE_SERVICE_RECOVERY.md). QA6/6 native/business/media checks passed33.8336788s; the coordinator wrote the protected acceptance marker, stopped the restore pair and removed only the guarded temporary RAM key/directory. Runtime app/worker resumed healthy at2026-10-12T22:31:04.930595Z, readiness200, UID1001, unchanged613 image/591 Ops/3a246 profile. The original snapshot below predates that intentional pause; these later results are coordinator/QA evidence, not another independent server probe by this agent. [Observed RTO3333.396461s and fixture-to-capture gap122.003162s](POST_RESTORE_OPERATIONS.md) include the original restore failure; timers and worker alert drill remain unexecuted.

## Release and profile identity

The coordinator published reviewed Ops source `25e1b197cab6f4cde9b5c409c420bf53fde20d55`, materialized the independent frozen bundle and completed verify-loaded (session7472), fresh preparation (86160), and first deployment (51706), all exit0. These execution results are coordinator observations. This agent independently re-proved the deployed immutable image, verified the protected active profile and checked the clean accepted application checkout and unchanged reserved mount.

| Item | Actual identity |
| --- | --- |
| Accepted application source | `6130f4ed7ec090344a5a4a1937a65ef04572975b` |
| Reviewed runtime Ops SHA256 | `591ad92162d1747238db946c9a9a22724edde79627c6995a353c5064b39a77db` |
| Tested platform config | `sha256:8a5600eeaafa7de6293aadc2807843f13b269244bb583e4d04e90295adbc1968` |
| Accepted registry manifest | `sha256:d5bb24a403247f4d42345bef6c9b7b9788a84962c6f44336167af832e3d5f9be` |
| Accepted archive SHA256 | `d6df8cd57720187fddbc47c279d9df306cc41620d304b270716a87ab196b6cb9` |
| Actual immutable engine run ID | `sha256:ad5c0e3d9537e3380051d32528d2f07b9b804b5c9b73f1df7c2a69cc733a24c0` |
| Engine proof SHA256 | `c6f83e325dcae50f2f84bfac08b874850946f454325ba729bcc38953060bdad7` |
| Active profile / canonical origin | `ssh-localhost` / `http://localhost:3100` |
| Immutable profile SHA256 | `3a246edfcd2b1fa6a6754ec848b479e12e12661a6b00947a9d39cf7821b82a1c` |

Actual profile path:

```text
/srv/morphiume/staging/runtime/releases/6130f4ed7ec090344a5a4a1937a65ef04572975b/profiles/ssh-localhost/3a246edfcd2b1fa6a6754ec848b479e12e12661a6b00947a9d39cf7821b82a1c/profile.json
```

The file is root:root0600 and its protected parent boundaries passed profile verification. `/opt/morphiume` remains clean at613. The separate published Ops source executes from `releases/613.../ops-bundles/591.../ops`; newer cart/UUID/load source is not substituted or covered by613 image acceptance. Historical1b19 bundle/source/records remain preserved. Frozen executable files were not edited during this observation.

## Containers and resource boundaries

| Check | App | Worker |
| --- | --- | --- |
| State / health | Running / healthy | Running / healthy |
| User | `1001:1001` | `1001:1001` |
| Immutable image / accepted source | Exact proven engine ID /613 | Exact proven engine ID /613 |
| Root filesystem | Read-only | Read-only |
| Memory ceiling | 1,610,612,736 bytes (1536MiB) | 402,653,184 bytes (384MiB) |
| CPU ceiling | 1.5 | 0.5 |
| PID ceiling | 128 | 128 |
| Capabilities | DropALL; no added capabilities | DropALL; no added capabilities |
| Security option | `no-new-privileges:true` | `no-new-privileges:true` |
| OOM / restarts | false /0 | false /0 |
| Published port | Only `127.0.0.1:3001` →3000 | None |

The worker heartbeat file in its temporary filesystem was8.67seconds old, owned by UID1001, mode0644. Only stat metadata was returned; no worker logs, job payload or file content was read or printed. Healthy status is Docker's existing readiness/heartbeat result, not a new native authentication or business test. No HTTP/native probe was run by this observation.

Free root/runtime filesystem space was20,781,600,768bytes; Docker filesystem free space38,052,265,984bytes. MemAvailable was4,187,594,752bytes of5,155,532,800bytes; all4,294,963,200swap bytes were free. These are single samples and configured ceilings, not measured200VU/RPS capacity or a recovery guarantee.

The reserved `/srv/morphiume/postgres` still resolves to `/dev/mapper/vg0-lv--2`, ext4. Existing staging PostgreSQL/container/internal network guards passed. No reserved data or original service was relocated or restarted.

## Actual read-only database boundary

`morphiume_staging_runtime` has11 applied migrations and owner `morphiume_runtime_owner`. PUBLIC CONNECT is revoked. Owner schema CREATE istrue; app schema CREATE isfalse. No public table lacks one of the app's expected SELECT/INSERT/UPDATE/DELETE permissions. Both new roles have superuser/createDB/createRole/replication/bypassRLS flagsfalse.

The original integration aggregate exactly equals the protected baseline recorded during preparation:11 migrations,1537 synthetic orders,252 receipts and outbox708completed/818pending/15dead, with the same database identity/owner. Those preserved events are original fixture history, not the fresh runtime worker or new load. The new owner/app roles have zero original table-access, sequence-access and owned-object counts. Their original database CONNECT privileges were bothfalse **in this actual snapshot**; no original grants were rewritten by this observation. This replaces an unmeasured assumption with a bounded observed result and does not claim future grants cannot change.

All three SQL observations used explicit `BEGIN READ ONLY`, statement timeout3s and aggregate/privilege SELECTs through the existing PG container. The first attempt contained an observation-query syntax typo; the read-only transaction failed and no persistent state changed. After correcting it, the consolidated observation exited0. No migration, seed, queue cleanup or fixture command ran.

## Safe operator handoff

Observed server metadata only; contents and values were withheld:

| Server path | Ownership / mode | Operator purpose |
| --- | --- | --- |
| `/etc/morphiume-staging-runtime` | root:root0700 | Private configuration parent |
| `app.json`, `worker.json`, `migration.json` under that parent | `1001:1001`,0600 | Separately scoped runtime secrets |
| `connections.json` | root:root0600 | Dedicated runtime15434 connection handoff |
| `bootstrap.env` | root:root0600 | Authorized initial QA admin setup only |
| `deploy.env`, `active-profile.json`, `deployed-release.json`, `backup-recipients.txt` | root:root0600 | Protected deployment/profile/backup metadata |
| Exact profile file above | root:root0600 | Trusted immutable v2 profile |

Root creates and records ownership/PIDs for the SSH3100 and15434 tunnels separately. App URL stays `http://localhost:3100`; new DB URL selects only `morphiume_staging_runtime`/runtime app on15434, while original15433 remains independent. No tunnel was created or probed here.

For the separately reviewed591ad v2 operator loader, privately copy **only** server app.json→ignored runtime-app.json, connections.json→runtime-connections.json, and the exact profile file→runtime-profile.json. The actual reviewed pairing is `S:/Morphiume-runtime-613/.local/operator-591/runtime/operator-config.mjs` with its three inputs under `S:/Morphiume-runtime-613/.local/operator-591/.local/`; it does not read the QA checkout's top-level `.local`. Preserve that pairing and verify Windows user ACLs before acknowledging them. Use its explicit six identities in order: source/config/registry-manifest/archive/Ops/profile SHA, then `--` and the exact613 QA entrypoint. Old613's v1 loader is incompatible with this profile. Bootstrap credentials may be handled separately for authorized native admin/MFA setup and must not enter ordinary browser/load configuration or public evidence. Never print connection/config values or copy old integration/live keys.

## Remaining acceptance

Root completed the retained3100 T25 fixture, encrypted writer-free backup and isolated3101 six-check business recovery after this snapshot. The lowercase restore project remains bound to its retained uppercase physical directory and completed recovery journal; no replay, data cleanup or implicit successor4d adoption is allowed. Timers, worker-stop/recover alert drill,200VU/RPS, offsite/PITR and private-IP origin/Nginx activation remain unexecuted. [Post-restore operations](POST_RESTORE_OPERATIONS.md) records the accepted marker/timing/resume and the still-gated next recipe. No sales/provider/public-domain readiness is implied.
