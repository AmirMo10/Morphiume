# Actual E4 isolated restore and business acceptance

Root accepted the rehearsal on2026-10-13 at09:11:27.877614UTC and resumed healthy E4 app/worker at09:11:34.923276UTC. Both the old613 restore pair and the new E4 restore pair remain stopped with their storage/evidence intact. Only the exact temporary RAM recovery key and empty parent were removed. The original database mount was not restored over or deleted.

The source image remains E4 `e4bed691dc938a9c0f79022696d24f063ad97724`, immutable Engine `sha256:3b78dc30dcaa2a6d9b88f913e8bec4002454a0eef7b81ea83a953c5e8a5c2b6d`, Ops68 and SSH3100 profile67f77. See [complete image identities](E4_ACCEPTED_IMAGE_EVIDENCE.md). The separately published restore companion came from `5285643d1497a3c4dc4c7b964712be9bd2ccbe92`, SHA256 `1d9ba53bba5e91fc4a35d34780e5539e9e8ea00a3a1823f96e48ed142b43b558`; immutable21-file Ops68 was unchanged.

| Measured step | Actual evidence |
| --- | --- |
| Retained source fixture | Staged Chromium T25 passed; raw fixture SHA `cea16d8896babf6303e1f29c287dcd4a433f5a6668cda489594e4bf64e27395d`; created08:12:37.704UTC, Root accepted08:38:22.562119UTC |
| Fresh encrypted backup | `20261013T084014Z-8e5fa45e`; capture08:40:14.892826UTC, complete08:40:15.295349UTC; manifest SHA `d3163b5964e4711be35dbdfce9a9f6fe8c786fd2ecd5be48452cae310ebd24d1` |
| Backup availability pause | Verified writers stopped08:40:00.897734UTC, healthy again08:40:21.333207UTC;20.435473seconds |
| Accepted restore operation | `504a38e1-7750-4706-9458-d3a450184a37`; project `morphiume-runtime-restore-20261013t090118z-504a38` |
| Fresh restore namespace | `/srv/morphiume/staging/runtime/restore/morphiume-runtime-restore-20261013t090118z-504a38`; separate PG/app/no worker, loopback3002 and native origin3101 |
| Restore timing | Incident/dispatch09:02:51.486779UTC; source writers stopped09:02:52.600163UTC; fresh restore start09:03:08.541715UTC; application ready09:03:21.659533UTC; driver30.174015seconds |
| Physical media | All8 original/derived files,736bytes, matched the paused source's file/byte/hash map; one retained public WebP also checked by native HTTP |
| Business suite |09:07:27.431–09:07:59.148UTC;6/6 passed in31717.0524ms, suite retry0; OTP send200 and verify200 on first attempts |
| Full rehearsal RTO |516.390835seconds from recorded incident/dispatch to Root acceptance, including preparation and acceptance delay |
| Retained fixture to backup gap |1657.188seconds; this is snapshot age evidence, not demonstrated loss or PITR/RPO |
| Acceptance record | Root600 `recovery-accepted.json`; SHA `74d77bef8e420532fd384880f7f049c86e747d04da58270a1e929b304c8f26e6` |
| Private native result | Raw SHA `3c7fb5acda1dba25c2c50e269fec8ecff6de25ab69804327e3153a346c42a457`; tool source `1fa14264ad378d778a1d7b9e5d9abee1774f1a5c` |

Six checks independently verified fresh native customer login/session, access to the owned order, exactly one deliberate callback replay with unchanged primary receipt/order/payment attempt, one inventory commitment and consumed reservation, shipment tracking, and exact uploaded-media bytes. The harness used real HTTP through Playwright's request context; it did not run another browser UI suite. No mock provider outcome was reset and no limiter/queue/history was cleared.

Root then compared aggregate restored business counts to the stopped-writer backup:13 migrations,7 customers,2 orders,2 receipts,2 shipments, total on-hand14 and reserved0. All matched. This is aggregate and retained-fixture verification, not a claim that every database row was independently compared after restore. [The pre-upgrade49-table preservation check](E4_RUNTIME_CUTOVER_EXECUTION.md) is separate evidence.

The first wrapper rejected real systemd blank separators before stopping writers. The second stopped writers but rejected a raw-versus-canonical interpretation of the old613 config hash; it created no restore namespace and resumed E4. Root corrected both source defects and ran39 pure counterexamples before the accepted operation. The old pair/files were reverified read-only before the next stop. An initial business handoff failed before native activity because Windows PowerShell inherited an incompatible module path; the ACLs were correctly limited. Isolating that child environment passed real ACL validation and105 pure tests; the subsequent native six-check run passed. Every failed precheck and raw result remains private and unchanged.

Current limitations: encrypted backups are local to this host; no offsite destination/key custody, continuous WAL/PITR, real PSP recovery reconciliation or general15-minute RPO has been established. No live payment/SMS data was used. Private-IP preview,200-user capacity/RPS and current-profile scheduled-service acceptance are separate remaining work.
