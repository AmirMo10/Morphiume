# Morphiume professional redesign contract

Date: 2026-10-19. Independent design review of the supplied 1440px home/dashboard screenshots and current `home-presentation.tsx`, `catalog.tsx`, `admin-shell.tsx`, `admin-overview.tsx`, `globals.css`, `storefront-redesign.css` and `admin-redesign.css`. This updates visual composition from the 2026-10-14 direction. Existing brand identity, approved facts, responsive/RTL rules, permissions and commerce behavior remain authoritative.

## What needs a material change

1. **Home has no coherent cover composition.** The cream headline floats across from a separately inset photograph. A 600px hero, 64px headline with 1.5 leading, wide gaps and a repeated footnote consume most of the first screen before the empty catalog. Changing corner radii will not solve this. Build one deliberately joined art/copy composition and bring useful discovery into view sooner.
2. **The available product state is treated like a failure panel.** The screenshot has no published products and a large bordered catalog-empty block. This must look intentional without filling it with fake merchandise. The same layout must support zero, one, two and four real products without awkward orphan cards.
3. **Admin gives summaries more space than work.** `Metric` combines a label, large numeral, explanatory paragraph and repeated 44px management link. Four mostly zero-valued summaries consume over 200px; a second large queue panel pushes the order table below the useful first viewport. Compress summary chrome and elevate the working list.
4. **Too much operational copy is 12px.** Sidebar/table/work labels need 14px; reserve 12px for secondary metadata. Differentiation should come from alignment, contrast and weight rather than increasingly small text.
5. **Check actual admin bounds before adding overrides.** The baseline main content reaches the left edge despite the stylesheet declaring 32px padding. Inspect computed grid/container bounds and resolve the responsible width/cascade rule. Do not hide overflow as a repair.

The dashboard's magenta block is a privacy mask on `.admin-session`, confirmed in `.local/polish-20261019-qa/local-visual.mjs:19`; it is not a product styling defect.

## Art direction: a fragrance journal, an operational workspace

The storefront should feel like a composed fragrance journal: one strong cover, readable product facts, a quiet typographic grid and intentional material imagery. The admin should feel like a precise workspace: charcoal navigation, light data surfaces, concise labels and immediately usable lists. These share the original Morphiume wordmark, self-hosted Vazirmatn, bone `#F6F2EB`, charcoal `#20211F` and wine `#5C2333`; they should not look like the same marketing template.

Keep existing semantic colors and measured token pairs. Use bone on wine for the cover (existing measured contrast 10.80:1). Surface `#FFFDFA`, subtle rule `#D8D1C7`, control boundary `#85867E`. No new gold, gradients, glass blur, product-like generated bottle, fake badge, testimonial, revenue or shipping promise. Keep controls at 2px radius; panels may use the existing restrained 6px radius, consistently. No card lift, large drop shadow or entrance sequence.

## Desktop storefront, 1440px reference

Use a 1280px maximum centered container, 80px outer margins at 1440px. Use a 12-column mental grid and a 24px layout rhythm. Do not stretch typography merely to fill space.

| Element | Exact composition |
| --- | --- |
| Environment notice | Preserve its actual staging/test meaning; compact single strip, wrapping at small widths. It is not a promotional announcement. |
| Masthead | 80px high, original wordmark 180–188px on the right, central navigation, search/account/cart on the left. Utilities have 44px targets; a thin bottom rule anchors the whole width. No extra duplicated brand subtitle. |
| Integrated cover | 32px below masthead; 1280px wide, approximately 510px high. Left 7/12 art plane, right 5/12 flat wine copy panel, joined without a cream gap. Exact widths may account for the grid; avoid a brittle fixed height if copy grows. |
| Copy panel | 48px internal insets; kicker `Morphiume / عطر و رایحه`, 13px/500. H1 52–56px/1.4, weight 500–600, maximum two deliberate lines with balanced phrase lengths. Body 16px/1.9, maximum about 36 characters per line. Use 20px from kicker to title, 20px to body, 28px to actions. Do not force a lone `رایحه،` onto a huge first line. |
| Actions | Primary inverse button: cream fill/wine text, approximately 192×52px, `مشاهدهٔ عطرها`. Secondary guide is a simple cream text link, 44px target and visible underline/focus. Stack if they do not fit. Remove the current repeated ruled footnote. |
| Art/caption | Existing conceptual material study may fill the left plane in test/staging, with the environment guard retained. Caption in a separate 28–40px rail under the image, 13–14px readable type, visible exact conceptual-image meaning; allow wrapping. No white sticker on top of the photograph. Never put paragraph copy over the photo. |
| Discovery rail | One flat ruled row beneath cover, 80–96px high: `خانوادهٔ رایحه` / `نت‌ها` / `انتخاب حجم`, with small indices only as navigation structure. Each label needs a working catalog/guide destination. Omit any route unsupported by actual data; no imaginary taxonomy or collection. |
| Catalog section | 56px after the rail; section label/heading on right, `همهٔ عطرها` on left, one rule. Four equal columns with 24px gaps when four products exist. At 1440×1000 the catalog heading and beginning of useful content should be visible, rather than another mostly blank fold. |

