# Brand asset register

Observed/created: 2026-10-12. This scoped register is ready for the coordinator to incorporate into root `docs/ASSET_REGISTER.md`.

| Asset | Source and permission basis | Role / limitation |
| --- | --- | --- |
| 10 SVGs in `public/brand` | Original geometry authored for this Morphiume project, retained in editable SVG and `build_brand.py`; no external brand assets. | Three concepts plus selected mono/light/wine wordmark, compact marks, favicon and label identity. No trademark clearance claim. |
| `public/brand/fonts/Vazirmatn[wght].woff2` | [Exact upstream v33.003 font](https://raw.githubusercontent.com/rastikerdar/vazirmatn/v33.003/fonts/webfonts/Vazirmatn%5Bwght%5D.woff2); unmodified; Vazirmatn Project Authors. | Self-hosted variable Persian/Arabic UI font; upstream CSS specifies 100–900 weight. |
| `public/brand/fonts/OFL.txt` | [Exact upstream v33.003 license](https://raw.githubusercontent.com/rastikerdar/vazirmatn/v33.003/OFL.txt); full SIL OFL 1.1 retained with copyright. | Keep with redistributed font. Font may not be sold by itself. |
| `public/brand/tokens.css`, `docs/design/tokens.json` | Original project token specification. | Coordinator maps these into application stylesheet. |
| `docs/design/brand-board.png`, favicon PNG size proofs and wordmark proof | Generated locally from the project's SVGs using bundled sharp; original editorial proof layout. | Review artifacts, not product photography. |

Font SHA-256: `4e3fa217d38fdafc1fea4414ceb58ca5e662cf0ab5fa735a8c8c20e8b42cad92`.

OFL SHA-256: `17e355067c8284f47743a1ee3b1ef7ff684ff0601eda357f9353b10b3016ab31`.

Every SVG checksum is in [validation.json](validation.json). The application must use controlled repository identity SVGs; accepting arbitrary uploaded active SVGs remains outside the media policy.

No product photography has been fabricated or copied by this task. Approved real photographs, source/license, exact product depiction, image alt text and owner-approved descriptions remain required. An interface placeholder must visibly say `تصویر نمونهٔ توسعه؛ تصویر واقعی محصول نیست` and be excluded from live content. Contact data, shipping guarantees, awards/certificates, brand history and actual product claims must come from owner inputs.
