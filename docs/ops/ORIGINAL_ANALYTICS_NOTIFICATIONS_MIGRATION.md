# Original schema0011 observation and append-migration contract

## Actual dedicated reference, original still unobserved

On2026-10-13 commerce read only the NEW `morphiume_staging_qa_b625408702be90db` catalog in a repeatable-read/read-only transaction. At `02:37:13.979Z`, PostgreSQL180006/schema13/53 tables yielded20 relevant columns,10 indexes and24 constraints; nine statements including BEGIN/SET/ROLLBACK,271.455ms transaction/close span. No original target, business row, DML, DDL or worker was touched. The raw private prepared reference is protected under ignored `.local/catalog-reference-b625408702be90db/`; accepted source/image remain null. The all-zero nested source is only a local shape-validation placeholder and must never pass an application acceptance gate.

Actual PostgreSQL named the cross-column timestamp CHECK `analytics_daily_check4`; the initial helper's guessed `analytics_daily_last_accepted_at_check` rejected the real catalog. Root corrected that single expected name and added a regression that rejects the old guess;44/44 Node checks passed in788.8845ms. Three local saved-metadata checks passed against the final public helper, without another PG call. Canonical helper SHA256 is `49b0fc6ab478c632132161c548a4934434e4ba0b9295eda7f4029ef5f39abc83`. The actual check4 definition digest is `c7751fadc8b6df068e980fa1e57b054e018ef73f64acd97f6798bdb6a50ee974`.

Canonical13-file migration manifest is `4d4c96b6c3c04e9ee6807d57b419dfe0c7760df13925298754dfeba0957f1119`; source-independent addition catalog digest is `d47ff4a418b25cd530bb066496a1b6ef54606fbde56b9430c78d9d1470cf94e1`. Bind a final reference only after actual published B/C migration/consumer/image bytes match; replacing its placeholder commit requires recomputing both canonical and raw reference hashes. Published52 contains no B/C13 source. This narrow reference preparation does not satisfy original backup, before/after observation, original DDL or activation gates below.

Prepared locally on2026-10-13; **no original database query, DDL, backup, network call or runtime change was executed for this preparation**. The current QA window owns the original `morphiume_staging` database. A released window and a separate explicit coordinator dispatch are required before any observation or cutover. The independently prepared native-QA provisioner can instead isolate later QA in an exact `qa_<16lowerhex>` database; that does not authorize original DDL or substitute for original preservation evidence.

This protocol complements [the application compatibility contract](ANALYTICS_NOTIFICATIONS_UPGRADE.md). Its target is the original `morphiume_staging`/`public` schema0011, not the accepted app613 deployment's separate `morphiume_staging_runtime` database. The runtime backup/recovery, six restored-business checks and immutable Ops591/app613 identities establish evidence for that separate runtime only. They cannot be relabeled as an original-database backup or pre/post comparison.

## Frozen inputs before execution

The coordinator must approve an accepted new app **and worker** image, exact new application source, reviewed future Ops/config/profile and compatible notification consumers. No accepted new image is asserted here. Preserve old deployed Ops591, its release records and app613 proof; this new standalone observation tool sits outside the fixed21-file Ops bundle and has a separately trusted published source commit and raw tool SHA256. Source preparation does not adopt the future Ops bundle or change a deployed profile.

The helper is [upgrade-original-observation.mjs](../../deploy/staging/upgrade-original-observation.mjs). It has no migration, seed, reset, cleanup or service path and never imports `db/migrate.ts`, dotenv, runtime-owner credentials or the native operator loader. Actual SQL execution uses only the original `morphiume_staging_app` role. A separate migration-owner credential is required for the later approved migration action and must stay in its private server-only scope; never export it through native QA/operator configuration or place it in the helper's stdin.

| Append migration | Canonical LF SHA256 |
| --- | --- |
| `0012_anonymous_analytics.sql` | `5ecc599e8f3be2716d64ba360e9c4be96add27a67fb5011fda8a86747c92dfb4` |
| `0013_operator_notifications.sql` | `6c3dc95837f75e2fc0f2cae1309346199663ee3f42483d3ffa9f78813fba2f25` |

