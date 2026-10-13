# Fresh logical database for native QA

This is prepared tooling, not provisioned infrastructure or native acceptance. The current Guide app and original schema11 remain unchanged. No SSH, Docker, PostgreSQL provisioning, migration, seed, server restart or actual ACL operation was executed while preparing these files.

Repeated `catalog-paging.spec.ts` runs retain 305 archived products each. The complete export counts archived products and rejects totals over10,000; a separate CSV guard rejects escaped UTF-8 output over32MiB. A fresh controlled target avoids deleting preserved fixture/business history or silently increasing these operating bounds.

## Exact scope

For reviewed16 lowercase hexadecimal suffix `0123456789abcdef`, this tool creates only:

- Database `morphiume_staging_qa_0123456789abcdef`.
- Login owner `morphiume_staging_qa_owner_0123456789abcdef` and app `morphiume_staging_qa_app_0123456789abcdef`.
- Local ignored `.local/native-qa/0123456789abcdef/` and server root-only `/etc/morphiume-staging-qa/0123456789abcdef/` records.

The database is on the existing `morphiume-staging-db-1` container. The remote script checks its running/healthy state, exact PostgreSQL18.6 image digest, Compose project/service, `/srv/morphiume/staging/postgres`→`/var/lib/postgresql` bind, PGDATA layout, and exclusively `127.0.0.1:5433` port binding. Bootstrap SQL must actually report `current_user=postgres`, superuser=true, version180006 and recovery=false. No container start/stop/restart, networking change, reserved mount modification, worker operation, queue retry or old table mutation exists in this tool.

Both new roles are LOGIN, NOSUPERUSER, NOCREATEDB, NOCREATEROLE, NOREPLICATION, NOBYPASSRLS and NOINHERIT with zero role memberships. Owner owns the fresh database/public schema. App gets database CONNECT, schema USAGE, owner-default SELECT/INSERT/UPDATE/DELETE, sequence USAGE/SELECT; no schema/database CREATE, TEMP, TRUNCATE, REFERENCES, TRIGGER or sequence UPDATE. New owner functions revoke default PUBLIC execute.

After creation, real TCP password-authenticated owner/app connections must match the expected database/user. A bounded new `native_qa_privilege_probe` table is created as owner; app performs INSERT/SELECT/UPDATE/DELETE with its generated sequence, then checks exact privileges. Only after successful proof does owner remove that new probe table. Failure retains it for review. Canonical migrations and seed are separate coordinator steps, not this probe.

All pre-existing non-template databases other than maintenance `postgres` are checked through read-only catalog/ACL queries: both new roles must lack CONNECT, business table/sequence access and object/schema ownership. This includes the original Morphiume databases. Existing ACLs are never rewritten. If PUBLIC privileges already give the new roles access, setup stops with partial new state retained. PostgreSQL's default PUBLIC access to maintenance `postgres`/template databases is a distinct cluster boundary; NOINHERIT alone does not remove it. This tool does not falsely claim all-cluster CONNECT denial.

## Coordinator dispatch

The Node entry has three modes. A suffix is supplied deliberately; it is never inferred from a credential or existing database.

```powershell
# Default: pure argument validation and sanitized plan; no file/process/network IO.
node db/prepare-native-qa.mjs --suffix 0123456789abcdef

# LOCAL ONLY, later authorized operation by the current Admin user; no SSH/PG.
node db/prepare-native-qa.mjs --prepare --suffix 0123456789abcdef
```

Preparation requires Windows and a new suffix directory. A fixed native call derives the current process user's SID from `WindowsIdentity.GetCurrent().User.Value`, without environment or user-supplied identity. It removes ACL inheritance and verifies only that current SID and SYSTEM SID S-1-5-18 have FullControl; owner must be current SID or SYSTEM. This supports the observed unelevated Admin-user token; it does not require elevation or give access to the entire Administrators group. The existing parent `.local` ACL is left unchanged. Reparse points are rejected. Empty new files are protected before writing credentials. Role passwords are distinct cryptorandom32-byte hex values, stored only in the protected plan. Its private `connections.databaseUrl` and `migrationDatabaseUrl` use loopback15433; `boundary` records test/mock providers and `http://localhost:3004`. The coordinator privately reads them into the Guide app and fixture configuration after native-target guard ownership is updated. Do not print or copy the plan into public reports/artifacts.

After explicit QA-window release and provisioning authorization, review the exact remote Python SHA-256. It is returned by local preparation; pass that same reviewed digest:

```powershell
node db/prepare-native-qa.mjs --execute --plan-file S:\Morphiume\.local\native-qa\0123456789abcdef\plan.json --expected-remote-sha256 REVIEWED_64_LOWERCASE_HEX --quiescent-window-open
```

The local file path is restricted to the exact ignored suffix namespace and ACL-verified before reading. Source must match both the prepared plan and supplied reviewed digest. A new exclusive `attempt.json` is written before SSH, blocking automatic repeat dispatch. SSH uses argv with BatchMode=yes, StrictHostKeyChecking=yes, ConnectTimeout10 and fixed `morphiume-deploy`; script/credentials use private stdin. Passwords/URLs are absent from argv and output. Child environment excludes app/database/provider secrets; error text, SQL and child stderr are never printed.

Remote setup checks existence first: any matching database, role or suffix directory causes rejection, with no reuse/password reset. Root-only pending credentials/state precede role creation. SQL contains SCRAM verifiers instead of cleartext passwords, uses private stdin and suppresses secret-bearing session logging. Fresh database starts with connections disabled, PUBLIC privileges are revoked, reviewed CONNECT grants are installed, then connections are enabled. State advances only after each stage. A real verified result is saved to protected server `evidence.json` and copied to local protected evidence. The coordinator must still independently observe original table/queue/reservation fingerprints using SRE's assigned helper; this tool's readback is privilege evidence, not proof of unchanged row contents.

Any failure, interrupted/unknown SSH result or missing proof requires operator review of protected local attempt and remote pending state. No automatic retry, DROP DATABASE/ROLE, existing role alteration, password reset or recovery is implemented. Do not remove the attempt marker to retry blindly. Preserve partial objects and credentials; choose a different fresh suffix only after explicit disposition of the unknown attempt.

Canonical schema11 migrations/seed for Guide and same-origin native app/fixtures are later explicit coordinator work. B/C may use a separate fresh database with canonical schema13; creating this database does not authorize applying0012/0013 to original public. Published app613/runtime/Ops remain outside the target.

## Prepared validation

`node --test tests/unit/backend/native-qa-provision.test.mjs` exercises pure dry-plan IO denial, strict naming/argv/source binding, memory-only credential lifecycle, no repeated dispatch, safe error output, mocked remote container/preexistence/role/CONNECT/DML checks, partial-state preservation and PowerShell syntax. These controlled mocks do not establish actual ACL efficacy, real role privileges, PostgreSQL compatibility, preserved original fingerprints or native QA acceptance. Actual execution remains pending explicit coordinator dispatch.

Observed preparation checks: final20/20 Node tests passed in1.110407s, with zero failures/skips. Node syntax checks and Python AST parsing passed; the fixed PowerShell ACL checker parsed without executing ACL operations. The earlier17/19-case runs overlap this final suite and are not additional coverage. The coordinator independently observed the current Windows token is unelevated and existing trusted directories use current Admin-user SID+SYSTEM; the helper was corrected accordingly. No actual `--prepare`/`--execute`, private credential file creation, SSH or PostgreSQL command ran during these checks. Vitest's current include glob covers `.test.ts`, so this `.test.mjs` suite requires the explicit Node command; CI wiring remains the coordinator's ownership.
