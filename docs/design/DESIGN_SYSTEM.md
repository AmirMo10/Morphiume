# Morphiume design system

Decision date: 2026-10-12. This is an implementation contract for the single-brand, Persian fragrance store. Brand spelling is **Morphiume**. The official Persian spelling, brand story, product facts and service promises remain owner inputs.

2026-10-14 implementation extension: [redesign direction and editable boards](MORPHIUME_REDESIGN.md), [actual Figma state](FIGMA_REDESIGN.md). Public layout is scoped to `.storefront-root`; management has its own scoped stylesheet. Public product cards use one column below 360px, two on phones from 360px, and a narrower grid beside the desktop filter sidebar. The full wordmark remains at least 160px; at 320px the menu moves into the compact navigation row while search/cart remain in the masthead. Hover styling is capability-gated; controls use 16px input text, visible focus and reduced-motion rules. Native modal search/filter dialogs supply background inertness, Escape and focus restoration. Final execution evidence belongs in `docs/qa/REDESIGN_EXECUTION.md`.

## Direction

Quiet editorial commerce: a warm canvas, precise charcoal typography, wine actions, generous image space and visible purchase facts. Use real product photography when supplied. Use the brand's custom vector wordmark; do not use another fragrance house's assets or layout. A product tile is an image, title, scent family, selected volume and server price, separated by space rather than a decorative rounded card.

The `ui-ux-pro-max` design-system queries `fragrance ecommerce editorial minimal` and the single narrower retry `luxury perfume store minimalist` ran on 2026-10-12. The first returned Vibrant & Block-based; the second returned Liquid Glass with Latin typography. Neither style is a verified fit for this Persian web store. Neither output was persisted as a recommendation. This system is an original synthesis of the project specification, observed reference patterns and the skill's built-in accessibility, form and responsive guidance.

## Tokens

Machine-readable values are in [tokens.json](tokens.json); [tokens.css](../../public/brand/tokens.css) provides a portable CSS contract.

| Role | Value | Use |
| --- | --- | --- |
| Canvas | `#F6F2EB` | Main page background |
| Surface | `#FFFDFA` | Form, drawer and admin surfaces |
| Ink | `#20211F` | Body text, navigation, icons |
| Muted ink | `#62645E` | Supporting text, never opacity-only text |
| Brand | `#5C2333` | Primary action, active state, focus |
| Brand hover | `#471A28` | Press/hover on primary action |
| Border subtle | `#D8D1C7` | Decorative separators only |
| Border control | `#85867E` | Required field/control boundary |
| Success | `#256348` | Confirmed success with text/icon |
| Danger | `#A12F3D` | Error text and destructive actions |
| Warning | `#765312` | Pending/attention with text/icon |

Wine and bone are brand colors, not universal status meanings. The validation script measures all permitted foreground/background pairs. Subtle separators are not sufficient as the sole boundary of an input or selected control.

| Token family | Values |
| --- | --- |
| Spacing | 4, 8, 12, 16, 24, 32, 48, 64, 96 CSS px |
| Content width | 1280px max; reading copy 640px max |
| Gutters | 16px small screen; 24px at 640px; 40px at 1024px |
| Grid | 1 column at 320px; 2 at 480px; 3 at 768px; 4 at 1200px |
| Control height | At least 48px; pointer target at least 44×44 CSS px |
| Corner radius | 2px fields/buttons; 6px dialog; no large pill cards |
| Motion | 140ms feedback; 220ms drawer; ease-out; reduced motion removes transforms |

## Type and RTL

Self-host Vazirmatn v33.003 variable WOFF2, normal weight 100–900, using `font-display: swap`. Actual interface weights: 400 body, 500 labels, 600 actions, 700 important totals. Body 16px/1.8, supporting 14px/1.7, title 28–44px/1.45, hero 34–60px/1.35; increase with `clamp`, not fixed desktop values. Admin table cells may use 14px; form labels remain 16px. Never letter-space connected Persian. The custom Latin logo is vector geometry, independent of the UI font.

Document root: `lang="fa" dir="rtl"`. Use logical padding, margin, inset and borders. Preserve semantic DOM order instead of reversing rows. Isolate Latin names, email, phone and identifiers with `bdi`/`dir="ltr"`. Numbers in phone/OTP/postcode controls are strings and accept Persian, Arabic and Latin input; presentation formatting belongs to central utilities. Customer amounts show Persian digits plus **تومان**; server/DB amounts follow the coordinator's IRR contract. Do not invent price examples as product data.

## Components and behavior

- Header: logo, three short navigation items, search, account and cart. Search and cart remain visible at 320px; mobile menu contains secondary links. Every icon button has a Persian accessible name.
- Primary button: wine fill/bone text, 48px minimum height, 16px/600 label; pending label states what is happening. Secondary button: ink text/control border. Links use underline on hover and visible focus. Do not hide primary actions on hover.
- Focus: 3px wine outline with a 3px canvas offset on light surfaces; bone outline on dark wine/charcoal. Fixed headers and purchase bars must not obscure the focused element.
- Inputs: persistent label, 48px height, helper and inline error joined through `aria-describedby`. Failed multi-field submit focuses a linked error summary and retains entered values.
- Volume selector: native radio group with fieldset/legend, visible volume and availability. A selected volume updates price, stock, variant identity and image together. Unsupported variants have text explaining unavailability.
- Product gallery: fixed aspect ratio and explicit dimensions, text alt for real products; thumbnails/buttons supplement swiping. No autoplay carousel or purchase dependency on WebGL.
- Cart feedback: one polite live region announces a complete message; it does not move focus or force a cart drawer open. Undo may be offered for removal.
- Empty states: title, short reason and useful action. Loading skeletons reserve space. Errors say what can be retried and retain state.

## Page composition

Home: editorial split intro with one truthful short headline and `مشاهدهٔ عطرها`; published product selection; scent-family links only for actual catalog values; compact guide invitation; owner-approved services. With no published products, show a purposeful empty catalog, not fabricated bestsellers.

Product: gallery alongside a purchase panel on desktop. On mobile, image then name/description/volume/price/stock/action, without a long story between volume and action. Follow with a three-part scent-note list, full description and approved care/policies. Put shipping and return links close to the purchase panel. Show only approved service terms.

Checkout and admin: lighter, practical layouts with compact hierarchy; preserve the same typography, focus and field system. Dark presentation is limited to editorial brand content; purchase forms and management stay light.

## Asset and release rules

Selected direction: concept A, the original Morphiume wordmark and derived compact M. See [LOGO.md](LOGO.md). Development placeholders must state `تصویر نمونهٔ توسعه؛ تصویر واقعی محصول نیست` and be excluded from live content. No bottle appearance, notes, performance, origin, certificate, ratings, shipping promise or brand history may be inferred from a visual.

Before accepting an implemented screen, check 320/375/768/1280px, 200% zoom, keyboard, reduced motion, long Persian and mixed-direction text, error/loading/empty states, and actual server price/stock. This document is a design contract; those application checks are not claimed here as executed.
