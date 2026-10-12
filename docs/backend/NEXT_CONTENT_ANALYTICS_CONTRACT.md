# Next content, analytics and in-app notification contract

2026-10-12. **Proposed next implementation; no feature in this document is implemented or accepted by writing this plan.** Current application source remains frozen for coordinator/QA acceptance. This task writes only this document: no application/schema/test edits, PostgreSQL/native-auth calls, migration, worker, queue retry or historical rewrite. Implementation requires the coordinator's next checkpoint/start and isolated-test window; public DDL requires its own explicit GO.

Sources: specification product section12, outbox section14, privacy section17, analytics section21; `.agents/skills/morphiume-commerce/SKILL.md` and `morphiume-admin/SKILL.md`; current `src/contracts/commerce.ts`, `src/server/commerce/service.ts`, `src/server/jobs/{service,notifications}.ts`, `src/server/reports.ts`, `src/contracts/reports.ts`, `db/migrations/0006_notification_messages.sql`, `docs/OBSERVABILITY.md`. Operational response/job logs are not analytics or receipt evidence.

## 1. Optional product content, first implementation slice

Extend ProductInput with optional `shortDescription?:string`, `careInstructions?:string`, `approvedWarnings?:string`; ProductDto always returns all three strings. Plain text only, proposed limits600/4000/4000characters respectively; trim ends, reject oversized/nonstring input, escape output rather than accept HTML. Creation defaults to `''`; absent fields on update preserve locked existing values, explicit `''` clears them. Existing full description/gallery/variant behavior and optimistic expectedVersion remain unchanged. Include shortDescription in the normalized search key, with the existing bounded SQL paging/batch query budgets.

Proposed migration0011 adds product text columns `short_description`, `care_instructions`, `approved_warnings`, NOT NULL DEFAULT `''` with matching length constraints. Existing rows acquire only blank optional values, never invented facts. Existing publication requirements remain; optional unknown fields are omitted in storefront display. Product create/update/import dry-run and commit share validation; gallery and new fields save atomically with one product version/audit update. Absent legacy import/update fields preserve content. Paid order snapshots and accepted quote/payment amounts do not change.

Current catalog.write authorization and native admin MFA apply; no new five-minute financial proof requirement. `approvedWarnings` means supplied seller-approved copy, not automated medical/legal approval. No generated allergen/safety/origin/authenticity/permit promises or reassuring default text. Owner-approved factual copy remains an input; empty fields do not block implementation. Packaging measurements are deferred: present flat shipping needs none. A future actual carrier contract would define per-SKU packaged grams/millimetres and measurement validation, rather than invent product weights now.

Coordinator extends strict product request whitelist/import/export/private preview integration; frontend adds bounded Persian controls, retains omitted fields in edits, displays nonblank content, and follows public catalog cache invalidation. Domain acceptance: blank old/create values, absent-update preservation, explicit clearing, nonstring/oversize rejection, stale concurrent update all-or-nothing, import dry-run, public/private DTO round-trip, escaped markup and immutable paid snapshots. No first-party consumer may accidentally clear content by resaving its old ProductInput shape.

## 2. Anonymous observations and authoritative server activity

Proposed separate contracts; neither caller may submit a financial event to the public collector:

```ts
type BrowserAnalyticsInput =
 | { eventId:string; kind:'product_view'; productId:string }
 | { eventId:string; kind:'search'; hasQuery:boolean;
     resultBucket:'zero'|'1_10'|'11_100'|'over_100' }
 | { eventId:string; kind:'add_to_cart'; productId:string };
type AnalyticsCaptureDto = { ok:true };
type AnalyticsPeriodInput = { from?:string; to?:string };
type Count = string; // decimal BIGINT JSON; never a monetary amount
type AnalyticsPeriodDto = {
 period:{fromDate:string;toDate:string;timeZone:'Asia/Tehran'};
 coverage:{observedFrom:string|null;observedTo:string|null;
   retentionDays:number;clientCounts:'advisory';captureEnabled:boolean};
 observed:{productView:Count;search:Count;addToCart:Count;
   zeroResultSearch:Count};
 server:{checkoutStarted:Count;verifiedReceipts:Count;
   primaryPaidOrders:Count;completedOrders:Count};
 cohort:{basis:'orders_started_in_period';asOf:string;
   started:Count;primaryPaid:Count;delivered:Count};
};
```