The helper embeds all13 exact names and canonical checksums and rejects extra/missing/altered files in its migration directory. It accepts only an exact11-row canonical history before, then an exact13-row history after. Migration0012 deliberately inserts one pristine analytics-coverage singleton; the other three new tables must still be empty at observation. Migration0013 adds five notification columns; all existing rows must remain customer/`legacy.order_update` with null new event/order/permission links before any new consumer starts.

Current source config treats `ANONYMOUS_ANALYTICS_ENABLED` as exact `true`/`false`, defaults it off, and blocks live activation. The separately reviewed future launcher/Ops/parser must agree on the effective flag for app and worker; ambient host flags cannot opt in. This helper's small DML credential config accepts no analytics flag, auth/control secret or unknown field. It observes before activation, not a mixed-writer database.

## Backup and writer-free gates

Release native/load/isolated-PG windows; suspend any actually installed relevant timer under a separate approved recipe. Identify and stop every writer of **the original** logical database, including local native test processes and one-off workers. Stopping only the fresh runtime app/worker does not quiesce the original database. Keep original DB/container/credentials/queue/history and `/srv/morphiume/postgres` unchanged.

Create and independently verify a fresh encrypted original-database/media backup after those writers stop and before actual DDL. Existing `deploy/staging/backup.sh` targets `morphiume_staging` with a custom-format `pg_dump` encrypted directly to age, plus encrypted `/srv/morphiume/staging/media`. Review its exact published bytes, real transport, recipients, completed timestamps, all ciphertext/manifest hashes and absence of partial files before dispatch. Keep plaintext/key material private; do not use the runtime backup directory as an original capture. This preparation did not create or decrypt a backup, prove restore, offsite coverage or PITR.

Record backup logical/physical database identity and the actually observed migration prefix. A backup `source-commit` copied from a deployment marker or server checkout may be app613. It is **not** evidence that the database was most recently exercised by that application source: record the released local QA application's exact source/freeze artifact separately. Do not equate server HEAD, current local WIP, SQL history and accepted consumer image.

The protected cutover gate is an operator attestation following those real checks, not proof manufactured by this helper. It must have precisely these keys:

```json
{
  "schemaVersion": 1,
  "databaseName": "morphiume_staging",
  "acceptedSourceCommit": "<accepted-new-app-40hex>",
  "minimumCompatibleNotificationConsumerSource": "<same-accepted-new-app-40hex>",
  "migrationManifestSha256": "<digest-of-helper-MIGRATIONS>",
  "additionCatalogSha256": "<canonical-digest-of-trusted-addition-catalog>",
  "backupManifestSha256": "<independently-verified-new-original-backup-manifest-64hex>",
  "backupVerified": true,
  "writerFreeCapture": true,
  "writersStopped": true,
  "windowReleased": true,
  "notificationActivationForbidden": true
}
```

## Independent catalog reference

Before original cutover, obtain a separately reviewed reference from a known-good isolated PostgreSQL18 schema that executed the exact accepted13-file source. The reference must use the helper's session settings and exact PostgreSQL patch version; it must **not** be generated by copying the original post-migration observation it will validate. Capture and review exact added column metadata and the index/constraint definition digests, including generated constraint names. The current pure fixture is synthetic and is not this reference. Actual Linux/PG catalog naming, SQL execution and reference capture remain unrun.

`addition-catalog.json` has exact keys `schemaVersion:1`, `sourceCommit`, `migrationManifestSha256`, `serverVersionNum`, `columns`, `indexes`, `constraints`. `sourceCommit` binds the accepted new app and the migration manifest binds all13 canonical files. `columns` contains exactly the four analytics tables and the five new `notification_message` columns; each record has `name`, `position`, `type`, `notNull`, `identity`, `generated`, `collation`, `defaultDigest`. Use original notification positions8–12. Index records have `table`, `name`, `valid`, `ready`, `definitionDigest`; constraint records have `table`, `name`, `type`, `validated`, `deferrable`, `deferred`, `definitionDigest`. Definitions are SHA256 of PostgreSQL's exact `pg_get_indexdef`/`pg_get_constraintdef` output with `search_path=pg_catalog`.

