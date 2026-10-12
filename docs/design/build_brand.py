"""Rebuild original Morphiume SVG assets and portable tokens. No third-party code."""
from pathlib import Path
import json
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[2]
BRAND = ROOT / "public" / "brand"
BRAND.mkdir(parents=True, exist_ok=True)
(BRAND / "fonts").mkdir(exist_ok=True)

WORDMARK = '''<g fill="none" stroke="{color}" stroke-width="3.6" stroke-linecap="square" stroke-linejoin="round">
  <path d="M14 84V22L37 65L60 22V84"/>
  <path d="M103 42C87 42 80 50 80 64S87 86 103 86S126 78 126 64S119 42 103 42Z"/>
  <path d="M146 84V43M146 56C151 46 159 42 170 44"/>
  <path d="M188 105V43M188 54C198 36 227 39 227 63C227 88 199 94 188 74"/>
  <path d="M248 84V22M248 55C252 39 283 35 283 58V84"/>
  <path d="M306 43V84"/>
  <path d="M329 43V67C329 91 365 89 365 65V43M365 68V84"/>
  <path d="M387 84V43M387 55C391 39 416 38 416 56V84M416 55C420 39 445 38 445 56V84"/>
  <path d="M469 62H506C508 38 469 35 466 61C463 86 490 93 506 79"/>
</g><circle cx="306" cy="27" r="2.8" fill="{color}"/>'''
MARK = 'M20 108V20H35L64 70L93 20H108V108H92V52L64 97L36 52V108Z'
MONOGRAM_B = 'M20 108V35Q20 16 40 16H45L64 48L83 16H88Q108 16 108 35V108H86V54L64 88L42 54V108Z'

def svg(title: str, viewbox: str, body: str) -> str:
    result = f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="{viewbox}" role="img" aria-labelledby="title">
  <title id="title">{title}</title>
  {body}
