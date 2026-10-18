# Morphiume Figma redesign: actual state and continuation

Observed 2026-10-14. Target: [Morphiume — Storefront & Commerce Workspace](https://www.figma.com/design/MIBHO5EWOaHudsaiOIcRlp/Morphiume?node-id=0-1). File key `MIBHO5EWOaHudsaiOIcRlp`, owner plan `team::1661998608587422082` resolved by the coordinator. No second file was created.

## Completed native Figma work

The file was inspected before mutation: one empty page, no local components/variables/styles. There were no Morphiume Code Connect files in the repository. Library discovery returned subscribed community libraries; the focused search for Morphiume Button, Product tile, canvas and Vazirmatn assets returned empty. These community components were not a compatible Morphiume foundation. Exact available Vazirmatn styles were verified before loading Regular, Medium, SemiBold and Bold.

| Entity | Exact ID | Actual contents |
| --- | --- | --- |
| Brand/components page | `0:1` | `01 · Brand & components` |
| Storefront page | `2:44` | `02 · Storefront`; empty, screen composition not completed |
| Operations page | `2:45` | `03 · Operations`; empty, screen composition not completed |
| Primitive collection | `VariableCollectionId:2:2` | 11 color primitives, hidden scopes |
| Semantic collection | `VariableCollectionId:2:3` | 11 aliases to primitives, explicit fill/text/stroke scopes |
| Layout collection | `VariableCollectionId:2:4` | 9 spacings plus control radius/height, explicit scopes |
| Text styles | See ledger below | 6 styles: Display, Heading, Title, Body, Label, Caption; Vazirmatn, zero tracking |

All 33 variables have WEB `var(--...)` syntax mapped to the existing portable tokens. Semantic colors use aliases, not duplicate raw values. Components bind color, gap and radius tokens and use shared text styles.

| Component family | Figma link | Variants or purpose |
| --- | --- | --- |
| Button | [3:14](https://www.figma.com/design/MIBHO5EWOaHudsaiOIcRlp/Morphiume?node-id=3-14) | Primary Default/Hover/Pending/Disabled; Secondary Default/Focus; 48px; editable Label property |
| Filter/volume | [3:21](https://www.figma.com/design/MIBHO5EWOaHudsaiOIcRlp/Morphiume?node-id=3-21) | Default, Selected, Unavailable; editable Label |
| Status | [3:28](https://www.figma.com/design/MIBHO5EWOaHudsaiOIcRlp/Morphiume?node-id=3-28) | Default, Attention, Confirmed; editable Label and text status |
| Wordmark | [3:29](https://www.figma.com/design/MIBHO5EWOaHudsaiOIcRlp/Morphiume?node-id=3-29) | Existing original SVG imported as editable vectors; 200×47 |
| Product tile | [3:80](https://www.figma.com/design/MIBHO5EWOaHudsaiOIcRlp/Morphiume?node-id=3-80) | Desktop `3:42`, Mobile `3:61`; editable Title/Facts; known showcase issues below |
| Admin metric | [3:81](https://www.figma.com/design/MIBHO5EWOaHudsaiOIcRlp/Morphiume?node-id=3-81) | Editable Label/Value; `—` explicitly means data not loaded |

Screen-ready component IDs: primary button `3:2`, secondary button `3:10`, default volume/filter `3:15`, selected `3:17`, default status `3:22`, wordmark `3:29`, desktop tile `3:42`, mobile tile `3:61`, admin metric `3:81`.

## Blocking state and known defect

The next import/wrapper call exceeded the connector's 50,000-character code schema limit. This was rejected before execution: no raster asset or wrappers were created. The JPEG was reduced to 21,453 bytes and the code then fit the schema, but the retry returned: `You've reached the Figma MCP tool call limit on the Starter plan.` No later Figma mutation succeeded.

The browser loaded the saved file but displayed `Sign up to comment, edit, inspect and more`, with Sign up/Continue with Google controls and no editable sidebar. The coordinator relayed the user's intent to sign in; a subsequent state check still showed this unauthenticated view. No account creation, credentials, upgrade, permission change, hidden-state API or plugin injection was attempted.

The partial [component-canvas screenshot](boards/figma-components-partial.png) verifies the actual saved controls and original vector wordmark. It also confirms that the two tile variants overlap. The grid positioned variants using each variant's own width instead of a shared maximum width. Smaller nested wordmark instance frames were resized without rescaling their vector children; they can clip. The desktop tile's fixed 480px height also needs to hug its actual children. These issues are not accepted or described as repaired.

When actual edit access/connector quota returns, first repair only the known nodes:

1. On page `0:1`, load the exact current text fonts before mutations.
2. Set desktop tile `3:42` to `(24,24)` and mobile tile `3:61` to `(344,24)` inside set `3:80`.
3. Resize the set from real child bounds after desktop tile height is changed to hug children. Do not guess the final height.
4. Restore desktop media logo instance `3:44` to 200×47 then rescale to at least the approved 160px wordmark minimum. Replace mobile media logo instance `3:63` with the existing compact M, using the repository vector source; the full wordmark cannot fit this tile with its required clear space. Check original geometry remains intact.
5. Build desktop 1440 home, mobile 390 home, catalog/PDP and admin overview as editable text, vectors, auto-layout and component instances using the local SVG compositions as layout references. Import only the isolated editorial concept image. Never flatten a whole UI into an image fill.
6. Return all changed IDs and bounds, verify fonts/editability, take composition screenshots, repair only observed defects and record the latest passing evidence.

No final screen node IDs exist yet. Do not fabricate links for empty page contents. The deliverable is partial native Figma foundations plus the five actual [local editable composition boards](MORPHIUME_REDESIGN.md), not a completed Figma screen library.

Coordinator recheck after the user's sign-in intent: `whoami` still reported the same Starter/View plan. The browser tool then failed to initialize its kernel assets; a resumed agent had no enabled browser surface. The user's current browser sign-in state could therefore no longer be observed. This later tool failure is not evidence that the user stayed signed out. Implementation and native application QA continued independently.

## Current access audit, 10:43 UTC

The continuation agent checked the connection again on 2026-10-14. `whoami` reported Starter with a View seat. One read-only `use_figma` call attempted to inspect the saved foundations and product tile, but the connector rejected it with `You've reached the Figma MCP tool call limit on the Starter plan.` No canvas inspection or mutation ran, so variable counts, empty screen pages and node IDs above remain the prior successful native observations rather than a new API audit.

After local disk space was recovered, the browser tool initialized successfully. Its inventory had no tabs in this agent's task-scoped browser. Opening the existing file in a new background task tab displayed `Sign up to comment, edit, inspect and more.`, Sign up and Continue with Google. The canvas screenshot showed the saved component families and the unresolved product-tile overlap. No login form, credentials, subscription, access permissions or canvas content was changed. This checks only the newly opened task browser; it does **not** establish whether the user completed sign-in in another tab or browser.

The known tile repair and five editable Figma screen compositions remain pending. No new screen IDs or accepted Figma frame links are reported. The five local editable SVG boards remain available. [The safe access-audit record](boards/figma-access-audit-20261014.json) records the actual calls, scope and limitations without account identifiers or credentials. The temporary audit tab was closed after inspection.

## State ledger

```json
{
  "runId": "morphiume-redesign-2026-10-14",
  "designFileId": "MIBHO5EWOaHudsaiOIcRlp",
  "scope": "scoped foundations and reusable control families plus screen design references",
  "pages": {"brand":"0:1","storefront":"2:44","operations":"2:45"},
  "collections": {"primitives":"VariableCollectionId:2:2","semantics":"VariableCollectionId:2:3","layout":"VariableCollectionId:2:4"},
  "semanticVariables": {
    "color/canvas":"VariableID:2:6","color/surface":"VariableID:2:8","color/ink":"VariableID:2:10",
    "color/muted":"VariableID:2:12","color/brand":"VariableID:2:14","color/brand-hover":"VariableID:2:16",
    "color/border-subtle":"VariableID:2:18","color/border-control":"VariableID:2:20",
    "color/success":"VariableID:2:22","color/danger":"VariableID:2:24","color/warning":"VariableID:2:26"
  },
  "textStyles": {
    "Display":"S:2217aded80895ac8351558564e80014d5f742de3,",
    "Heading":"S:0a3833244da9ed49e44ec7110d6ddc68f3361204,",
    "Title":"S:34e5da34b1bb3ebac9c6435da0bc1708f9ec0b35,",
    "Body":"S:d575b12ae23d52e911bd78816c5031de44f497e5,",
    "Label":"S:60fe2fa8e498cfb71d4f64fe9f936c79a856fce2,",
    "Caption":"S:1816fb00262b92573181a04a29402e6b1faf7403,"
  },
  "components": {"buttonSet":"3:14","filterSet":"3:21","statusSet":"3:28","logo":"3:29","tileSet":"3:80","metric":"3:81"},
  "completed": ["file and library discovery","33 scoped variables","6 Vazirmatn text styles","button/filter/status/wordmark/metric families","local SVG board composition and visual review"],
  "pending": ["tile overlap/geometry repair","native Figma screen composition","Figma full-view/editability acceptance"],
  "screenFrames": {},
  "blockingCondition": "Starter-plan connector quota reobserved 2026-10-14; newly opened task browser read-only, user sign-in elsewhere unobserved"
}
```

Skills read and applied: `figma-use` plus gotchas/API index/working-with-design-systems and variable/component helpers; `figma-generate-design`; `figma-generate-library`; repository `morphiume-brand-ux` and `morphiume-fa-rtl`; built-in `imagegen`; local `ui-ux-pro-max` guidance. Root's already inspected reference URLs and existing design contract informed hierarchy; no reference brand's identity, text or photographs were copied.