The tool requires the exact10 added indexes and24 added non-not-null constraints, their names/types/validity, and their full definition digests matching the independent reference. PostgreSQL18 not-null constraints are represented by column `notNull` metadata rather than a second catalog-name assumption. The new catalog reference is protected and separately raw-byte SHA-verified; the gate binds its canonical semantic digest. This closes the gap where a weaker constraint with a correct name/checksum could otherwise be accepted.

## Read-only before/after mechanics

The helper starts `REPEATABLE READ READ ONLY`, sets transaction-local15s statement/1s lock timeouts, UTC, ISO dates, stable float formatting and `search_path=pg_catalog`, and always ends with `ROLLBACK`. It verifies exact original database, app/session role, PostgreSQL18 patch version, schema usage and no public-schema CREATE, owner-role membership, superuser, create-role/create-DB, replication or RLS-bypass capability.

Before observation includes47 domain tables plus `schema_migration` and `schema_migration_checksum_audit` =49 public tables. Each table's baseline catalog columns are explicit; row values are serialized and SHA256-hashed **inside PostgreSQL**. Only sorted row-digest multisets, counts and byte bounds leave the query. Row order is immaterial, duplicates remain material. No raw row, default expression, constraint expression, URL, password or auth token is emitted. Protected evidence includes public identifiers and definition digests; stdout is only counts/status/digests. CLI failures use a fixed redacted message.

After observation projects precisely those same old columns. In particular, notification `id,user_id,event_key,title,body,read_at,created_at` excludes the five new fields. It preserves every old-column row multiset/count, original column metadata, old index/constraint definitions and status, table ownership/ACL, public schema/default ACL, sequence definitions/state, and the first11 migration rows including hashed application timestamps. The migration table fingerprint filters only that11-row prefix; checksum-audit rows have no exception. CRLF checksum canonicalization/audit insertion is rejected as a preservation change: resolve any legacy checksum state separately before this cutover, then recapture a new writer-free baseline.

The post snapshot must contain exactly53 tables, preserve the old49 and add exactly the four analytics tables. It checks each new table's owner and effective runtime SELECT/INSERT/UPDATE/DELETE grants, rejects TRUNCATE/REFERENCES/TRIGGER/public grants, verifies canonical new columns/defaults, then compares complete added index/constraint digests to the trusted reference. No assumption is made from `initdb.sh` alone. Old ACL/default-grant changes or original-role owner membership fail acceptance.

Each old table is bounded to100,000 rows,256MiB projected text and2MiB per projected row; oversize evidence fails and requires a reviewed alternative, never a silent sample. Statement timeouts bound individual queries, not the entire cutover; the coordinator must supervise a finite overall observation deadline and preserve any interruption. No whole-phase resource/cost measurement has been executed.

## Operator interface, not an execution dispatch

On the server, provision an exact new `/srv/morphiume/staging/original-upgrades/<UUIDv4-lowercase>/` root-owned0700 directory. All parents must be real root-owned directories with no group/other write permission. Gate, reference and evidence files are root-owned0600, singly linked, non-symlink, at most4MiB; existing before/after output is never overwritten. The tool does not create directories, credentials or approval records. Its CLI requires Linux root; review a bounded read-only observer runner with the accepted image's installed `pg` dependency and exact original DB network before later dispatch.

