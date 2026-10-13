# Anonymous observations: slice B source checkpoint

2026-10-13. **The collector store passed its isolated PostgreSQL suite; it is not wired, active or migrated on the original database.** Root explicitly opened the generated-schema-only B/C test window after Cart checkpoint5cf694c5ed97272851ad32685fed3abd5634f005. The root coordinator owns contracts/API/native permission checks/pools/report combination and activation. Current source follows `NEXT_CONTENT_ANALYTICS_CONTRACT.md` section2 and the actual `src/contracts/analytics.ts` DTO; this document does not supersede owner privacy policy or prove capacity. Source preparation and its earlier pending-state results below are retained as history; the final acceptance paragraph is current.

## Exports and integration boundary

`src/server/commerce/analytics.ts` exports:

```ts
type AnalyticsQueryable = Pick<PoolClient, "query">;
type AnalyticsLimits = {
  globalPerMinute?: number; productDimensionsPerDay?: number;
};
createAnalyticsStore({pool, enabled, limits?}: {
  pool: Pool; enabled: () => boolean; limits?: AnalyticsLimits;
});
// Factory methods:
captureBrowserEvent(input: unknown): Promise<AnalyticsCaptureDto>;
getObservedPeriod(q: AnalyticsQueryable, period: ReportPeriod,
  asOfUtc: string): Promise<ObservedAnalyticsPeriodDto>;
cleanupExpired(batchSize?: number): Promise<{
  seenDeleted: number; quotaDeleted: number; dailyDeleted: number;
  expiredRowsPending: boolean;
}>;
// Also exported: parseBrowserAnalyticsInput, AnalyticsStore,
// AnalyticsStoreOptions, AnalyticsCleanupDto.
```

Pool construction belongs to root: a separate `pg.Pool` with `max:2`, short acquisition/network timeout, server-only credentials and no reuse of the financial pool. The factory rejects another pool maximum. Its independent admission gate permits two active operations and fifty waiting operations; queue/acquisition waits expire after200ms. A later acquired client is released after an expired wait. Each collector transaction sets `statement_timeout=200ms` and `lock_timeout=50ms`; these are per-statement bounds, not a measured end-to-end latency. No network/provider/commerce work runs inside this transaction. There is no retry loop. All numerical limits are unmeasured engineering bounds. Internal test limits may only reduce the defaults2000/minute and10000distinct product dimensions/day.

Root supplies a **single repeatable-read client** to the report method. Its first snapshot-acquiring SQL is `SELECT clock_timestamp() AS asOfUtc`, then both observed and authoritative queries use that client/as-of. The observed method performs two SQL statements; it does not open another snapshot, pool or authorization session. An observed aggregate timestamp newer than as-of rejects the report rather than inventing counts for a partially visible daily row. Root checks current enabled native account/session/live MFA grant and `analytics.read` before, and again **outside** the RR snapshot before response. The store exposes no actor/auth bypass. Planned aggregate-only role access is owner/product_manager/finance; no permission-map edit occurred in this slice.

Root future HTTP integration enforces same-origin, one JSON event, maximum1024raw bytes, neutral202 response for parsed valid capture/drop, private/no-store responses and sanitized errors. The parser cannot measure discarded whitespace in a raw HTTP body, so root must enforce that transport bound. Invalid structure throws generic `CommerceError('VALIDATION')`; a valid request receives exactly `{ok:true}` on capture, replay, unknown/withdrawn product, quota/queue drop, disabled setting, timeout or database failure. The acknowledgement is never evidence that a count was accepted. Disabled/misconfigured capture cannot prevent a successful financial mutation. Root live capture defaults off; actual privacy/retention policy remains an owner input.

## Input, storage and atomic effects

Only these plain objects are accepted: product_view/add_to_cart with eventId/productIdUUIDv4, or search with eventIdUUIDv4/hasQueryboolean/resultBucketzero|1_10|11_100|over_100. UUID case is normalized. No extra fields, accessors, symbols, hidden properties, custom prototypes, nested/coercible values or authoritative event names are accepted. No client timestamp is accepted. Strict payload normalization occurs before a fingerprint; SHA256 covers only kind plus public product UUID or finite boolean/bucket, excluding the event nonce. No raw/hashed query, URL/referrer, IP/UA, contact/address, account/session/cart/order, token/OTP, amount or provider reference is stored or logged. These observations cannot link a visitor funnel or establish purchases/revenue.

Migration0012 adds only:

| Table | Purpose and logical retention |
|---|---|
| analytics_seen | UUID nonce, strict-payload fingerprint and expiry;24h dedup |
| analytics_daily | Tehran day/kind/dimension/countBIGINT, first/last accepted server instants, overflow flag;30calendar days inclusive of current day |
| analytics_quota | UTC minute/count1..2000;2h |
| analytics_coverage | Singleton actual first accepted instant and last confirmed cleanup; migration inserts null timestamps |

