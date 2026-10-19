# Professional redesign: independent QA

Date: 2026-10-19. Scope: the local professional redesign specified in [the design contract](../design/PROFESSIONAL_REDESIGN.md). This report separates observed execution from prepared checks. It does not establish a new deployment on `192.168.240.51`.

Local affected-view acceptance is complete. The two proven responsive defects were corrected and verified on the coordinator's fourth optimized build. Earlier failures remain recorded below, and five native commerce/UI cases are explicitly attributed to their earlier build.

## Existing native scenarios

The coordinator ran the five existing Chromium scenarios once against the first optimized professional redesign build and a fresh isolated PostgreSQL database. The independent QA reviewer read the raw Playwright report: five passed, no skipped, unexpected, flaky or retried cases and no recorded case errors. Report duration was 76.895 seconds; the coordinator's wrapper recorded exit 0 and approximately 77.74 seconds.

| Existing scenario | Actual status | Case duration |
| --- | --- | ---: |
| Product creation through native admin, guest purchase, mock payment verification, stock and owned tracking | Passed | 31.428 s |
| Storefront search, mobile filters, focus and responsive accessibility | Passed | 14.081 s |
| Actual management counts, queues and mobile navigation | Passed | 7.477 s |
| Search continuity, native favorites, original media and truthful error state | Passed | 12.915 s |
| Bounded admin navigation, table actions and preserved filters | Passed | 9.019 s |

Raw report SHA-256: `4e3d167c8d61f9eef9e806f8cb960cc34239c1439de765d84016747cd1ea8180`, under the protected ignored directory `.local/professional-20261019-root/tests-17319ca8-9a83-4377-84a9-f94e80faa571/`. Raw screenshots and reports remain private because native authentication and synthetic customer/order data can appear in them.

These five cases precede subsequent visual corrections to the default Persian hero line break, redundant desktop brand mark, catalog spacing and responsive layout. They must not be described as tests of a later build. The captured dashboard still showed loading placeholders; it is evidence of that loading state, not of the completed dashboard composition.

## Independent visual observation

The first independent observer ran once against the optimized build containing the final hero/wordmark corrections. Chrome reported version `155.0.8059.81`. Its child and wrapper both exited 1; wrapper duration was 119.985 seconds. The original failure and raw outputs remain intact.

Sixteen viewport screenshots completed at 1440 and 390 pixels. Ten included axe runs with zero violations in the selected WCAG tags; none of the sixteen overflowed the document. Actual published-product baseline was zero. The one/two/four-product cases matched their exact expected counts at both widths. Home cards stayed 302 pixels wide on desktop and 173 pixels wide at 390, without stretching a lone product. At 1440, the joined cover measured 1280×510 pixels with 80-pixel outer margins, 54-pixel title text and the catalog heading starting at y843.97. The reviewer inspected actual desktop/mobile home and sample catalog pixels.

The observer stopped at its first product navigation: `page.goto` exceeded the unchanged 30-second deadline while waiting for `networkidle`. No product-detail, loaded admin, keyboard, reduced-motion or remaining responsive coverage is claimed for that failed invocation. Structured server logs showed successful client initialization and an accepted product-view analytics event during this window, but they do not identify the request responsible for the timeout. No console or page error was recorded before the stop.

Cleanup archived its four owned synthetic products, disabled its one native MFA account and revoked that account's sessions. A read-only before/after comparison preserved all 28 preexisting rows across fourteen financial tables. It retained financial history.

Raw observations SHA-256: `45f864d98b5c35b85bb4e4342d7f645495ff83b07066cac8ac5420a02597127a`; error SHA-256: `90debe49f221e78ec5005cdeb0652ee3efe068790ded74c02d2438bb45849cd5`, in `.local/professional-20261019-qa/actual-fb37b931-708f-4407-9414-aaf6032881f2/`.

The bounded observer uses the installed Chrome through Playwright 1.64.0 and pinned Node 24.21.0. It rejects any target except the fresh local test database on port 15439 and `http://localhost:3095`, with mock SMS/payment providers. Its default invocation is blocked and performed no browser or database action during preparation.

The remainder covered 1440, 768, 390 and 320 CSS-pixel layouts; a 640×500 reflow equivalent for a 1280×1000 viewport at 200%; explicit keyboard skip/search and deep admin navigation; reduced-motion computation; WCAG-tagged axe checks; completed dashboard data and bounds; public product detail; and native permitted/restricted roles. Its products and native MFA accounts belonged solely to the observer and were archived/disabled after capture, preserving existing financial history.

The coordinator approved one finite remainder operation, without replaying the one/two/four-product checks. Its navigation method retained the 30-second navigation deadline and asserted actual rendered state: the API-returned product slug, exact title, decoded original media, enabled purchase control and completed admin data. It additionally recorded request completion/failure and in-flight requests. Playwright's [primary `page.goto` documentation](https://playwright.dev/docs/api/class-page#page-goto-option-wait-until) discourages `networkidle` in favor of readiness assertions. This method change is not proof of the original timeout's cause.

### Remainder against the catalog-spacing build

The coordinator first compacted the catalog introduction and combined the results' clear-filter action with the active chips. The independent remainder then ran once against that optimized build. It completed all 41 planned captures, including the affected catalog header at 1440/390/320, but correctly returned exit 1 because the 320-pixel admin editor overflowed by four pixels. Child duration was 116.472 seconds; wrapper duration was 170.477 seconds. There was no blanket visual pass.

