# Arcade Reborn — logo concept 01

Created 11 October 2026 for the owner's request to explore logos for New Super TIC Fighter.

The direction develops the existing blue, white, and pink identity with original angular, forward-leaning lettering. A pink NEW tab is integrated into the lockup. The split underline suggests the game's platforms and forward motion.

## Files

- `arcade-reborn.svg`: transparent colour master, 1240 × 620 viewBox; named, editable vector groups and paths. No fonts, external assets, scripts, or embedded raster images.
- `arcade-reborn-mono.svg`: simplified white master with a transparent knockout for NEW; intended for dark backgrounds.
- `arcade-reborn.png`: transparent PNG at 1240 × 620.
- `arcade-reborn@2x.png`: transparent PNG at 2480 × 1240.
- `arcade-reborn-preview.png`: colour logo on the game's dark background.
- `concept-board.png`: overview with light-background and monochrome checks.
- `preview.html`: local presentation with SVG download links.

## Provenance

Code-authored vector exploration by Codex at the owner's request, following selection of the first concept/format. No image-generation service or third-party font was used. All letter contours, tabs, rails, outlines, and extrusion geometry are newly drawn polygon paths.

References: `public/assets/logo.png` for the inherited palette and arcade character; `src/styles.css` for current UI colours; `docs/implementation-plan.md` for the title and visual direction. These references were read only. The existing logo, original artwork, and game integration are untouched.

The colour master uses white #F5FAFF, blue #29B4FA / #21A8ED, pink #F23899, cyan #66D5FF, and deeper blues for separation and shallow extrusion. The gradient is optional styling; the monochrome master retains the underlying silhouette.

## Verification

Rendered through isolated headless Chromium using Playwright and visually inspected on dark and light backgrounds, including a 340 px display and a one-colour treatment. Confirmed PNG alpha and SVG parseability. No game runtime behaviour changed, so application builds and multiplayer exercises were not relevant to this concept-art delivery. The full lockup is intended for title/menu use; a favicon-sized symbol would be a separate design.