There are no FKs to catalog, user or finance tables, and no changes/indexes/backfill on existing tables. All runtime values use SQL parameters. Product eligibility uses an ordinary MVCC statement: statuspublished and at least one active variant at that read snapshot. It takes no row/advisory locks shared with catalog or finance. A later withdrawal cannot retrospectively erase an accepted anonymous observation. Missing/draft/archived/inactive-only products uniformly receive the same ack and do not claim a nonce or create a count/activation.

Capture locks a collector-only minute quota row first; parsed replay/unknown requests consume this quota on committed transactions. It next checks visibility, conditionally inserts/reclaims a nonce, optionally locks collector-only day namespace818005, increments global and permitted dimension rows, and records actual activation in one commit. An unexpired nonce with identical **or changed** payload has no counting effect; an expired nonce may be reused even before physical cleanup. SQL failure/overflow rolls back nonce, counters, quota and activation together. This quota bounds committed collector requests; failed DB transactions roll it back. Dedicated admission and timeouts bound failing work separately.

The daily advisory lock serializes new product dimensions across different minute quota rows; it never belongs to a financial/catalog transaction. Across both product event kinds, a day admits at most10000distinct `p:<UUIDv4>` values. Existing admitted dimensions can receive the other kind without consuming a second distinct product slot. Overflow still increments the global event count, skips its product dimension and marks the global row truncated. Search dimensions are limited to eight boolean/bucket combinations. Each kind also has one `all` row. Reports sum only `all` rows for total events and the two finite zero-result search rows for that subset, avoiding dimension double counting. Accepted timestamp minima/maxima remain correct even when collector lock waits reverse request completion order.

The report SQL explicitly excludes all product dimensions and other search buckets; its partial index covers the at-most five relevant rows per retained day (at most150 across30days). A separate collector-only day/dimension index supports bounded distinct product counts. These refinements postdate the Cart compiled artifact: earlier preparation migrationSHA256621660a5e7902da6f155e6daa19a625639f18d76db28e0f9b357c99b79db34ed and storeSHA256a4041d54186e82fbda2025be9283ea174e68a9c488e4cd90de749e07534e7e64 describe that older local source. No Cart native/runtime acceptance applies to either B version. Actual PostgreSQL planner/latency checks remain pending.

## Coverage, cleanup and limits

All counts are nonnegative decimal strings; there is no float/count conversion and no money. `observedFrom/To` are actual first/last retained accepted server timestamps within the requested inclusive Tehran dates, not day placeholders. They are null if no retained accepted rows exist. `retainedFrom` is null before any accepted event; later it is the maximum of actual activation and the logical current30-day cutoff. `partialRetention` signals unknown activation, requested time before this effective boundary, or a requested period ending after snapshot as-of. A setting cannot establish delivery coverage: `captureEnabled` is just configuration, `clientCounts='advisory'`, and `clientDelivery='best_effort_unmeasured'` always. Dimension overflow is explicit.

Cleanup deletes at most1..500expired rows **per table** (seen/quota/daily), with ordered `FOR UPDATE SKIP LOCKED`; no unbounded loop exists. Each invocation records a confirmed transaction timestamp and checks remaining logical expiry. Reports expose `cleanupPending`; a skipped locked row remains pending. Failure/admission drop returns zero confirmed deletions with pendingtrue, without falsely claiming completion. There is no worker/cadence integration yet, and physical retention is not guaranteed by these logical filters. Root must schedule/monitor bounded cleanup before activation and validate backlog behavior at load. The original queues, reservations, receipts, decisions and applied history are untouched. No historical browser backfill/activation timestamp is invented.

Browser emission/root integration is still pending: credentialsomit, no cookies/person correlation, in-memory sameUUID retry at most once, and no awaiting telemetry in product/cart/checkout flows. An all-route private-IP Basic perimeter may401/drop credentialless capture before the application. No Basic secret enters JS, and no bypass or credentialinclude workaround is authorized. Coverage stays best-effort/unmeasured until independently examined; even delivery success cannot make client counts financial authority.

Authoritative checkout/payment/completion/cohort counts remain root-owned from canonical order events, receipts and delivered shipment events in the same RR snapshot. Existing cash/refund evidence remains the financial source; this migration creates no second revenue table. Root/API/FE/native/browser/load/production-policy acceptance is separate from the collector-store checkpoint.

## Actual checks and pending PostgreSQL acceptance