</svg>
'''
    ET.fromstring(result)
    return result

def put(name: str, title: str, viewbox: str, body: str):
    (BRAND / name).write_text(svg(title, viewbox, body), encoding="utf-8")

for name, color in [("morphiume-wordmark.svg", "#20211F"),
                    ("morphiume-wordmark-light.svg", "#F6F2EB"),
                    ("morphiume-wordmark-wine.svg", "#5C2333")]:
    put(name, "Morphiume", "0 0 526 122", WORDMARK.format(color=color))

put("concept-a-wordmark.svg", "Morphiume — concept A, custom wordmark", "0 0 526 122", WORDMARK.format(color="#20211F"))
put("concept-b-monogram.svg", "Morphiume — concept B, negative-space M", "0 0 128 128", f'<path fill="#20211F" d="{MONOGRAM_B}"/>')
put("concept-c-curves.svg", "Morphiume — concept C, two curves and wordmark", "0 0 690 152",
    '<g fill="none" stroke="#20211F" stroke-width="4" stroke-linecap="round"><path d="M24 126C8 82 24 42 88 20"/><path d="M59 126C44 83 68 52 118 43"/></g>'
    + '<g transform="translate(146 15)">' + WORDMARK.format(color="#20211F") + '</g>')
put("morphiume-mark.svg", "Morphiume", "0 0 128 128", f'<path fill="#20211F" d="{MARK}"/>')
put("morphiume-mark-light.svg", "Morphiume", "0 0 128 128", f'<path fill="#F6F2EB" d="{MARK}"/>')
put("favicon.svg", "Morphiume", "0 0 128 128", f'<rect width="128" height="128" rx="8" fill="#5C2333"/><path fill="#F6F2EB" d="{MARK}"/>')
put("morphiume-label.svg", "Morphiume label identity", "0 0 600 200", '<g transform="translate(37 39)">' + WORDMARK.format(color="#20211F") + '</g>')

tokens = {
    "$schemaNote": "Original Morphiume design tokens; CSS px and milliseconds unless stated",
    "version": "2026-10-12",
    "color": {
        "canvas": "#F6F2EB", "surface": "#FFFDFA", "ink": "#20211F", "muted": "#62645E",
        "brand": "#5C2333", "onBrand": "#F6F2EB", "brandHover": "#471A28",
        "borderSubtle": "#D8D1C7", "borderControl": "#85867E", "success": "#256348",
        "danger": "#A12F3D", "warning": "#765312"
    },
    "spacing": [4, 8, 12, 16, 24, 32, 48, 64, 96],
    "font": {"family": "Vazirmatn", "body": {"size": 16, "lineHeight": 1.8, "weight": 400},
             "support": {"size": 14, "lineHeight": 1.7}, "labelWeight": 500, "actionWeight": 600},
    "layout": {"contentMax": 1280, "readingMax": 640, "gutters": {"base": 16, "640": 24, "1024": 40}},
    "control": {"minHeight": 48, "minTarget": 44, "radius": 2, "focusWidth": 3, "focusOffset": 3},
    "motion": {"feedback": 140, "drawer": 220, "easing": "cubic-bezier(0.2, 0, 0, 1)", "reduced": "no transforms"},
    "contrastPairs": [
        {"foreground": "ink", "background": "canvas", "min": 4.5},
        {"foreground": "muted", "background": "canvas", "min": 4.5},
        {"foreground": "muted", "background": "surface", "min": 4.5},
        {"foreground": "onBrand", "background": "brand", "min": 4.5},
        {"foreground": "onBrand", "background": "brandHover", "min": 4.5},
        {"foreground": "brand", "background": "canvas", "min": 4.5},
        {"foreground": "success", "background": "canvas", "min": 4.5},
        {"foreground": "danger", "background": "canvas", "min": 4.5},
        {"foreground": "warning", "background": "canvas", "min": 4.5},
        {"foreground": "borderControl", "background": "canvas", "min": 3},
        {"foreground": "borderControl", "background": "surface", "min": 3}
    ]
}
(ROOT / "docs/design/tokens.json").write_text(json.dumps(tokens, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

css = '''/* Morphiume: portable tokens; map to the application's styling system. */
@font-face {
  font-family: "Vazirmatn";
  src: url("/brand/fonts/Vazirmatn[wght].woff2") format("woff2");
  font-style: normal;
  font-weight: 100 900;
  font-display: swap;
}
:root {
  --font-body: "Vazirmatn", Tahoma, sans-serif;
  --color-canvas: #F6F2EB;
  --color-surface: #FFFDFA;
  --color-ink: #20211F;
  --color-muted: #62645E;
  --color-brand: #5C2333;
  --color-on-brand: #F6F2EB;
  --color-brand-hover: #471A28;
  --color-border-subtle: #D8D1C7;
  --color-border-control: #85867E;
  --color-success: #256348;
  --color-danger: #A12F3D;
  --color-warning: #765312;
  --space-1: 4px;
  --space-2: 8px;
  --space-3: 12px;
  --space-4: 16px;
  --space-6: 24px;
  --space-8: 32px;
  --space-12: 48px;
  --space-16: 64px;
  --space-24: 96px;
  --content-max: 1280px;
  --reading-max: 640px;
  --gutter: 16px;
  --control-min-height: 48px;
  --target-min: 44px;
  --radius-control: 2px;
  --radius-dialog: 6px;
  --duration-feedback: 140ms;
  --duration-drawer: 220ms;
  --ease-out: cubic-bezier(0.2, 0, 0, 1);
}
@media (min-width: 640px) { :root { --gutter: 24px; } }
@media (min-width: 1024px) { :root { --gutter: 40px; } }
@media (prefers-reduced-motion: reduce) {
  :root { --duration-feedback: 0ms; --duration-drawer: 0ms; }
}
'''
(BRAND / "tokens.css").write_text(css, encoding="utf-8")
print("Created 10 original SVG assets, tokens.json and tokens.css")
