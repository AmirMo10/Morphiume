# Professional fictional catalog data release

This is a **private staging data/media operation**, separate from the accepted
`32b89e13d31288fe4497f7419e170550baf5b293` application image. Applying this
catalog leaves that deployed image and `/opt/morphiume` unchanged, does not pause
a writer, change a scheduler, migrate, seed or change access/authentication
settings. Normal main CI can still verify/build a new CI image for the content
commit; this native data operation never loads or switches to that CI image.
Only `http://192.168.240.51`, its existing server-only shared preview operator,
the accepted image/profile/capability/site and controlled mock providers are
accepted. The native API still performs MFA, fresh role and transactional
permission checks. The operator supplies `Origin` for the real CSRF guard. No
browser cookie, Basic password, owner credential or capability secret is used.

All six products are fictional. Their names end `(آزمایشی)`, their short/full
copy discloses that they are invented, and image alternatives retain `تصویر
نمونهٔ توسعه؛ تصویر واقعی محصول نیست` plus a fictional/test label. `is_sample`
is manifest metadata, using the deployed app's existing copy-marker convention;
it is not a new database field. All sample numbers and scent stories are demo
content, not claims about merchandise. Generated images must visibly carry
`DEMO CONCEPT`; the coordinator inspects them before approving the final files.

## Finite execution contract

1. Finalize `catalog.json` with the six actual unique WebP files under `media/`.
   `node deploy/staging/demo-catalog/validate.mjs` rejects unfinished hashes,
   small images, wrong dimensions, unsafe paths, missing labels, duplicate SKU
   or imagery and a Toman/IRR mismatch. Width is at least 960, height at least
   1200, each at most1600; no upscale is required for 1024×1536 originals. The
   header validator does not establish successful decoding or photographic
   quality. The actual upload must pass the deployed Sharp decoder/encoder.
2. The coordinator creates one new UUID and a protected operation directory.
   Read the four actual published sample IDs through the normal admin API and
   explicitly approve exactly those IDs. Never identify removal targets by
   wildcard, search prefix or a universal reseed. Review the existing backup
   reference before the operation; do not replay a historical backup command.
3. Invoke the separately hashed `observe.py --observe` through the existing
   strict pinned SSH transport, capturing stdout/stderr privately. Its protected
   stdin is exactly `{operationId, releaseOperationId, request:{path,sha256},
   expectedStateSha256, backup:{directory,manifestSha256,ciphertextSha256}}`.
   `releaseOperationId`/request/journal refer to the completed immutable UI
   release, while `operationId` is the new catalog operation. The helper verifies
   the pinned published UI control and bytecode-cache guards before imports;
   it calls only read-only load/current/protected observers, never release
   dispatch. It rehashes the supplied actual encrypted database/media files,
   requires a checkpoint at most24h old, and verifies all six stopped restores,
   healthy current writers/readiness, timers, reserved mount, owner hashes and
   configuration. `rawFactsBase64` decodes to the exact `rawFactsSha256` bytes;
   save those bytes separately. The returned `observation` has no credentials.
   It is accepted only within five minutes. All other input fields are defined
   by `validateObservation` in `contract.mjs`.
4. Import `createNativeApi` and `createPlan` from `native.mjs`. Supply finalized
   manifest, six keyed asset Buffers, fresh observation, approved four IDs,
   new UUID and `api=createNativeApi()`. The plan uses only GET and requires
   that all currently published products are exactly those four approved
   samples. It rejects any existing collision with the proposed demo slugs/SKU.
   Preserve the actual reviewed plan and its **canonical** `digest(plan)`;
   a raw-file SHA and canonical object digest are different evidence.
5. Use a protected loopback SSH forward and the existing staging **DML** role
   to call `takeSnapshot(pool, sharedOperatorId)` from `snapshot.mjs` before
   native writes. This function opens a read-only repeatable-read transaction,
   requires the exact role/database, rolls back/releases its connection, and
   returns26 table snapshots. Raw values for identity/payment/order tables do
   not leave the reader; only row hashes do. Catalog and initial inventory
   evidence includes exact PostgreSQL JSON text/value bound to its raw hash.
