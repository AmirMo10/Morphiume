---
name: morphiume-brand-ux
description: "Use for Morphiume brand assets, visual tokens, navigation, product discovery and purchase/admin UX. Produces original SVG identity and reviewable RTL flows; does not authorize product claims, service policies or live publication."
---

# Morphiume brand and UX workflow

## Inputs

Read repository `AGENTS.md`, `docs/PROJECT_BRIEF.md`, owner-approved facts in `docs/OWNER_INPUTS.md`, and the relevant page/capability contract. Use `docs/design/DESIGN_SYSTEM.md`, `docs/design/UX_FLOWS.md`, `docs/design/REFERENCES.md` and `docs/design/LOGO.md` as the established visual system. If a referenced root document is not yet present, record the missing input and continue reversible work with the master specification.

## Steps

1. Identify the user's decision on the screen: choose scent, select volume, understand total, track payment, or manage a record. Define empty, pending, error, unavailable and success states before decoration.
2. Check actual catalog/service data. Only approved families, notes, volumes, concentration, policies and claims may appear. Keep gift, sample, reviews and bestsellers hidden until their real capability exists.
3. Use bone/charcoal/wine tokens, self-hosted Vazirmatn, logical CSS and readable Persian. Preserve **Morphiume** exactly and isolate it in mixed-direction prose. Do not infer the official Persian spelling or history.
4. Put price, volume, availability and primary action together. A volume selection updates all variant facts as one decision. Customer amounts display تومان; use the coordinator's money utility, never a second ad hoc conversion.
5. Keep browse/cart guest-friendly; preserve form and cart state. Verify phone before protected account data or payment. Unknown payment stays `پرداخت هنوز تأیید نشده است. نتیجه از همین صفحه قابل پیگیری است.` until the server resolves it.
6. Use 44×44px minimum targets, persistent labels, visible focus, inline field errors and linked error summary, paste-friendly OTP, keyboard-accessible dialogs, one cart live region and reduced motion. Do not cover controls with a sticky purchase bar.
7. For logo changes, preserve vector-only geometry, light/dark/mono variants, minimum sizes and clear space. Render 16/32/128px compact marks and full wordmark at its minimum width. Do not claim trademark clearance.
8. Record each design reference's exact URL/date and only observed features. A blocked/dynamic body is a limitation, not evidence. Do not copy another brand's identity, photographs or narrative.

## Project rules

- No fabricated longevity, projection, origin, purity, certification, ratings or service promises.
- Development imagery has the visible label `تصویر نمونهٔ توسعه؛ تصویر واقعی محصول نیست` and cannot enter live content.
- Admin stays clear and light. Separate save draft from publish, show optimistic-lock conflicts, and explain technical terms only when useful.
- No mandatory intro animation, autoplay sound, scroll hijacking, custom cursor or GPU dependency in buying.
- Keep unknowns in the owner-input register; do not block unrelated reversible implementation.

## Definition of done

Deliver changed paths, tokens/flows/assets and real validation evidence. Run `node docs/design/verify_brand.cjs` with the documented bundled sharp dependency for changed SVGs/tokens. Implemented interfaces additionally require the actual app's responsive, keyboard, bidi, focus, zoom, error and payment-state checks. Do not equate a document or rendered logo with application acceptance. Keep root asset/source/skill registers aligned through their assigned owner.

## Related resources

`public/brand/` is the controlled identity source. `docs/FA_COPY_GUIDE.md` governs Persian copy when present. `docs/PAYMENTS.md` and `docs/ACCESS_MATRIX.md` govern payment and permission states. Use `morphiume-fa-rtl`, `morphiume-storefront` and `morphiume-admin` for their implementation workflows when available.