Methods: `captureBrowserEvent(input):Promise<AnalyticsCaptureDto>` in a separate analytics store; `getObservedPeriod(period)` returns only aggregate counts/coverage to the coordinator's report combiner. Root owns `getAnalytics(actor,input):Promise<AnalyticsPeriodDto>`, financial evidence queries, native authorization and proposed POST `/api/analytics/events` / GET `/api/admin/analytics/period`. Root confirms new contract/module ownership before implementation. Existing financial StoreReportDto remains the money authority; the analytics collector has no money columns or financial mutation method.

Browser semantics: product_view is one successfully rendered canonical product navigation; repeated network delivery uses the same in-memory UUID. search is a completed results interaction, with only a boolean/query-result bucket; add_to_cart fires only after the real cart mutation succeeds. These observations can be blocked, dropped or forged and are not unique visitors, paid purchases or authenticated cart evidence. The client never awaits analytics before browsing/cart/checkout and sends with credentials omitted. No cookie/device/user/session/cart/order ID connects anonymous stages. No raw or hashed query, URL/referrer, IP, user agent, contact, address, token, OTP, request body, amount or provider reference is stored/emitted. No fingerprinting or external analytics library/service is required.

Proposed migration0012: `analytics_seen(event_id UUID PK, fingerprint TEXT, expires_at TIMESTAMPTZ)` stores only a fingerprint of the strict allowlisted payload, not a query/contact hash; `analytics_daily(day DATE,kind TEXT,dimension TEXT,count BIGINT CHECK count>=0, PRIMARY KEY(day,kind,dimension))` stores bounded aggregate/global or public product UUID dimensions; `analytics_quota(minute TIMESTAMPTZ PK,count INTEGER)` bounds total collector cost; `analytics_coverage` records actual activation/retention boundaries. The body/type/UUID/product visibility checks precede recording. Unknown/draft/archived product IDs are uniformly ignored with neutral202, never used to disclose status.

One short collector-only transaction atomically consumes a bounded global quota, inserts unseen UUID/fingerprint and increments its aggregates. Replayed identical UUID never increments again; changed payload under the UUID has no effect/neutral acknowledgement. Counter failure rolls back only collector state. The financial transaction never depends on this insert or worker delivery. Proposed engineering budgets: one event/request,1024bytes,2000events/global minute, max10000public product dimensions/day,24-hour dedup keys,30-day browser aggregates,2-hour quota rows; a product-dimension overflow contributes only to global counts and coverage reports truncation if product breakdown is later exposed. Use a dedicated max2-connection pool, bounded queue50, statement timeout200ms/lock timeout50ms and fail/drop without delaying commerce. These are tunable technical limits requiring load validation, not a measured capacity or legal retention promise. Same-origin/strict body handling and rate response are root-owned; no IP-based analytics database is added. Client abandons failed capture or makes at most one bounded same-UUID retry.

Activation/cleanup must expose actual coverage, not claim whole-period capture. Privacy notice/opt-out and production retention require owner policy; controlled test/staging can exercise this bounded implementation without inventing a production policy. Cleanup deletes only expired collector dedup/quota/aggregate rows in bounded batches, never financial history. Browser dedup is limited to its retained24-hour window, not a global exactly-once guarantee.

| Server event | Authoritative definition and dedup |
|---|---|
| checkout_started | Persisted order.created evidence; one order/key, not quote/page/retry responses. Reuse current report semantics and canonical order-event identity. |
| payment_verified | Each authoritative payment_receipt once; repeat verify/browser callbacks do not add one. Distinct primary/extra/inventory_exception receipts remain distinguishable. |
| order_completed | Durable shipment.delivered evidence once per order; thank-you rendering, paid state, later return/refund or replay does not create completion. |

Period counts use the existing inclusive Tehran calendar-date boundary (`fromDate` midnight through day after `toDate`, UTC storage), maximum366days as in parseReportPeriod. Browser coverage may cover only30days and is explicitly partial. Server cohort selects distinct orders with actual start evidence in the period, then counts that set's primary-paid/delivered members as of the same read snapshot. Extra and inventory-exception receipts are cash but not primary paid orders. Counts from unrelated dates/browser populations are not a visitor-conversion funnel; no view→checkout person-cohort claim can be made without linking people. Any displayed rate retains numerator/denominator, returns unavailable for zero denominator, and uses the bounded server cohort only. A snapshot cutoff makes late completions understandable.