The cover copy may retain the approved idea `رایحه، به انتخاب شما.` with a more deliberate line break; do not invent a history, collection name or limited edition. No year/edition/serial graphic that could be read as a product claim. A small chapter index may label an actual page section.

### Images and empty content

- Real product slots use only their actual authorized image. Fit consistently within a 3:4 light surface; avoid cropping a real bottle/label. `object-fit: contain` is the default for packshots, with adequate internal space. Editorial art can use `cover` because it is not product evidence.
- Missing product imagery is a quiet structured 3:4 frame with a small original M and `تصویر محصول هنوز ثبت نشده است.` It is not a guessed bottle silhouette. Keep real title/volume/price/stock underneath when those facts exist.
- Development assets retain their required visible sample label. Concept art remains explicitly separate from product photos and excluded from live until approved by the existing policy. Do not weaken the current environment gate for visual convenience.
- Live cover fallback should be intentional flat charcoal/wine brand geometry with fine rules and a modest original mark, not a giant M on a radial gradient. The brand identity can carry the composition without pretending product photography exists.
- Zero published products: replace the large bordered empty card with a compact 120–150px ruled editorial row: `کاتالوگ در حال آماده‌سازی است.` plus one short factual explanation and a real guide link. No disabled buy buttons or invented sample cards.
- One or two products: keep the standard grid's natural column width and align from the RTL start; do not enlarge them into oversized centerpieces. Make remaining space a deliberate unboxed guide invitation, or leave it as the grid's whitespace. Three or four products use the same media/title/price baseline.
- Product tiles have no outer card box: media plane, 16px gap, 12–13px family/concentration, 18–20px name, 16px price, 14px selected volume/stock. Put stock below/near product facts instead of a promotional-looking overlay badge. Favorites remain visible and accessible without overpowering the product.

### Remaining customer pages

Catalog gets a compact title/query/count header and one toolbar; desktop facet sidebar 216–232px, 32px gap, three equal result columns. Preserve existing URL/filter/error behavior. Product detail uses a generous image plane beside a stable purchase column: title, short description, volume, exact selected price, stock and primary action remain one group; notes/story follow. Use the cover's strong composition sparingly: cart/checkout/account remain cream and practical. Do not apply wine marketing panels to payment forms.

## Mobile storefront, 320–767px

16px page gutters; original full wordmark at least 160px, visible search/cart, 44px targets. Use the existing compact navigation row when all masthead controls do not fit. No horizontally squeezed desktop nav.

Cover becomes wine copy first, then art and caption. Copy insets 24px (20px at 320px), H1 34–38px/1.45, body 16px/1.85. Show the title and primary action before a tall art plane. Primary button fills available width; secondary link occupies its own line if needed. Art is approximately 220–260px high with a responsive crop; no fixed desktop minimum height. Discovery rail becomes three concise stacked ruled rows with 52px minimum targets. Product tiles use two columns from 360px, one below 360px, retaining the existing responsive contract and readable wrapped labels.

## Professional admin composition

