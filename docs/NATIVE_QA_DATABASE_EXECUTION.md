# Dedicated native QA database — actual coordinator execution

Recorded 2026-10-13 UTC. This is separate from the backend's preparation-only
runbook and from any application deployment on the private server IP.

The original frozen build83681 native regression completed34/38 in906.599832s.
All10Cart and bothT25 cases passed, while catalog/product-content CSV expected200
and received409 in both engines. Raw response bodies were unavailable; that
historical cause remains unclassified. Original evidence and financial/history/
limiter state are preserved. A later read-only observation found10650 products,
10647 archived, and11 migration records; the count guard would reject a global
product export in that observed state.

The coordinator created `morphiume_staging_qa_7f59c3b1d560aeac` in the existing
guarded PostgreSQL18.6 staging cluster, using new dedicated owner/app roles and
the same reviewed private plan. Actual authenticated role checks passed:
app DML, no app schema/database CREATE, zero role memberships, and no CONNECT,
ownership or object/sequence access to the two preexisting business databases.
Default PUBLIC access to maintenance postgres/template databases is the separate
documented boundary. The original business tables and accepted613 runtime were
not changed by this provisioning.

The first dispatch failed before remote creation because the child OS environment
omitted Windows `ProgramData`. Native OpenSSH exited255; read-only inspection
found no new database/roles/private pending directory. The exact same read-only
bootstrap succeeded with only ProgramData added. The failed exclusive attempt
was retained under the same protected suffix directory before one reviewed
forward dispatch. Credentials and remote Python source remained unchanged;
there was no automatic retry, deletion or password reset. The corrected narrow
environment allowlist retains ProgramData and still excludes app/DB/API/GitHub
secrets. Actual local files use current-user SID plus SYSTEM, with inheritance
removed before credential writes.

Canonical Guide migrations0001–0011 were then applied only to the fresh database,
and the explicitly test-only seed ran there. App-role read-only verification
confirmed11 exact LF checksums,49 public tables and one seeded draft sample
product. Guide runtime config has fresh auth/admin/mock secrets and the app DML
URL; it contains no migration-owner credential. The prior Guide environment is
retained privately. The migration child received its owner URL from the protected
plan, separately from the application. No private values are part of this report.

Same application build83681 runs through canonical `http://localhost:3004`,
server session76753, readiness200. QA owns a new250-file frozen source snapshot
and a complete38-case Chrome/WebKit acceptance window, with original budgets,
zero test retries and real native authentication. The completed run passed38/38
in909.964618s, start01:33:20.090Z/end01:48:30.054Z, with0skip/flaky/test retries,
218 native actions and2579 uncapped log lines with0captured wrapper500s.
All250 source hashes stayed unchanged. The dedicated-only read-only audit found
four owned-fixture counts0 and explicitly released the window at01:51:24.417Z.
Original/runtime database URLs were rejected by that audit. Native/sample data,
financial history and limiter state remain retained; the prior34/38 is separate.

Published main remains5cf; recovery publication, new Linux/image acceptance,
B/C native acceptance, original0012/0013 upgrade, runtime cutover, scheduled
health/backup/timers, private-IP acceptance and capacity200 remain separate work.