Cash and refund definitions stay in src/server/reports.ts: all verified receipts are gross cash; only dated succeeded refunds reduce cash; pending/processing/failed refunds do not. Primary receipt/refund totals describe purchases, extra/exception receipts remain separate. No second revenue/event-money table, no thank-you-page income, no redating an undated legacy refund via updated_at. Undated/unsupported legacy evidence is reported separately, not assigned invented dates.

Proposed aggregate-only analytics.read permission is owner/product_manager/finance; root confirms this map. Cash/private work queues keep existing owner/finance finance permission. Analytics carries no customer rows, receipt refs or amounts. Auth and final current-role checks surround private report responses; a repeatable-read data snapshot alone must not preserve revoked permissions. No-store on collector/admin responses; no account data in shared cache. Constant count/snapshot queries, no per-event/product N+1; any later product breakdown is PageDto bounded1..100 with explicit dimension/coverage limits.

Acceptance: actual PG same-UUID concurrent insert increments once; changed payload no effect; strict forbidden-field/canary rejection and no raw query hashing; forged checkout/payment/completion rejected at public collector and cannot alter receipts/cash; counter outage/limits leave cart/checkout functional; quota race stays bounded;24-hour expiry has documented behavior; Tehran midnight and partial coverage; cohort zero/late payment/extra/exception/refund semantics; revoked role hides response; query budget and bounded cleanup. Independent HTTP/browser checks prove no credentials/PII sent and failed telemetry does not interrupt purchase. These checks require a new isolated DB window, not current QA's public DB.

## 3. Transactional customer/operator in-app notifications

Current006 table/API is an owned customer inbox with generic controlled test/staging messages and LIMIT100; it has no stored order link/operator permission metadata. Current notifications.ts ignores return/refund/payment-exception event types. Required next implementation adds bounded paged feeds and real source-event routing, not SMS/email delivery.

```ts
type NotificationAudience = 'customer'|'operator';
type NotificationKind = 'legacy.order_update'|'order.created'|'payment.verified'
 | 'shipment.shipped'|'shipment.delivered'|'request.cancel'|'request.return'
 | 'request.approved'|'request.rejected'|'request.received'|'request.closed'
 | 'refund.pending'|'refund.completed'|'refund.failed'
 | 'payment.inventory_exception'|'payment.extra_receipt';
type NotificationPageInput = {page?:number;pageSize?:number;unreadOnly?:boolean};
type InAppNotificationDto = {
 id:string;kind:NotificationKind;title:string;body:string;orderId:string|null;
 createdAt:string;readAt:string|null;
};
// Existing PageDto shape; default1/25, pageSize1..100, deterministic createdAt/id.
listCustomerNotifications(actor,input):Promise<PageDto<InAppNotificationDto>>;
listOperatorNotifications(actor,input):Promise<PageDto<InAppNotificationDto>>;
markNotificationRead(actor,id,audience):Promise<{id:string;readAt:string}>;
dispatchNotificationEvent(eventId:string):Promise<void>;
```

Proposed0013 extends notification_message with audience defaultcustomer, kind defaultlegacy.order_update, nullable order_id FK and required_permission; existing title/body/read state stays untouched. Customer rows require no operator permission; new operator rows require a whitelisted permission. New key is canonical source event UUID + audience + recipient UUID, UNIQUE event_key; no raw provider reference/dedupe key becomes a message key/body. Keep per-recipient ownership; grant an enabled eligible operator no access to another recipient's feed.

| New source event | Customer template | Operator routing |
|---|---|---|
| request.cancel/return, request.approved/rejected/received/closed | Generic owned request update | orders.fulfill |
| refund.pending/completed/failed | Generic owned refund update; failed never says money transferred | refunds.write |
| payment.inventory_exception/extra_receipt | Paid-result needs review; not a fabricated payment failure | refunds.write |
| Existing order.created/payment.verified/shipment states | Generic owned order update | Keep existing customer behavior; no unnecessary operator fanout |

event() must return the actual inserted UUID/inserted flag. New committed events enqueue a notification job in the same business transaction with only `{eventId,orderId}`. Exact business replay adds no event/job. Worker fetches the persisted event/order, verifies type and matching orderId, derives customer orders.user_id and eligible enabled operators from current ROLE_PERMISSIONS. Proposed per-event operator fanout budget500; select at most501 distinct eligible recipients and explicitly retry/escalate an exceeded limit, never silently truncate or mark delivered. Up to501customer/operator inserts use a bounded parameterized batch, not per-recipient queries. Routing never uses supplied recipient/phone/text/amount. Templates are fixed Persian text bounded to160title/500body characters; no reasons, refund evidence, actor/contact, address, tracking code or provider payload appears. Customer links target the owned order; operator links require current object permission again. The current controlled test/staging limitation remains explicit; live copy/activation is a separate verified decision. No external notification, SMTP/SMS claim or marketing-consent inference is made.

