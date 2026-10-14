# Morphiume redesign — execution evidence

2026-10-14. This report separates implemented UI, actual local checks, Figma work, CI and server deployment. The initial baseline was `7055dceb9ade705b386e491f67efb3f8d211fb57`; the running staging application remains ACF8 until a new accepted image is explicitly deployed.

## Implemented and integrated

Real specialist agents delivered brand/design, public storefront and management work under exclusive paths. Root integrated the changes, reviewed behavior and ran native QA. The interface retains Persian RTL, Vazirmatn, original vector branding and exact server money/stock. It adds an editorial homepage, layouts for sparse catalogs, modal search, real note/family filters, mobile drawers, removable filter chips, shared actor-scoped favorites, gallery navigation and purchase progress. Management adds permission-aware grouped navigation, actual server counts, status queues, recent orders with separate payment/shipping states, preliminary publication readiness, inventory facts and improved notes. No migration, live payment/SMS activation or invented business facts were introduced.

## Actual local checks

| Check | Actual result | Scope |
| --- | --- | --- |
| New QA database provisioning | Passed role isolation, runtime DML and denial of original business access | Fresh sixteen-hex-suffix database only; original/runtime business databases were not seeded |
| Canonical migrations and test seed | Passed; 13 migrations | Only the fresh empty QA database; clearly marked draft development sample |
| ESLint and TypeScript | Passed | Integrated source; no dependency changes |
| Unit tests | 641/641 passed, 32 files | Native Linux; not 886 database-backed tests |
| Initial full browser run | 69 passed, 15 failed, zero flaky/skip/retry; 1221.324s reporter duration | 84 cases across Chromium, Firefox and WebKit, on the first compiled redesign |
| Corrected targeted browser run | 18/18 passed across three engines, zero flaky/skip/retry | Final production standalone build; analytics, native collection fallback and two redesign scenarios per engine |
| Final production build and packaging | Passed in 24.34s | Next build, runtime bundles, tracing and standalone preparation; equivalent package-script sequence invoked through Node |
| Standalone runtime readiness | HTTP 200 | Loopback3020, DML-only runtime credentials, controlled PSP/SMS |
| Development StrictMode favorites | 15/15 passed once, 20.92s | Actual Next dev3030, Chromium156, three fresh contexts; guest add/remove and authenticated reader/mutations |
| New deployment guard tests | 37/37 passed | Portable offline fixtures, also added to CI; no server execution |
| Secret scanner | Zero staged findings; existing 20 negative/policy controls passed | Public Figma document ID audit field clarified; no broad exception added |

The initial fifteen browser failures had three verified causes: anonymous analytics was explicitly disabled in this new QA runtime (nine checks correctly refused to proceed), the new mobile collection drawer hid the native no-JavaScript form (three failures), and the new wishlist request-count test used a full page reload where it intended in-app navigation (three failures). Root enabled anonymous capture only in this isolated test runtime, restored progressive enhancement without duplicating forms, and changed the test to use the actual footer navigation. Assertions, native auth/action timeouts, suite budget and zero test retries were preserved. The corrected run also covered the final 160px mobile wordmark, original admin SVG and sparse-catalog styling. The three already-passing management cases were repeated because that layout changed.

The full purchase scenario passed in all three engines during the initial run: native admin creation/publication/upload, guest checkout, OTP, unknown payment recovery, mock server verification, one stock commitment, callback replay, owned order tracking and foreign-order denial. This is an isolated local database run, not new server deployment acceptance.

An earlier unrestricted `vitest run` attempt passed the same 641 unit tests, skipped 245 integration cases without migration credentials, and rejected three integration suites whose guards require their separate canonical fixture database name. Those guards were retained; existing business databases were not substituted. Full database-backed CI is still a separate required result. The first local Next build attempt rejected an external `node_modules` symlink; a physical verified dependency copy fixed the setup. A later pnpm wrapper could not perform its copied-layout freshness subprocess; the full build sequence was therefore invoked directly through Node. Neither setup failure is presented as a passed build.

## Design and accessibility evidence

Native redesign checks used widths320/390/768/1440, Escape/focus restoration, actual search/filter submission including invalid Persian amounts, authenticated shared-reader counts, real management status requests and scoped axe tags through WCAG2.2AA. They passed; axe is automated coverage, not complete accessibility certification.

An independent read-only Chromium156 review used native browser zoom preferences in fresh protected profiles: unchanged outer window780×580, CSS viewport780×493 →390×246 at200%, DPR1→2, CSS zoom1 and pinch scale1. Home/catalog/guide each returned200, retained visible initial Tab focus and had no horizontal overflow or scoped axe violation. Nine additional viewport checks passed. Catalog fixtures changed during that ordinary read-only review; it is not a stable-catalog snapshot. This review preceded the final sparse-grid/wordmark refinements; final widths were checked again by the targeted native scenarios. Physical phones, screen readers and manual GUI zoom were not tested.

Figma contains actual33 variables, six text styles and reusable control families. Its Starter quota stopped full screen composition; known tile geometry issues remain documented. Five local SVG boards and browser previews are editable design references, not app screenshots or finished Figma screen frames. The later browser-tool failure prevented observing the user's current sign-in state. [Actual Figma ledger](../design/FIGMA_REDESIGN.md), [design boards](../design/MORPHIUME_REDESIGN.md), [asset provenance](../../public/brand/editorial/README.md).

## Remaining acceptance

The development check found four authenticated cards shared one initial GET. Four successful favorite mutations and their shared refreshes/remount gave six total GETs; guest controls made no protected wishlist requests. Five native password/MFA/OTP actions returned200 on their first attempts. Four owned products were archived, two owned users disabled, owned sessions zero, and all2801 prior rows in14 financial tables preserved. No purchase was made. The separate development server was then stopped. Root had replaced the new favorite use of a retained lifetime signal with fresh per-operation controllers and actor-unmount cleanup; the existing shared hook was not changed. This is development Chromium evidence, not a physical phone check.

Publishing/CI and accepted-image staging upgrade remain separate acceptance. [Prepared deployment tools and ordered acceptance](../ops/REDESIGN_STAGING_EXECUTION.md) require exact source/config/archive/Engine identities, fresh encrypted backup, preservation evidence, new native purchase, fourth isolated restore and scheduler rebinding. No new capacity, live sales, TLS, offsite/PITR or general RPO is claimed. Real catalog photography, product details and approved business policies remain owner inputs. [Allowlisted local results](redesign-local-safe.json) retain the two browser-run results separately.