Private stdin has exactly `schemaVersion:1`, `DEPLOYMENT_ENV:"staging"`, `PAYMENT_PROVIDER:"mock"`, `SMS_PROVIDER:"mock"`, `transport`, `DATABASE_URL`. Only `original-docker` → literal `db:5432/morphiume_staging`, or `original-host-loopback` → literal `127.0.0.1:5433/morphiume_staging`, are allowed with exact `morphiume_staging_app` username. Do not invent current exposure from these source-approved transports; verify the real original transport at dispatch. The connection parser must agree with all literal host/port/user/database fields before connecting. Queries/fragments (including empty delimiters), encoded/normalized database paths, owner URLs, fresh-runtime/restore/QA databases, unknown fields and live providers fail. No environment database URL is inherited. Windows tunnel15433 is deliberately not an accepted CLI transport; credentials stay server-only.

The following is the exact CLI argument contract, **not a command run by this preparation**. Supply real verified values privately; angle-bracket entries are mandatory unknown inputs, not accepted identities.

```text
node <published-immutable-tool>/upgrade-original-observation.mjs
  --phase before
  --source-commit <accepted-new-app-source>
  --tool-source-commit <separately-published-tool-source>
  --tool-sha256 <raw-tool-sha256>
  --migration-dir <verified-accepted-13-file-directory>
  --gate /srv/morphiume/staging/original-upgrades/<UUID>/cutover-gates.json
  --gate-sha256 <raw-gate-sha256>
  --addition-catalog /srv/morphiume/staging/original-upgrades/<UUID>/addition-catalog.json
  --addition-catalog-sha256 <raw-reference-sha256>
  --output /srv/morphiume/staging/original-upgrades/<UUID>/before.json
```

After the **separately authorized** owner-only exact0012/0013 migration, run the same trusted tool and unchanged gate/reference bindings with `--phase after`, output `after.json`, plus `--baseline .../before.json --baseline-sha256 <raw-before-sha256>`. Do not start new writers before post comparison. The two migration transactions can leave a completed0012 and failed0013; preserve that state and backup, leave consumers stopped, repair/roll forward explicitly. A changed migration checksum never becomes an accepted new prefix.

Only after successful post evidence may the coordinator activate the matched new consumers and perform real readiness, customer/operator permission/feed, queued event/replay/read-state, heartbeat/shutdown and native acceptance. Persist a protected compatibility record with accepted source/image/Ops/profile, actual before/after digests, backup binding, minimum compatible consumer and whether any new producer job/operator row was materialized. Once new notifications can exist, app613 customer feed/worker must not resume. A prior image is not a schema/data rollback. Recover by accepted compatible roll-forward or a separately authorized fresh isolated restore; never overwrite original financial/event history.

## Local preparation evidence

The dedicated Node test uses synthetic catalog/row digests and injected clients; it constructs an installed `pg` client solely to check parsing without connecting. It exercises original-only target/owner/URI rejection, exact canonical source hashes, every external gate,49-table legacy projections, old history/schema/ACL/sequence preservation, new grants/columns, independent added-definition comparison, activation rejection and read-only rollback on failures. Run explicitly:

```text
node --test tests/unit/ops/original-upgrade-observation.test.mjs
node --check deploy/staging/upgrade-original-observation.mjs
node --check tests/unit/ops/original-upgrade-observation.test.mjs
pnpm exec eslint deploy/staging/upgrade-original-observation.mjs tests/unit/ops/original-upgrade-observation.test.mjs
```

Actual local execution passed43/43 tests, zero skips, in613.8935ms. Both Node syntax checks and the scoped ESLint command exited0. These are pure/mock preparation results; neither constructing the driver for parsing nor the injected client calls established a real connection. No server/PG/network/native/service/credential action occurred.

The current Vitest include patterns discover `.test.ts`, so this `.test.mjs` suite requires its explicit Node command; no workflow/root runner was changed. Raw frozen file hashes are handed to the coordinator separately to avoid a self-referential document hash. Unrun gates remain accepted new image/config, independent PG18 reference, server runner/transport/path checks, fresh original encrypted backup verification, released-window pre observation, original owner DDL, post observation, new-consumer activation/native acceptance and original isolated restore proof.