Operator selection occurs at delivery, not a stale role snapshot in payload. Read/mark-read rechecks enabled account, live native MFA grant and current required permission after notification-row waits; ordinary inbox access does not add a five-minute finance rule. A revoked operator cannot read retained sensitive rows even if they were previously delivered. New operators do not automatically receive completed historical events; current authorized work queues remain the backlog authority. Customer access stays current verified-phone session plus owner; disabled accounts cannot read. Idempotent read marks keep the first readAt. Private feeds/badges/cache are scoped by user+audience+current permission and no-store;401/403 clears private frontend data.

Cutover must choose one producer per new event. Recommended v2: enqueue `notification.event` for new mapped events and stop producing the three old notification-only order.created/order.paid/shipment.updated jobs after activation; existing pending jobs retain their legacy consumer, completed/dead history is not retried/backfilled. Payment initialize/reconcile queues remain unchanged. Existing payment.exception evidence jobs must not also generate a second customer message; only the canonical source-event job owns new delivery. New worker requires a configured handler for notification.event and must retry rather than silently complete undelivered required messages. Coordinate logger allowlist/worker rollout; older workers cannot safely consume the new type. Stop old worker before deploying this producer/consumer pair; no runtime queue filters or blind public retries. A retry resolves current roles and INSERT ON CONFLICT per-recipient message keys, so committed messages are not duplicated after a crash. No global exactly-once/external-delivery claim.

Root APIs: GET `/api/notifications/page`, existing owned PATCH with explicit customer audience, GET `/api/admin/notifications/page`, PATCH `/api/admin/notifications/[id]`; actor/audience come from distinct native handlers, never client ownership fields. Existing customer array GET/PATCH must immediately filter audience='customer' before operator production is enabled; ownership alone cannot expose an operator message to a customer session on the same user account. Keep the old array route temporarily for small clients only, migrate all first-party readers, then reject an exceeded legacy ceiling rather than silently truncate. Page/count/unread counts share authorization/filter scope in one snapshot; fresh permission verification precedes response, bounded batch data, no N+1. Frontend adds customer order links and role-permitted operator inbox/badge, retains legacy rows with no link, and states in-app/test-only delivery accurately.

Acceptance: business transition+event+job rollback together; exact return/refund/payment replay adds none; crash during a recipient batch or after message commit/before job completion retries without duplicates; customer ownership across two users; role changes before delivery, after delivery, during read/mark lock wait; orphaned/expired admin grant denial; unknown/mismatched source event ignored with no invented message; exception/failed-refund copy never claims transfer/shipment; paged>100 feed and scoped counts; no PII/provider/evidence canaries; canonical legacy consumer/new producer do not double-deliver; old completed/dead queue untouched. Use generated canonical schemas and original public fingerprints in a coordinator-quiescent window.

## Ownership and checkpoints

| Slice | Backend next ownership | Coordinator/frontend integration | Required acceptance before next slice |
|---|---|---|---|
| A product content |0011, commerce DTO/service/import, backend tests/docs | Root strict API/export/cache; FE edit/preview/public content | Targeted PG + affected owned regression, static checks, combined native/browser checkpoint |
| B anonymous analytics |0012 and proposed src/server/commerce/analytics.ts; contract ownership confirmed first | Root reports/analytics DTO/API/auth/roles/pool/runtime; FE bounded emits/count display | Privacy/race/failure/cohort tests, independent HTTP/browser, measured budget; no cash duplicate |
| C in-app routing |0013, domain atomic event/outbox hooks, jobs dispatcher and DTO/backend tests | Root distinct inbox API/auth/logger/worker rollout; FE owned/operator paged UI | Role/ownership/crash/cutover tests, actual worker delivery in isolated controlled runtime, combined acceptance |

Do A only after current verified checkpoint and explicit start, then freeze/build/accept before another DB-model slice. B/C may be reordered by the coordinator after reviewing these exact privacy/role/cutover defaults. Do not turn this plan, blank source fields, logger output, prior browser suite or schema application into evidence of these new capabilities. Owner-approved copy/privacy retention and real SMS/PSP inputs remain genuine inputs; they do not prevent implementing/testing these independent controlled contracts.