| Element | Exact composition |
| --- | --- |
| Shell | Charcoal right sidebar 232–248px; light surface topbar 68px; cream main. All forms, tables and editable panels stay light. Main inner gutters 32px desktop, 24px tablet, 16px phone; verify real bounds rather than relying on declared padding. |
| Sidebar | Bone original wordmark 160–176px, 76px identity area. Group captions 12px/500, navigation 14px/500, 44px rows, 20px consistent outline icons. Active route gets a clear wine/bone treatment and 3px indicator, with sufficient contrast. Secondary bulk/import links may be grouped in a semantic disclosure, never removed from permitted access. Preserve all role-dependent destinations and current-page state. |
| Topbar | Breadcrumb 13–14px; real session/role on opposite end. Do not fabricate last-sync time or account data. A small honest preview-state indicator may replace a repeated oversized notice only if the required warning remains visible and understandable. |
| Page header | 28px/600 title with one 14px supporting sentence; actions aligned opposite. One wine primary `افزودن محصول`; refresh as restrained icon+label secondary. Header approximately 80px high, no marketing eyebrow repeating the breadcrumb. |
| Metrics | Four equal summaries in one 104–120px surface strip, with internal rules; 14px label, 28–32px numeral, optional 12px short qualifier. Remove repeated paragraphs and `مشاهده و مدیریت` links from all four cells. Make the relevant summary label/area a clearly named navigation target without nesting error-retry controls inside links. Preserve actual zero/loading/error/permission states. |
| Queue | Compact 48–64px row of real status labels/counts/links, directly above the working list; no second tall metric-card grid. Counts come from the existing endpoints. Payment exception uses semantic attention styling with text, not wine as an unexplained error signal. |
| Main work area | At ≥1280px: order list in flexible primary column; 280px catalog-completion task list beside it; 24px gap. At narrower widths move task list below the work table. Table heading/filter row should begin by roughly y440 at 1440×1000, so real rows or a purposeful empty state are visible in the first viewport. |
| Table | Surface background, 44px header, 56–64px rows, 14px values, 12px secondary identifiers/dates, consistent numeric alignment. Keep payment and fulfillment separate. Use restrained separators, not a border around every cell. Existing horizontal scroll is scoped to the table on small screens. |
| Catalog tasks | 14px draft title, short real missing-field list, one visible edit action per row. No decorative completion percentage. One useful add/edit action in an empty business state. |

The dashboard with no orders must still look professional: show real zeroes, clear list heading/filter state, a small purposeful empty state and actual catalog tasks. Do not add invented charts, trends or fake data to fill space. Avoid source-explanation paragraphs such as “counts come from the server” in the normal workspace; that belongs in documentation unless a user decision requires it.

Product/order/list pages share the shell, header, toolbar and row system. Product editing uses short titled sections and a visible save/publish action area; preserve unsaved/conflict/server-validation behavior. Do not change business behavior to simplify a screen. Mobile admin uses a clear navigation toggle and the implemented accessible expanded/drawer pattern; modal implementations require focus containment, Escape and focus restoration. Do not shrink desktop panels and call that a phone layout.

## Implementation priority and acceptance

1. Replace home cover DOM/composition and reorganize zero/one/many-product states; do not append another cosmetic stylesheet layer to the same oversized composition.
2. Rebuild admin metric/queue hierarchy and shared shell; remove redundant text/actions at component level instead of hiding needed state in CSS.
3. Apply shared tile/media and operational typography, table/form surfaces consistently across the real screens. Retain original SVGs and font; no new font or brand asset is necessary.
4. Independently inspect actual rendered home, zero/one/four-product catalog, product, cart/checkout, dashboard, products table, product editor and order at 1440/1280/768/390/320px. Compare composition, not only overflow. Check 200% zoom, long Persian/Latin names, absent image, keyboard/focus, dialog, reduced motion and real loading/error states. Test both permitted and restricted admin roles. These are acceptance requirements, not checks executed by this review.

Design rejection conditions: the old detached hero merely recolored; another large empty catalog box; all admin metrics still >180px; first useful admin list below the fold; 12px primary work text; hidden environment labels; generated imagery read as actual product; false claims or broken price/stock/role states.

## Evidence and limits

Read-only baseline images: `.local/polish-20261019-qa/visual-8f511307-944d-434f-b586-f58987739f58/1440-home.png` and `1440-dashboard.png`, both viewed with the image tool. Current source and existing design/brand/UX contracts were inspected; no browser session, build, application test, Git mutation or deployment was performed by this task.

This is an original in-house art direction, not a database-verified design system. The ui-ux-pro-max query `luxury ecommerce editorial minimalism --design-system --variance 2 --density 3` returned Minimalism & Swiss Style, but its generic feature-card funnel, gold palette and Cormorant/Montserrat typography are not adopted. The coordinator separately reported Liquid Glass/Latin fonts from `luxury fragrance editorial commerce` and a pharmacy-green result from the narrower `perfume store minimal editorial`; both were rejected. The targeted `dashboard information density` query returned unrelated color-only/redundant-entry guidance and was not used as density evidence. The composition decisions above come from actual screen/source review and Morphiume requirements; basic grid/accessibility guidance remains general guidance.

Only `docs/design/PROFESSIONAL_REDESIGN.md` was written by the independent brand-review assignment. Visual implementation and acceptance evidence belong to the coordinator and assigned engineers.
