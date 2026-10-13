# E4 catalog source binding and migration compatibility

This is an **offline source/reference handoff**, not database preservation, migration or deployment execution. The coordinator reports accepted E4 source `e4bed691dc938a9c0f79022696d24f063ad97724` and [CI38352565901](https://github.com/AmirMo10/Morphiume/actions/runs/38352565901):837 domain cases,78 verify-native and78 packaged-image-native passed. This task did not rerun CI, inspect image archive bytes, load an image, access credentials, connect to PostgreSQL or SSH, or stop/start any writer. Root subsequently reported actual image-only server loading and the separate engine provenance below; it is not catalog or preservation evidence.

| Accepted artifact reported by coordinator | Identity |
| --- | --- |
| Platform config | `sha256:246b9226db86bf63b37499c2b4a80c2e5e8f62265b3546674de48c480f524665` |
| Manifest | `sha256:dea7a91aa15b8ea653f92d68aee16a168a204f8c0da79a2459e5f748df659c47` |
| Archive | `aed2f8a7b868d32410c55708042dcf945a0491a1f747632df16689e3d072432c` |
| Runtime engine image ID | `sha256:3b78dc30dcaa2a6d9b88f913e8bec4002454a0eef7b81ea83a953c5e8a5c2b6d` |
| Engine proof | `3f1b15a278706ac09be6f644b2042728b1a5ae3cacf3dfb5315181c51de03810` |
| Reported E4 Ops identity | `68bc527a9c34ccefef72bb4427288da47c75c3a584e7cb140ecfc3c3fbdad6a3` |

Root reports image-only loading at `2026-10-13T06:55:27.773769Z`, exit0 in22.078080185s, with exact clean E4 server checkout. Old app613/worker were untouched; no SQL, migration or writer stop occurred. `image-provenance.json` retains that later coordinator-reported result separately from the earlier offline record's null engine fields. No values are inferred from config identity, no earlier catalog capture is relabeled, and no passing backup/window gate is created.

## Source and reference evidence

The saved independent PostgreSQL180006 catalog was actually observed earlier at `2026-10-13T02:37:13.979Z` on the separate dedicated QA database, with53 public tables and13 migrations. Its relevant addition reference contains20 columns,10 indexes and24 constraints. This task read that saved private evidence only; it did not refresh the catalog or treat it as an observation of either deployed runtime or original historical data.

Seventeen catalog-generating/supporting DB files matched **exact raw bytes** across the saved capture, E4 Git blobs and current files: all13 SQL migrations plus `db/migrate.ts`, `db/migration-checksum.ts`, `db/schema.ts` and `db/seed.ts`. Two additional provisioner source files match the recorded canonical-LF hashes; the remote Python file retains the same previously captured Windows CRLF bytes, while its E4 Git blob is LF. Those bytes were not rewritten. This is source-text comparison only—no database migration checksum/history normalization or provisioning execution occurred. The entire old183-file application snapshot is not claimed equal to later E4 application source.

The final capture's reviewed original observer is exactly E4/current SHA256 `49b0fc6ab478c632132161c548a4934434e4ba0b9295eda7f4029ef5f39abc83`. Runtime observer is exactly E4/current SHA256 `9cdf78bd28211c28d1f1365ba4ac69d8b64d27fd560750560cb03b9f7806a615`. The earlier observer with guessed constraint name and its failure remain recorded separately; no pending/history artifact was edited or overwritten.

The new private candidate changes only `reference.sourceCommit` from the unaccepted local placeholder to E4. All captured column/index/constraint metadata remains identical, including actual PostgreSQL18 `analytics_daily_check4`. Its definition digest remains `c7751fadc8b6df068e980fa1e57b054e018ef73f64acd97f6798bdb6a50ee974`.

| Evidence | SHA256 |
| --- | --- |
| Canonical13 migration manifest | `4d4c96b6c3c04e9ee6807d57b419dfe0c7760df13925298754dfeba0957f1119` |
| Source-independent PG180006 addition catalog | `d47ff4a418b25cd530bb066496a1b6ef54606fbde56b9430c78d9d1470cf94e1` |
| New E4 reference raw JSON bytes | `ec92b04adf34e3d9f9c6b19d8f26e7fa6fc0f47effec1e1d669eccd2683c92f0` |
| New E4 reference canonical semantic digest | `d1b313d5291756e74dea9011df45e8e887e7860ce0cc20446f1fc061add4d2a4` |
| Preserved pending-final-reference raw bytes | `860e36a404e3d3bf2868a46169e33d4ef61ac502f10fa5278b7e75314cbbb398` |

The protected ignored directory `.local/e4-catalog-accepted-reference/` contains `addition-catalog.json`, `offline-validation.json`, separate `image-provenance.json` and the offline-only preparation source. It is current-user/SYSTEM-only; it is not a public artifact directory or an execution gate. Existing `.local/catalog-reference-b625408702be90db/` references/HANDOFF remain intact and retain null acceptance fields. The offline lineage record preserves its pre-load null engine state and `deploymentAuthorized=false`; later image-only provenance does not change the reference hashes or authorize migration.

Nine actual offline checks passed in1509.5342ms, exit0: both original and runtime-exported reference validators accept E4; wrong source, wrong PG patch, historic guessed constraint name, missing constraint, extra index and altered column default are rejected; the independent trusted catalog digest detects a changed definition under a valid name. The runtime export deliberately shares the original target-independent validator. These checks do not prove SQL execution, actual runtime preservation or fresh native behavior. Complete index/constraint definitions must match this independently trusted reference during later post comparison; correct names alone are insufficient.

## Schema11 → 13 scope

The only append candidates are:

| Migration | Canonical LF SHA256 |
| --- | --- |
| `0012_anonymous_analytics.sql` | `5ecc599e8f3be2716d64ba360e9c4be96add27a67fb5011fda8a86747c92dfb4` |
| `0013_operator_notifications.sql` | `6c3dc95837f75e2fc0f2cae1309346199663ee3f42483d3ffa9f78813fba2f25` |

0012 adds four analytics tables and one pristine coverage singleton. It does not backfill browser events, financial amounts or order history.0013 adds five notification fields and constraints/indexes; legacy messages stay customer/`legacy.order_update`, with null order/event/permission links. Old notification fields and all financial/order/event/outbox/reservation history must remain equal under the49-table projection; no synthetic cleanup, retry, metadata rewrite or implicit history repair belongs to this upgrade.

The [runtime-only observer](RUNTIME_ANALYTICS_NOTIFICATIONS_MIGRATION.md) must target exactly `morphiume_staging_runtime`/DML `morphiume_runtime_app`, with owner `morphiume_runtime_owner` for a separately authorized migration. The [original observer](ORIGINAL_ANALYTICS_NOTIFICATIONS_MIGRATION.md) remains restricted to its different historical database; its evidence cannot be substituted for runtime evidence. This source-bound catalog is target-independent, but actual identity, grants, prefix, row/catalog/sequence preservation and backup are target-specific.

The engine binding above is now reported available. Before any owner-only0012/0013 action, Root still needs candidate Ops/access-profile agreement with that actual mapping, verified stopped writers and a released window, a fresh completed encrypted backup of the old running release, and a real read-only RR before observation. After explicit migration dispatch, keep writers stopped until a real RR post observation proves exact canonical11→13 history, unchanged old49 projections/ACLs/indexes/constraints/sequence state, pristine new tables and legacy notification fields against this trusted reference. Backup, before/migration/after, writer-stop and preservation steps remain unrun in this handoff. No gate with fabricated/pending hashes or attestations is supplied.

## Consumer compatibility and rollback

Additive schema does not by itself establish old-image operational compatibility. Activation materializes canonical `notification.event` jobs and customer/operator audience rows requiring compatible dispatch and current permission-aware feed access. **Do not roll back/resume app613 or its worker after activation**, even if old columns still exist. The minimum compatible notification consumer must bind the accepted E4 source/image pair; record actual activation/job/row evidence separately.

Do not delete new rows/jobs or reverse financial/event history to make an old consumer appear compatible. Use a separately accepted compatible roll-forward, or an explicitly authorized fresh isolated restore with native/business acceptance. An image rollback does not roll back schema or authoritative payment history. Preservation, matched consumer startup/readiness, old queued-job compatibility, current customer/operator permission/replay/read-state checks, heartbeat/shutdown and post-upgrade native acceptance remain separate real tasks.

Only this new public document and the new protected private reference directory were written. Published observers, DB/schema/migrations/contracts/application source and all prior pending/failure evidence were unchanged. No commit/push or server/database/writer action was performed by the commerce agent.