| Observation | Actual result |
| --- | --- |
| Layouts | 1440×1000, 768×900, 390×900, 320×900; 640×500 reflow equivalent |
| Axe | 41 runs; zero violations in the selected WCAG tags |
| Document overflow | Forty captures clear; 320 admin editor measured 324-pixel document width in a 320-pixel viewport |
| Console / page errors | Zero recorded |
| Product detail | Actual original sample SVG decoded, supplied URL/alt preserved, exact mixed Persian/Latin title and enabled purchase button asserted |
| Keyboard | Skip link reached and activated at 1440/390; search input focus, dialog containment and Escape restoration passed at both widths |
| Deep admin menu | Current link initially focused; internal scrolling, visible toggle and Escape restoration passed at 390/320/640 |
| Reduced motion | All five contexts matched `reduce`; no running animations and sampled transitions were `0s` |
| Native roles | Separate native password/MFA owner and support accounts; support catalog API returned 403 and the forbidden navigation link was absent |
| Missing image / order | Actual unsaved empty-image preview and existing synthetic order detail captured |
| Cleanup | One owned product archived; two owned admins disabled with their sessions revoked; all 36 preexisting financial rows across fourteen tables preserved |

The loaded 1440 dashboard showed actual counts and the paid order from the existing native purchase. Its main bounds and computed 32-pixel gutters were recorded; the table wrapper began at y619.36, with the working row visible within the first 1000 pixels. The reviewer inspected actual desktop dashboard, tablet home, mobile product/catalog and deep-menu pixels. Session identity is covered with a neutral privacy mask in screenshots, not removed from the interface.

Raw observations SHA-256: `3c733a55e878598e543bef3baab464b180f41c402416e98c40601d4b09ea7e1e`, under `.local/professional-20261019-qa/remainder-20bff509-88c1-4f2a-b3e6-42e0d69aa08d/`.

Request diagnostics retained 1,623 lifecycle events, including 548 `net::ERR_ABORTED` requests, mostly document-route requests during navigation. They recorded no HTTP error response in those browser events. Neither those cancellations nor subsequent successful rendered-state assertions establish the original timeout's cause; network quiescence is not claimed.

### Concrete defects and diagnosis

Pixel review found the 768-pixel split cover leaving the final title word alone on a third line. Separately, the 320 admin editor had four pixels of real document overflow.

A first narrow diagnostic failed locally before opening a database client or browser because its fixture selector incorrectly expected API-client PATCH calls in page request events. That failed operation remains preserved; it is not an application failure. The corrected new operation bound the prior raw observation hash and its unique own document slug, verified the archived synthetic product read-only and opened only that editor and an unsaved new editor with one new native MFA admin.

Both forms identified the same actual culprit: `.admin-session` remained 84 pixels wide with `flex: 0 0 auto` while `.admin-topbar-end` shrank to about 64.5 pixels. The session extended to x−3.516 on the existing editor and x−3.078 on the new form. The main itself stayed correctly within 0–320 with 16-pixel gutters. The diagnostic recorded tag/class/rect/computed layout and parent bounds, without input values or credentials. It disabled its one account, revoked its sessions and preserved all 38 preexisting rows in fourteen financial tables; it made no product or order change.

Diagnostic SHA-256: `f799fda3d981e2fd84f233d8042b4a64debb34ad7d69ca7777a4f61aa47ca335`, under `.local/professional-20261019-qa/diagnosis-e077cd6e-df75-47b4-96a1-8720007df756/`.

### Final affected-view acceptance

The coordinator reserved the mobile session group's width, let the breadcrumb group flex and stacked the joined cover through 1023 pixels. A fresh optimized build completed before a separate, authorized seven-view acceptance. This operation did not replay the 41 prior views or create another product. It used one new native MFA admin and read only the previously archived owned fixture and an unsaved new form.

Actual child exit was 0 in 26.087 seconds; wrapper exit was 0 in 39.793 seconds. All seven axe runs had zero selected-WCAG violations, with no console/page errors. Every document matched its viewport width exactly. Computed HTML/body horizontal overflow remained `visible`, so clipping did not conceal the defect.

| Final affected view | Actual result |
| --- | --- |
| Home, 768 and 1023 | Copy sits above art; actual text ranges measure two title lines; conceptual-image caption remains present; document widths 768 and 1023 |
| Archived editor and unsaved new form, 320 | Both document widths 320; session and end group x16–100, width 84; breadcrumb x112–248; toggle x260–304, width 44 |
| Archived editor and unsaved new form, 390 | Both document widths 390; session and end group x16–128, width 112; toggle remains within viewport |
| Deep settings menu, 320 | Internally scrolling 612-pixel menu in a 900-pixel viewport; current-link focus, visible 44-pixel toggle and Escape restoration passed |

The reviewer also viewed the final 768/1023 home and 320/390 editor screenshots. Both previously proven defects are resolved in those actual pixels and measurements. The synthetic admin was disabled and its sessions revoked. All 38 preexisting rows in fourteen financial tables remained unchanged; no product or order was changed.

Raw acceptance SHA-256: `0bf6a0ea63bce665cf98d29531f48ba51d75fa220a86dfad39d182a4dd1ce1c7`; process record SHA-256: `b862da5a8ff3bb177b9709891e8ad6a6d5a92a8035cd8ba0c84bc2edac22a612`, under `.local/professional-20261019-qa/final-4fd572f2-a8e2-4589-8051-dad7825309f9/`. Original failed records and screenshots were not overwritten.

Actual browser zoom, physical mobile devices, Firefox and WebKit have not been run for this independent visual observation. The 640-pixel layout is not a claim of native browser zoom.

## Scope limits and release work

- The final operation verified only the two changed responsive areas. It does not relabel the earlier five native cases or 41-view result as a complete rerun of the fourth build.
- True browser zoom, physical devices and independent Firefox/WebKit visual review remain unrun. The reflow check and Chrome device contexts do not establish those results.
- Publication, CI and deployment remain owned by the coordinator. Their actual outcome must be confirmed separately; this local report makes no push or deployment claim.
