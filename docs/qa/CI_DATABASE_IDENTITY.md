# Prepared separate CI database identities

This change is CI source preparation. No local `.env.local`, credential, PostgreSQL service or server configuration was read or changed during implementation. No role was actually created, password generated, migration run or database connection opened by the commerce agent. Genuine PostgreSQL18.6 initialization/grant/authentication evidence must come from the next GitHub job; pure clients below are injected mocks, not database proof.

The previous `ci-config.mjs` assigned bootstrap `morphiume_ci` to both `DATABASE_URL` and `MIGRATION_DATABASE_URL`. That disagreed with the selected canonical notification child, which correctly rejects a privileged runtime identity. The prepared configuration keeps the migration/bootstrap identity and gives the application a separate synthetic `morphiume_ci_app` login. QA confirmed its selected child receives only `DATABASE_URL`; generated-schema construction remains explicitly owner-scoped. No QA fixture guard was weakened.

## Boundary and exported contracts

`createCiSettings({environment,cwd,secret?})` in [ci-config.mjs](../../scripts/ci-config.mjs) checks `CI=true` and `GITHUB_ACTIONS=true` before invoking its generator. On actual CI dispatch, Node crypto generates five independent32-byte/64hex values for app DB password, customer/admin auth, mock control and bootstrap-admin password. Pure tests supply deterministic synthetic values instead. Imports do not generate secrets or write files. The CLI is Linux-only, retains the private configuration with exclusive creation, protects the runner-owned non-symlink `.local` directory and writes `.env.local` mode600. Existing configuration is never overwritten.

The only target is the GitHub fresh PostgreSQL service `127.0.0.1:5432/morphiume_staging`. `MIGRATION_DATABASE_URL` remains the workflow's existing public synthetic bootstrap service URL for `morphiume_ci`. `DATABASE_URL` is the same literal target with role `morphiume_ci_app` and its64hex password. A server/tunnel endpoint, original app identity, deployed-runtime/QA/restore database, owner-as-runtime URL, URI query/fragment/path normalization, live mode or non-mock provider is rejected. No inherited DB URL can replace these configured identities.

[ci-runtime-role.mjs](../../scripts/ci-runtime-role.mjs) exports:

- `validateCiDatabaseConfiguration(settings, environment=process.env)` → `{host,port,database,runtimeRole,migrationRole}`; returns no URL/password and opens no connection.
- `initializeCiRuntimeRole(ownerClient, settings, environment)` → safe phase/target summary; validates fresh owner identity and atomically creates the restricted role/default grants.
- `grantCiRuntimeDml(ownerClient, appClient, settings, environment)` → safe table/sequence counts and authenticated-runtime verification; reapplies allowed existing/default grants, then checks actual app identity.

Its CLI is exactly `node scripts/ci-runtime-role.mjs --phase initialize|grants`. It checks GitHub/Linux/arguments before reading only the CI-generated mode600 singly-linked non-symlink `.env.local` in the working directory. It parses that file without loading environment values, validates the target before creating any driver client, and uses explicit host/port/database/user/password, disabled SSL and empty options. No local operator/native configuration or deployed owner credential is supported. Errors are fixed/redacted; SQL or parameter values are never printed.

## Initialization and grants

Initialize requires actual `current_database=morphiume_staging`, `current_user=session_user=morphiume_ci`, PostgreSQL180006 and bootstrap superuser capability. Public tables/sequences/views must be absent and the exact app role must not exist. It refuses reuse/reset of an existing role or populated target. Within one transaction it creates LOGIN with NOSUPERUSER/NOCREATEDB/NOCREATEROLE/NOINHERIT/NOREPLICATION/NOBYPASSRLS; no memberships are granted. Password utility DDL uses a parameterized transaction-local private setting and PostgreSQL `format(%L)`, then clears the setting; the SQL command text contains no password.

Only this fresh CI target has PUBLIC database/schema privileges revoked. The app receives database CONNECT and public-schema USAGE, without database CREATE/TEMP or schema CREATE. Bootstrap remains owner. Before migrations, schema-specific owner defaults grant app SELECT/INSERT/UPDATE/DELETE for tables and USAGE/SELECT for sequences. There are no global/default grants for unrelated schemas or roles.

