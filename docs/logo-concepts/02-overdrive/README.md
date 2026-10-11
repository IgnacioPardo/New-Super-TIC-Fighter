# 02 — Overdrive

The owner selected this direction for refinement. The current [polished identity family](polished/README.md) includes the refined primary, responsive wordmarks, small icons, monochrome assets and web/game/branding application studies. [Download the complete kit](overdrive-brand-kit.zip). The original proposal below remains preserved for comparison.

Replacement proposal, 11 October 2026. This follows the owner's request to retain 01 as the quality benchmark, discard the former 02–05, and review replacements one at a time.

The logo keeps the muscular arcade lettering, blue/white/pink identity, and finish of 01. Its alternative character comes from an ascending composition, tighter stack, deeper geometric bevels, an extended F, and a sweeping terminal R. A curved pink underline ties the bottom edge together. The result is deliberately more aggressive and compact in silhouette than 01.

The heavier bevels suit a large title-screen lockup. For small navigation placements, the calmer 01 treatment remains easier to read; this is a title-logo proposal, not a finished favicon system.

## Files

- `overdrive.svg`: editable, transparent vector master. Letterforms, outlines, extrusion, and bevel bands are paths; there are no fonts or embedded raster images.
- `overdrive@2x.png`: transparent 2880 × 1720 PNG.
- `overdrive-preview.png`: dark-background preview.
- `overdrive-mono.svg`: simplified one-colour silhouette with a knockout NEW tab.
- `appearance-check.png`: light/dark, monochrome, and 320-pixel-wide checks.
- `build_logo.py`: editable construction source, using Python and Shapely.
- `prompt.txt`: the art-direction brief used for the unsuccessful image-generation attempt.

## Provenance and verification

The final artwork is code-authored by Codex. The explicitly authorized Image API fallback was attempted with the approved 01 image as a reference, but returned `credit_balance_exhausted`; it produced no artwork. No API-generated content or credential is included in these files.

01 supplied the visual quality and colour benchmark. New letter contours, the elongated F and terminal R, dimensional bands, and swept baseline were drawn for this alternative. The original 01 files and game source assets remain unchanged.

Rendered using isolated Playwright/Chromium and visually inspected on light and dark backgrounds, in one colour, and at 320 pixels wide. An independent visual review identified small contour intersections between the two text rows; spacing was adjusted to remove them. SVG XML and PNG transparency were checked. No game integration was changed.