6. Capture a fresh observation immediately before `installCatalog`. Its stable
   protected-state digest must still match the plan. Call with `go` equal to
   the exact application source, exact `planSha256`, manifest/assets, API and
   a protected **exclusive** `writeEvent` callback. That callback must reserve
   the operation on its first record with atomic `wx` creation, then fsync each
   separately exclusive event record. Reject an existing operation marker.
   Do not append to or replay a previously failed or ambiguous operation.
7. The installer makes exactly22 native writes: six media uploads, six draft
   creations with two variants each, six publications and four archives.
   Every write has a prior `write-started` and subsequent `write-returned`
   event. All media decode/encode results and derived bytes are checked first;
   re-encoding means source and derived hashes can differ. All six new products
   must be published and visible before archiving any approved old product.
   Old rows must still match their exact reviewed version and DTO. Archive uses
   the actual optimistic version API; history and media are never deleted.
8. Save the actual `morphiume-demo-catalog-installed` result with six `{key,
   sourceMedia,media,product}` rows and four `{before,after}` archive pairs.
   `media` includes actual native ID/URL/dimensions and derived bytes/hash;
   `product` is the actual published DTO with all twelve variant IDs. The result
   binds manifest, operation, source/profile/capability, operator and event chain.
   This result establishes native install, not independent preservation or QA.
9. Take the same independent snapshot again immediately after installation,
   **before** a test purchase. `verifyPreservation(before,after,result,manifest)`
   requires all preexisting rows in fourteen financial tables unchanged, all
   protected identities unchanged, all catalog unchanged except the four exact
   status/version/timestamp archives, and exactly6products/12variants/12balances/
   12initial-ledger/6media/6images/6slug-claims added. Collections are preserved.
   Neither addition to an order/receipt table nor any deletion is accepted.
   The normal shared preview operator lease, audit/analytics/outbox/rate data
   are explicitly outside this row proof; fresh root runtime/config observations
   and separately scoped purchase evidence establish their stated boundaries.
10. Independently review the six images and storefront/admin at desktop/mobile,
    execute a controlled native purchase against the installed catalog, compare
    its allowed receipt/reservation/stock/tracking deltas separately, and retain
    all evidence. Do not infer a purchase or visual pass from these guards.
    Take a final read-only root observation and close only owned temporary
    client/DB-forward resources. Main must contain the verified manifest/assets/
    tools, with exact remote commit confirmed. Public live sales stay separate.

## Failure or continuation

No automatic retry, rollback, delete, restore-over-primary or universal cleanup
exists. A timeout after a native request is ambiguous; retain the event chain,
inspect the actual native row/media state read-only, and prepare a separately
reviewed finite continuation. Never repeat product/media POST under the same
operation. If a visual/content rollback is needed, review the exact current
versions of the newly created six products and four preserved old products;
the permitted reversible operation is native archive of exact new IDs and
native publish of exact old IDs. Keep all order/inventory/financial history and
photos. Do not change the immutable image/profile/timers to roll back content.

## Actual tool verification

The portable Node guard suite tests the real committed manifest's content using
structural WebP fixtures, the finite22-write order, route agreement with the real
handler, concurrency failure, revoked authority, failed upload/no replay,
preservation and prohibited targets. Python guards test inert observation,
exact paths/new-operation binding, shared pins, actual file rehash and changed
ciphertext rejection. These guard results do not prove a server action,
successful native Sharp decoding, a browser review or a real purchase.

## Actual private installation

The six finalized samples from `420990541325706cd120b98e5bea3fd4b32f22a4`
were installed through the existing native API on 2026-10-19 at13:16:42.958Z.
Exactly four reviewed published QA products were archived. Independent history,
served-image, browser and controlled purchase checks were then executed; the
six demo products remain published. The app image remains32b. See the
[execution record](../../../docs/qa/DEMO_CATALOG_EXECUTION.md) for actual
scope, preserved initial harness failure, final acceptance and limitations.