After owner migration, grants phase repeats those default commands and grants allowed privileges on existing public tables/sequences. Catalog readback requires bootstrap table/sequence ownership, every required DML privilege, no table TRUNCATE/REFERENCES/TRIGGER/extra app ACL privilege, and no sequence UPDATE. Catalogs are bounded to100 tables and100 sequences. Role readback requires LOGIN, zero memberships and every forbidden role/database/schema capability false. Privilege failures roll back the grant transaction; unexpected capabilities are denied rather than repaired by an ALTER ROLE or password reset.

After the owner transaction commits, the independently authenticated app connection checks actual database, `current_user`, `session_user`, PG version, nonsuperuser state and current role capabilities. A failed app authentication/readback keeps the committed private CI state and fails the job; it does not fabricate rollback or acceptance. Initialization/grants do not seed, migrate, touch business rows, clean queues or automatically retry.

Repeated grants contain no CREATE/ALTER/DROP ROLE. An owner no-op migration preserves defaults; future tables/sequences created by the same bootstrap owner in public receive the same restricted defaults. The pure repeated-command test proves source behavior only; actual grant propagation and permission refresh must be observed in CI. A future different owner, extra privilege or incompatible migration fails readback and needs explicit review.

## Both CI jobs

Root owns workflow/image wiring. The required order for **verify** is configuration → role initialize → `pnpm db:migrate` through `MIGRATION_DATABASE_URL` → grants/readback → seed through app `DATABASE_URL` → domain/build/native/browser work.

For **packaged image**, use the same fresh service initialization, then a separately mounted owner-only migration JSON for the bundled migration. Host grants/readback must complete before the bundled seed. Seed/app/worker share only the app-runtime configuration; their mount arrays must never include the migration JSON. The migration JSON needs only owner DATABASE_URL, mock payment/SMS and disabled analytics. Root reports these source changes and explicit Node suite wiring are implemented; no new workflow execution is claimed here.

Owner-scoped tests must continue passing `MIGRATION_DATABASE_URL` to `createIsolatedDatabase`; its generated schema gets canonical migrations and limited app grants through the owner. A restricted global CI app role does not get schema CREATE to accommodate fixtures. The canonical selected notification child receives the DML URL only; dispatcher/worker use their injected DML pool. Runtime business account roles and native MFA policy are unchanged.

## Actual preparation checks

[ci-runtime-role.test.mjs](../../tests/unit/ops/ci-runtime-role.test.mjs) has39 pure cases: configuration split and nonsecret return; pre-I/O target/environment rejection; no generation before guards; role-create transaction/default commands without password in SQL; existing-state rejection; forbidden capabilities/membership; table/sequence/default readback failure; repeated grants; authenticated app/session substitution; rollback and fixed CLI errors. The clients never connect and all secret-like values are deterministic synthetic inputs.

Initial Windows39/39 passed in266.6589ms, exit0. Source review then corrected the PL/pgSQL block's `END;` terminator and added a guard assertion; no PostgreSQL parser/execution was used. Final Linux Node24.21 passed39/39 in380.855997ms, exit0. Root separately reports its image-config4 plus these39 passing43/43 on Windows in628.113ms. Node syntax checks passed. These results do not claim that SQL executed, that app credentials authenticated, or that either job/image is accepted.

The four assigned paths are frozen for Root integration. Runtime-preservation preparation and deployed/original databases remain untouched. CI workflow wiring, actual service initialization, migration/grant/seed execution, full domain/browser/image acceptance, secret scan, commit and push remain Root-owned. No commerce-agent commit/push or server action occurred.

## Coordinator integration verification

Root completed the workflow order and separate migration/runtime container mount arrays, plus a minimal owner JSON without auth/bootstrap secrets. The four actual image-config CLI counterexamples combine with the39 role cases:43/43 passed Windows628.113ms and Linux Node24.21 wall0.468405136s, both exit0/zero skip. Linux snapshots used the frozen role SHA21b95af211761771d1257a04de6d0606653d3161a2d9666c36b5bccc1cec3b39 (including END;). The Linux tests created only tiny synthetic config files; no PG connection or role/grant/migration occurred. Bash syntax, scoped ESLint and global TypeScript passed. Both pure Node suites are explicit in verify; actual initialization/migration/grant/seed/app/worker still need nextCI.
