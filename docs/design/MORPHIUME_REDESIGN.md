# Morphiume storefront and management redesign

Decision and review date: 2026-10-14. This is the design handoff for the requested professional storefront and business workspace. It extends the existing [design system](DESIGN_SYSTEM.md) and [UX flows](UX_FLOWS.md); the original wordmark, bone `#F6F2EB`, charcoal `#20211F`, wine `#5C2333` and self-hosted Vazirmatn remain authoritative.

## Direction and user decisions

Use a refined fragrance journal and atelier character: a generous editorial photograph, a restrained masthead, strong typographic hierarchy, thin separators and a consistent grid. Product facts and the purchase action carry the commerce interface. Admin uses the same typography and colors with lighter, practical surfaces.

Do not introduce glass UI, excessive rounded cards, decorative metrics, fabricated ratings, invented bestsellers, service promises, brand history, packaging or product photography. Current real product facts and photos are missing. The review boards therefore name their product blocks `محصول نمونهٔ طراحی`, show `قیمت از کاتالوگ` and retain explicit missing-image states. These are design labels, never live catalog records.

The original image at [editorial-concept.webp](../../public/brand/editorial/editorial-concept.webp) is a generated glass, botanical and light material study, not a depiction of a Morphiume product. Its provenance and exact prompt are in [the asset record](../../public/brand/editorial/README.md). Test/staging display requires `تصویر مفهومی؛ تصویر واقعی محصول نیست`. Live exclusion remains required until owner approval. Development product images keep `تصویر نمونهٔ توسعه؛ تصویر واقعی محصول نیست`.

## Screen contract

| Screen | Layout | Decision and content rules |
| --- | --- | --- |
| Desktop home | 1440px artboard; 1280px inner grid centered with 80px margins; 96px masthead; 832/608 editorial split and 576px photo; four 296px product columns with 32px gaps. | Right-aligned headline `رایحه، به انتخاب شما`; primary `مشاهدهٔ عطرها`; secondary guide. Published products only. No catalog means a purposeful empty state. |
| Mobile home | 390px artboard; 16px gutters; 80px masthead; 390×292 photo followed by copy; 35–36px hero type; two 171px sample composition columns separated by 16px. | Search and cart stay visible. Keep a 48px primary action and visible guide link. Required imagery labels wrap within their tile. The application must also support 320px. |
| Catalog | Ruled title area; query/count and filter/sort controls; uniform product grid. | URL-preserved search, actual catalog filter values, removable selections, clear-all, honest result count, loading/error/zero-result states. Do not expose unsupported filters. |
| Product | 680px gallery beside a 536px purchase column; short description, volume, price, availability and 48px action grouped together; notes/details below. | A variant change updates image, price, stock and identity together. Omit unknown facts. Keep approved policy links near the action. Mobile stacks gallery before purchase facts. |
| Admin overview | 1440px artboard; 248px right sidebar; 88px breadcrumb/session bar; four compact metrics; working queues; recent-order table; catalog readiness action. | Actual values only. Em dash means not loaded; a real zero stays zero. Payment and fulfillment are separate table columns. No decorative chart or invented revenue. Show permitted destinations/actions and real server results. |

Hero type uses 60–64px/84px on the desktop reference and 35–36px on mobile; body remains 16px with generous line height. Use clamp in the application, not fixed desktop values. Controls are at least 48px; use the established 2px control radius and visible focus. Do not letter-space Persian. Preserve Latin identifiers in `bdi`/LTR isolation.

## Reviewable compositions

These SVGs preserve editable text and vector geometry and embed the actual Vazirmatn WOFF2. The two homepage images are isolated content assets, not flattened UI screenshots. They are standalone composition references, **not completed Figma screen frames and not screenshots of the running application**.

| Composition | Editable source | Browser-rendered preview |
| --- | --- | --- |
| Desktop home, 1440×2290 | [SVG](boards/home-desktop-1440.svg) | [PNG](boards/home-desktop-1440.png) |
| Mobile home, 390×2100 | [SVG](boards/home-mobile-390.svg) | [PNG](boards/home-mobile-390.png) |
| Catalog, 1440×1490 | [SVG](boards/catalog-desktop-1440.svg) | [PNG](boards/catalog-desktop-1440.png) |
| Product, 1440×1550 | [SVG](boards/product-desktop-1440.svg) | [PNG](boards/product-desktop-1440.png) |
| Admin overview, 1440×1140 | [SVG](boards/admin-overview-1440.svg) | [PNG](boards/admin-overview-1440.png) |

[Board index](boards/index.html) and [reproducible generator](boards/build_artboards.cjs). Generate with the documented bundled Node executable or `node docs/design/boards/build_artboards.cjs`. Generation reads only the existing wordmark/font and the new concept asset and writes under `docs/design/boards`.

## Evidence and limits

All five boards were opened in the in-app browser and reviewed as full-page compositions. A targeted repair corrected SVG RTL anchor direction, wrapped mobile absent-image copy, and restored visible mobile search/cart. After repair, [the DOM-bound audit](boards/validation.json) found 194 text nodes, computed `Vazirmatn` on every board, two discrete editorial images, and no text bounds outside an artboard. Saved PNG previews show the reviewed compositions. These checks do not exercise application controls, keyboard behavior, purchasing, accessibility technology, live data, mobile hardware or deployment.

`node docs/design/verify_brand.cjs` ran using bundled sharp and passed the existing ten vector renders, eleven contrast pairs, font signature/license and skill checks. No existing SVG/token source changed. The new image also passed actual dimension/format inspection and a visual review; no bottle, label or product fact was generated.

The Figma file contains actual foundations and component families but its Starter-plan connector quota stopped screen composition. The browser then showed unauthenticated, read-only controls; a user statement that they would sign in was checked, but completed sign-in/edit access was not observed during this handoff. The partial Figma tile showcase has known overlap and scaling issues, documented with exact IDs in [FIGMA_REDESIGN.md](FIGMA_REDESIGN.md). Do not treat it as accepted screen delivery.

The storefront and admin engineers received this direction and asset paths. Their implementation, server behavior, responsive/keyboard/zoom checks, publication and deployment remain separate coordinator verification work.
