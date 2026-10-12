# Safe HTTP-500 evidence contract

`tests/e2e/sanitize-server-log.mjs` extracts a bounded allowlist from private application logs. It does not call the application, issue native sessions, use PostgreSQL, change limiter state or diagnose a failure from text. Root owns the CI steps that capture runtime logs and upload only these safe outputs.

| CLI source | Private input | Safe output |
| --- | --- | --- |
| `verify-runtime` | `.local/ci-server.log` | `.local/server-failures-verify.json` |
| `image-runtime` | `.local/image-app.log` | `.local/server-failures-image.json` |

Run the appropriate command in the repository workspace, after the runtime's logs exist:

```sh
node tests/e2e/sanitize-server-log.mjs verify-runtime
node tests/e2e/sanitize-server-log.mjs image-runtime
```

The image owner must capture application-container stdout/stderr into the fixed private input before removing the container, including when a browser step fails. Neither the private input nor traces belong in an uploaded artifact. The commands are prepared for root wiring; no new CI execution or original fd74961 server log reconstruction is claimed.

Each accepted event contains only `event: request.completed`, the embedded valid UTC timestamp, a version-4 server request UUID, an exact reviewed route alias, `status: 500` and integer duration from 0 through 3,600,000 ms. Optional `errorCode` is only `INTERNAL`; optional `failureCategory` requires that code and one of `database_deadlock`, `database_serialization`, `database_constraint`, `database_connection`, `database_schema`, `database_timeout`, `unexpected`. An absent/unknown category stays absent; no category is inferred from SQLSTATE, error text or response body. Arbitrary raw routes/queries are rejected, not converted into labels.

The sanitizer independently reconstructs records and discards order/payment correlations, auth and request headers, contacts, error messages/stacks, SQL/SQLSTATE and all unknown fields. It recognizes bare JSON and fixed Docker UTC timestamp prefixes. Malformed, null, array, primitive, unrelated-event and non-500 lines are ignored without echoing their contents. The reviewed alias list includes the application's fixed `api.other` fallback; callers cannot supply a new source alias.

Reads stop after **8 MiB plus one sentinel byte**, with a **16 KiB per-line** validation cap, **50,000 scanned lines** and **1,000 exported events**. A cut final line is discarded. Boolean budget flags distinguish partial extraction. Missing and unreadable input produce fixed states with no path/error disclosure; collected zero events does not prove an unobserved request succeeded or that a truncated log contains no later failure. Safe-output write failures print a fixed message and fail the command.

Local validation on 2026-10-12 used disposable synthetic logs outside the repository and pure parser cases, never shared runtime data: `pnpm exec vitest run tests/unit/shared/server-log-evidence.test.ts` passed **69/69 in 544 ms**, including actual CLI output and a bounded oversized-file read. Scoped ESLint exited 0 for the sanitizer and test. This focused result remains separate from the previous CI's 276/276 total. No native/browser/PG acceptance was rerun during this work.
