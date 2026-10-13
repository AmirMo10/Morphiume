# Analytics Origin correction and unresolved Windows WebKit privacy gate

The independent loopback test reproduces **actual server-received synthetic cookies** in the installed Windows WebKit build despite `credentials: "omit"`. This is not merely Playwright observer reconstruction. Changing to CORS fixes the separate `Origin: null` behavior but does **not** fix cookie omission in this build. The cookie-negative assertion remains failing; native analytics/privacy acceptance is not claimed.

## Scope and controls

`analytics-wire-echo-check.mjs` opens a server on loopback `127.0.0.1:3005`, navigated as `http://localhost:3005`, and fresh Chromium/WebKit contexts. It uses only a clearly synthetic HttpOnly cookie, either added to that fresh context or set by an actual echo-server HTTP response. No page/context routes, proxy, browser flags, auth/native application, Morphiume server, DB, analytics counters or provider are used. The server discards the synthetic event body without retaining it. Output contains request/mode aliases, response status and Cookie/Origin/Referer/Authorization/control **booleans**, never raw headers, cookie values, PII or native credentials.

A credentialed synthetic GET control must carry the cookie in both server records and Playwright `allHeaders`; this confirms the cookie is usable. Anonymous config GET and event POST then use the helper's exact privacy/deadline options. The POST Origin is compared against the fixed current loopback origin; its value is not printed. CORS and actual-helper controls assert canonical Origin first and then unchanged cookie/referrer/authorization/control omission. Browser errors remain forbidden.

| Real loopback control | Chromium server | Installed Windows WebKit server |
|---|---|---|
| Relative URL, same-origin mode, omit/no-referrer | GET/POST cookie absent; POST canonical Origin | GET/POST cookie present; POST null Origin |
| Absolute current-origin URL, same-origin mode | Cookie absent; canonical POST Origin | Cookie present; null POST Origin |
| Absolute current-origin URL, CORS mode | Cookie absent; canonical POST Origin | Cookie present; canonical POST Origin |
| `fetch(new Request(absoluteURL, …))`, CORS | Cookie absent; canonical POST Origin | Cookie present; canonical POST Origin |
| Cookie from actual HTTP Set-Cookie, absolute/CORS | Cookie absent; canonical POST Origin | Cookie present; canonical POST Origin |
| Current actual helper after the Origin correction, HTTP Set-Cookie | Cookie absent; canonical POST Origin, exit0 when selected alone | Cookie present; canonical POST Origin, unchanged privacy assertion exit1 |

Playwright `allHeaders` booleans matched server-received booleans in every completed control. Referer, Authorization and private test-control headers were absent throughout. The Request-object and HTTP-cookie controls exclude those two narrower construction/setup hypotheses. The underlying installed-engine/port cause, Linux behavior and real Safari behavior are **not** established by these Windows tests. Installed package metadata is Playwright 1.64.0, WebKit revision2370/browserVersion27.2.

Primary documentation supports the independent Origin correction: [Fetch's Origin algorithm](https://fetch.spec.whatwg.org/#origin-header) makes non-GET/HEAD, non-CORS requests with no-referrer serialize Origin as null. CORS mode preserves the explicitly shared client origin. [Fetch credentials processing](https://fetch.spec.whatwg.org/#http-network-or-cache-fetch) excludes credentials for omit mode; the measured Windows behavior does not satisfy that expectation. [Playwright request.allHeaders](https://playwright.dev/docs/api/class-request#request-all-headers) documents the complete header object; direct server observation here independently verifies it. [Playwright browser documentation](https://playwright.dev/docs/browsers#webkit) distinguishes its patched WebKit builds from branded Safari and notes platform differences; these results cannot be relabelled as Safari or Linux acceptance.

## Approved source correction

Only `src/components/analytics-client.ts` changes: both fixed `/api/analytics/config` and `/api/analytics/events` paths are now constructed with `new URL(fixedPath, window.location.origin).href`, independent of a document base URL. Mode is `cors`, so the event POST supplies a canonical browser Origin while keeping `credentials: "omit"`, `referrerPolicy: "no-referrer"`, `cache: "no-store"`, `redirect: "error"`, at-most1000ms abort budgets, strict scalar/payload boundaries, cryptographic ephemeral event IDs, no retry/persistence and void/nonblocking capture semantics.

No caller-provided host, URL, Origin/Cookie/header rewrite, UA-based exclusion, XHR workaround, API allow-null rule, auth change or test skip is added. Server/private/commerce code and QA-owned assertions are untouched. This patch fixes only the independently reproduced Origin behavior; it is not a claim that Cookie omission is fixed.

## Executed commands and preserved failures

```text
node docs/frontend/analytics-wire-echo-check.mjs
node docs/frontend/analytics-wire-echo-check.mjs --variant=request-cors
node docs/frontend/analytics-wire-echo-check.mjs --variant=absolute-cors --server-cookie
node docs/frontend/analytics-wire-echo-check.mjs --helper --server-cookie
node docs/frontend/analytics-wire-echo-check.mjs --engine=Chromium --helper --server-cookie
node docs/frontend/analytics-client-check.mjs
node docs/frontend/analytics-events-component-check.mjs
node node_modules/typescript/bin/tsc --noEmit
node node_modules/eslint/bin/eslint.js src/components/analytics-client.ts docs/frontend/analytics-client-check.mjs docs/frontend/analytics-wire-echo-check.mjs --max-warnings 0
```

The default/mode/Request/HTTP-cookie and actual-helper **two-engine** echo commands fail the retained Windows WebKit cookie omission assertion. Both engines pass the CORS canonical-Origin assertion before that failure. The actual-helper Chromium-only command has exit0 with a usable credentialed cookie control, no cookie on anonymous GET/POST and canonical POST Origin. Selecting an engine is an independently scoped control, not a whole cross-browser pass or removal of the default failure.

The initial diagnostic failure lacked per-case output; the next run added only safe booleans before the same assertion. An initial actual-helper observer assertion saw two Playwright records before its third request event was delivered: the server already had three. The fixture now waits for the actual third event as well as the server count before inspecting headers; it does not sleep or weaken privacy assertions. The resulting two-engine run still fails exactly on WebKit cookie omission.

`analytics-client-check` passes SSR/semantic guards plus10 **entirely intercepted** insecure-origin browser modes. Its VM expectations now assert absolute URLs pinned to the fixed window origin and CORS mode while keeping all previous privacy/deadline/no-retry/descriptor/entropy tests. Its intercepted WebKit omission result is explicitly not the un-intercepted transport result above. `analytics-events-component-check` passes13 reported groups: SSR plus six per engine, including view/navigation/volume identity, add success and no failed/stale-actor event, outage/disabled nonblocking purchase and four completed search buckets. These responses remain entirely intercepted. Global TypeScript, scoped ESLint with zero warnings and owned whitespace checks passed. No running-app proof is inferred.

Root's prior focused14 run remains5pass/9fail, zero skip/flaky/retry. Root/QA own the new build and full native rerun; the old compiled run is unchanged by this source patch. The Windows privacy case stays failed pending independent Linux three-engine CI and real Safari proof. Root keeps capture default-off, with explicit test-only activation; frontend does not activate deployment, alter auth/DB/worker, rebuild/restart, commit or push.
