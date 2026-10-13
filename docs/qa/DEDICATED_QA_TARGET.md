# Dedicated QA target guard — source preparation

After the 2026-10-13 whole38 run was completed and its original native/PG window released, the coordinator authorized one additional exact database-name class:

`morphiume_staging_qa_[0-9a-f]{16}`

`controlledQaDatabase` now accepts only the two existing decoded names (`morphiume_staging` and `morphiume_staging_runtime`) or that fully anchored lowercase-hex class. The new names remain subject to the same PostgreSQL protocol, `localhost`/`127.0.0.1`, non-live test/staging, mock-payment and mock-SMS requirements. Every query or fragment is rejected, including empty markers and PG host/database/user/options overrides. Raw multiple path segments and normalized dot-segment paths remain rejected. The database identity is decoded exactly once; encoded slash/null, double encoding, uppercase hex, incorrect suffix lengths and lookalike names are denied.

Actual focused verification in the primary checkout: **87/87 pure guard cases passed in 288 ms**, including the prior48 cases and39 new dedicated-name boundary/gate cases. Scoped ESLint and TypeScript passed. This is a targeted result, not an addition to an earlier full-suite count. No HTTP, native authentication, PostgreSQL connection, fixture setup, migration, worker or load call was executed by this preparation.

This name guard is not proof that a database is empty, has the approved app/migration roles, or matches a frozen application source. The coordinator separately owns protected creation, runtime origin/port/role/source binding, app and fixture environment handoff, and explicit execution authorization. App and fixture operations must use the same newly approved logical database through the existing tunnel and canonical origin. No previous database history is deleted, no export cap is raised, and no existing accepted613 runtime or restore guard is changed.

The completed original-database whole38 evidence remains **34 passed / 4 failed**: both catalog and product-content CSV assertions returned409 in both engines. Its full report, private traces and safe server evidence are preserved in the Guide checkout. These failures are not converted to passes by preparing a new target. The new target has not yet been created or tested by QA.