Database-free `tests/unit/backend/analytics.test.ts` passed **30/30 in508ms**. It exercises strict privacy/forged-event rejection before any connection, getter/prototype/coercion handling, bounds/configuration, disabled capture, outage-neutral responses, conservative cleanup failure, report/date validation, late-connection release, two active/fifty waiting admission. Global TypeScript and scoped analytics-store/unit lint passed. These are pure/mocked boundary tests; they are not database, HTTP/native, load or collector-activation evidence.

New `tests/integration/backend/analytics.test.ts` contains **15 prepared PostgreSQL cases, not executed**. It is temporarily gated by `ANONYMOUS_ANALYTICS_PG_TESTS=true` so ordinary discovery during Cart acceptance cannot allocate a schema. It uses the existing guarded canonical-migration isolated-schema harness and a separate max2DML-only collector pool. The harness retains original public queue/reservation fingerprints before/after, so even isolated tests require a coordinator-quiescent original DB window. No public DDL is authorized by this preparation.

Pending cases cover actual constraints/no business FK; null activation; constant-query/global counts; sameUUID deliveries/changed replay; uniform visibility; quota race/replay cost; cross-kind and concurrent product ceilings; logical expired nonce; one RR snapshot; Tehran midnight/logical retention;500-row-per-table cleanup and locked-row backlog; overflow rollback/canary financial immutability; and a real durable checkout while the collector counter is blocked. Admission and short lock limits can legitimately drop race contenders, so tests distinguish neutral acknowledgements from actual accepted rows and use a declared one same-ID follow-up where required. Controlled valid account/grant fixtures prove domain independence, not native MFA issuance. Root must explicitly open the PG window, coordinate/remove the temporary test gate for CI, review new results, and separately authorize0012 public DDL/activation. No measured throughput or full privacy-policy claim is made.

Final source-only checks after the bounded-query refinement: pure suite **30/30 in589ms** (same suite, not added to the earlier30), global TypeScript exit0, scoped store/unit/integration lint exit0. The explicitly disabled integration-gate smoke run reported **15skipped in1.01s**, confirming deferred cases rather than PostgreSQL acceptance. All seven monitored Cart/shared hashes stayed identical; no PG/native/DDL/worker/app call occurred. New source freeze: canonical LF migrationSHA256`5ecc599e8f3be2716d64ba360e9c4be96add27a67fb5011fda8a86747c92dfb4`, storeSHA256`a08e83a73d44feea27761de65b7c89640ab10bfb45c1b4a5bc10fce7214e33cb`. SQL review is source-only: four new tables, collector indexes/checks, one null metadata row, no legacy table alteration, FK, backfill or business DML; parser/planner/execution validation remains queued.

## Actual isolated PostgreSQL acceptance

Explicit root GO after Cart publication: **15/15 passed in32.16s**, session41102/start02:42:45local, exit0. Every prepared case executed with `ANONYMOUS_ANALYTICS_PG_TESTS=true`; no source/test fix was needed. The generated schema used canonical migrations1..13, including0012_anonymous_analytics.sql and prepared0013_operator_notifications.sql. Notification schema preparation in that isolated database does not establish notification producer/API/worker acceptance. Dedicated max2collector, same-ID delivery/replay, strict visibility, quota/dimension bounds, TTL/retention/cleanup, two-query RR snapshot and financial independence all passed. Concurrency acknowledgements remain neutral: accepted rows/counters are asserted, not guessed from HTTP/status. Runtime has no hidden retry; declared one same-ID follow-ups in tests are explicit. No surfaced deadlock failure occurred, but the suite does not instrument every caught telemetry error to certify zero40P01 or measure capacity.

C16 ran sequentially afterward. `tests/integration/backend/observational-baseline.ts` captured a guarded read-only original public snapshot before B and compared it after both cleanups. **All49public table whole-row aggregate digests/counts and public columns/constraints/indexes stayed exactly equal**. This includes financial, receipt, stock, reservation, cart, queue and auth state without outputting row data or credentials. Original migration history remained11/last0011_product_content.sql, digest`ba4effc083f6ad084d17f4ed8b2ed479`; no public0012/0013apply, seed, native app, worker, queue retry or history rewrite occurred. Both isolated harness teardown/original queue-reservation fingerprints passed. The exclusive original DB window was explicitly released after comparison.

Final pure B/C checks on unchanged implementation bytes: **50/50 in863ms across2files** (30analytics+20notification, not additive to previous same unit runs); global TypeScript and all owned new code/helper lint exit0. Root's documented analytics permission/API/auth work is allowed to update its shared files; this backend slice makes no shared Cart behavior change. Gates remain explicit until root coordinates CI activation. Still pending: root authoritative cohort/report/native permissions, collector HTTP/body/origin/no-store integration, frontend credentialless/failure behavior, cleanup cadence/backlog/load/privacy policy, separate public migration GO and actual rollout. No collector-active, native, external-delivery or revenue authority claim follows from this store suite.
