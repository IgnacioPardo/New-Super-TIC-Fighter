# Overdrive — refined identity family

Refinement of the owner's selected direction 02, 11 October 2026. The original 01 and 02 masters are preserved in their existing folders.

## Design

The primary keeps 02's rising silhouette, extended F, sweeping R and dimensional lettering. It borrows restraint from 01 through more even spacing, a smaller NEW badge, fewer edge details and smoother colour transitions. One directional bevel and continuous depth retain the arcade character; the primary is deliberately more dimensional than the compact version.

The underline is a shallow, tapered curve. Its gradual rise replaces the original low middle and late upturn, and it ends before the R's descending terminal. The two top accent bars retain the lettering's approved slope and lean.

## Choose the version for the placement

| Asset | Intended placement | Starting minimum |
| --- | --- | --- |
| `overdrive-primary.svg` | Game title, website hero, cover artwork | 320 CSS px wide; prefer 480+ |
| `overdrive-compact.svg` | Smaller full-name title; no bevel, depth, underline or accent bars | 240 CSS px wide |
| `overdrive-horizontal.svg` | Header / narrow strip; deliberately shortened to TIC FIGHTER | 160 CSS px wide |
| `overdrive-icon.svg` | App tile, profile, header button | 32 px square |
| `overdrive-icon-micro.svg` | Browser tab and very small UI; separately redrawn flat mark | 16–24 px square |
| `overdrive-mark.svg` | Bare symbol for loading/pause and supporting brand details | 32 px square |
| `overdrive-flat.svg` | Flat-colour reproduction, restricted printing or simpler large treatment | Same proportions as primary |
| `overdrive-mono-dark.svg`, `overdrive-mono-light.svg` | Single-colour positive/reverse reproduction | Confirm the smallest accent on a print proof |
| `overdrive-mark-mono.svg` | Small single-colour symbol | Confirm on a print proof |

These minima are visual recommendations from the included renders, not formal readability research. At smaller widths, change asset rather than shrinking the full title. The standalone F is a supporting symbol: show it alongside the name when introducing the identity.

Every named SVG has a corresponding transparent PNG where relevant. Wordmark PNGs are 2400 px wide; the horizontal PNG is 1600 px wide. SVG lettering consists of paths and requires no installed fonts. `overdrive-polished.svg` and its previews use the presentation canvas; `overdrive-primary.svg` has a tight padded viewBox for placement.

## Web and app exports

- Icon PNGs: 16, 24, 32, 48, 64, 128, 180, 192, 512 and 1024 px.
- 16 and 24 px use the simplified micro drawing; larger sizes use the full icon.
- `favicon.ico` contains separate 16, 32 and 48 px images.
- The 180 px touch icon has an opaque background.
- `overdrive-icon-maskable-512.png` has a full-bleed background and the symbol within the central safe area. Use it only for a maskable slot; use the regular icon for other placements.
- `use-cases-social-card.png`: 1200 × 630 social/link preview.
- `use-cases-avatar-circle.png`: 512 × 512 circular crop with transparent corners.

Suggested markup after copying the chosen assets to a public `/brand/` directory:

```html
<link rel="icon" href="/brand/favicon.ico" sizes="16x16 32x32 48x48">
<link rel="icon" href="/brand/overdrive-icon-micro.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="/brand/overdrive-icon-180.png">
```

Use `alt="New Super TIC Fighter"` for identifying wordmarks; use empty alt text when the same name is already next to the logo. Icon-only links/buttons need the full accessible name. Keep the full product name in the page title even where the short header signature is used.

## Placement rules

- Leave clear space of approximately one NEW-badge height around the primary. The exported viewBox's padding is not a substitute for layout margins.
- Preserve aspect ratio. The main artwork already includes its rise and depth; do not add CSS rotation, skew, stroke, glow or another drop shadow.
- Keep the contained NEW badge. Remove any separate NEW stamp when integrating.
- Use the dark outer boundary to separate the full-colour artwork on light backgrounds. Choose dark monochrome on light surfaces and white monochrome on dark surfaces.
- The header signature is a deliberate abbreviation, not the full product name.
- Let the primary own the title/menu screen. Use the small symbol quietly in loading/pause and supporting results placements. Preserve the combat HUD's space for fighters, damage, stocks and timer.
- For a busy image background, place the logo on a quiet portion or a solid dark backing. Do not add a new border treatment.

The application now uses the primary on the intro and title, the horizontal signature in desktop headers, and the icon in mobile headers. The separate `.brand-new` and `.new-stamp` labels and additional CSS rotation/shadow were removed during integration. The title artwork slot retains its previous dimensions so the fighter group and menu keep their positions. Browser/touch icons, link-preview metadata and the repository banner also use this family. Run `python3 scripts/import-branding.py` to publish unchanged masters and update provenance; the historical logo remains preserved. The NES artwork is a separate concept, not part of this integration.

## Core colour references

| Role | sRGB |
| --- | --- |
| Ink / main background | `#10121B` |
| Deep blue outline | `#071C32` |
| Flat blue | `#1BABE8` |
| Pink | `#F23899` |
| Ice white | `#F5FAFF` |

The primary also uses gradients and directional bevel colours. Use the SVG master rather than recreating those by eye. Screen colours are not press separations; proof physical production with the actual material and process.

## Presentation and verification

Open `showcase-brand-system.html` for the self-contained responsive presentation. `showcase-system.png` shows the identity family; `use-cases-board.png` shows desktop/mobile web, the existing game title layout, loading/pause concepts, social, avatars and a monochrome shirt placement. `before-after.png` compares the original 02 and current primary.

The owner explicitly retained the existing title-screen layout. `use-cases-current-title.png` captures the actual current app with only its hero logo replaced in an isolated browser DOM. Its original poster, menu, fighter group and tagline positions/sizes were measured before and after and remained unchanged; the comparison is saved in `title-placement-verification.json`. The old separate NEW stamp and extra CSS rotation/shadow were suppressed for that preview because those treatments are already inside the new artwork. No application source was edited. The other application screens and merchandise are proposed usage mockups, not implemented screens or physical samples. The original fighter layers and arena remain unchanged.

Rendered and visually reviewed on dark/light backgrounds, in one colour, at 320 px canvas width, and with small icon exports. The presentation was checked for horizontal overflow at desktop and 390 px widths. An independent visual review caught and verified repairs to the underline/R intersection in colour and monochrome. SVG XML, transparent PNG bounds, favicon entries and archive integrity were checked. No unit tests or game changes were involved.

All new logo geometry is code-authored vector work. No Image API or paid service was used for this refinement.

## Regenerate

From the repository root, use a Python environment containing Shapely and Pillow, then the project's Playwright dependency:

```sh
python docs/logo-concepts/02-overdrive/polished/build_logo.py
node docs/logo-concepts/02-overdrive/polished/render.mjs
node docs/logo-concepts/02-overdrive/polished/capture_current_title.mjs
node docs/logo-concepts/02-overdrive/polished/build_showcase.mjs
python docs/logo-concepts/02-overdrive/polished/package_brand.py
```

The title capture expects the existing app at `http://127.0.0.1:5173`, or the URL in `STF_APP_URL`. Other exports can be regenerated without the app; the showcase can reuse the saved title capture.
