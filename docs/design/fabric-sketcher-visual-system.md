# Fabric Sketcher Visual System

- Status: Approved
- Approval date: 2026-07-20
- Primary viewport: iPad landscape, 4:3
- Native reference size: 1448 × 1086
- Editor reference: `docs/design/concepts/editor-landscape-approved.png`
- Gallery reference: `docs/design/concepts/gallery-landscape-approved.png`

## Product Character

Fabric Sketcher is a serious drawing studio with a restrained fashion-editorial character. The document and the user's marks are visually dominant. Chrome should feel precise and tactile without becoming a desktop toolbar or a collection of floating cards.

## Color Lock

| Token | Value | Role |
|---|---:|---|
| `--color-document` | `#f7f3ec` | Warm paper document only |
| `--color-app` | `#f2f1ef` | Cool stone application field |
| `--color-surface` | `#fbfaf8` | Shelves and quiet controls |
| `--color-ink` | `#262421` | Primary text and icons |
| `--color-muted` | `#68645f` | Dates, status, secondary labels |
| `--color-line` | `#d3cfca` | Fine dividers and thumbnail borders |
| `--color-accent` | `#97251f` | Selection, primary action, active control |
| `--color-accent-hover` | `#7f1f1b` | Pressed and hover state |
| `--color-focus` | `#b23b33` | High-visibility focus outline |

Do not add purple or blue SaaS gradients, glass tints, glows, or decorative washes. The warm paper color belongs to artwork and project sheets; the surrounding app remains cooler and more neutral.

## Typography

- Editorial display: `"Iowan Old Style", "Baskerville", "Times New Roman", serif`.
- Interface: `-apple-system, BlinkMacSystemFont, "SF Pro Text", "Helvetica Neue", sans-serif`.
- Product mark: display family, 38–44 px landscape.
- Gallery heading: display family, 32–36 px.
- Project title: display family, 25–30 px.
- Editor project title: display family, 25–30 px.
- Primary action: interface family, 20–22 px, weight 500.
- Tool and shelf labels: interface family, 14–17 px, weight 500.
- Dates and status: interface family, 13–15 px, weight 400.
- All interactive controls receive an explicit font size and line height.

## Spacing and Geometry

- Base spacing unit: 4 px.
- Page gutter: 40–44 px in landscape; 20–24 px in portrait.
- Minimum target: 56 × 56 CSS px.
- Fine rule: 1 px neutral line.
- Standard control radius: 6 px.
- Project sheet radius: 4 px; it should read as paper, not a card.
- Shelf radius: 12 px on exposed corners.
- Primary button radius: 6 px.
- Shadows are rare and diffuse; borders and tonal separation do most of the work.
- The default editor preserves at least 80% visible canvas area.

## Container Model

- Gallery: open editorial grid, not cards inside a containing card.
- Project tile: artwork sheet, then title and date directly beneath it.
- Editor: full-bleed canvas field with a centered warm-paper document.
- Shelves: narrow overlays anchored to an edge; they never resize the document.
- Radial menu: one movable command surface, not a family of unrelated floating controls.
- Only one shelf may be open.

## Approved Visible Copy

### Gallery

- `Fabric Sketcher`
- `New blank design`
- `Recent designs`
- `Select`
- `Linen Wrap Study`
- `Bias Evening Dress`
- `Utility Jacket`
- `Soft Tailoring`
- `Woven Tote`
- `Summer Set`
- `Your work is saved on this iPad.`

### Editor

- `Linen Wrap Study`
- `Saved on this iPad`
- `Brushes`
- `Layers`
- `Views`
- `Materials`
- `Studio Pencil`
- `Size`
- `Opacity`

No slogan, onboarding explanation, promotional copy, subscription prompt, badge, metric, search field, or hero eyebrow may be added above the fold.

## Component Families

- `AppHeader`: quiet top rule, product or project title, no desktop menu bar.
- `PrimaryAction`: oxblood filled button with plus icon and visible pressed state.
- `ProjectTile`: artwork, title, date, focus/selection outline.
- `EdgeShelfHandle`: vertical label, optional drag affordance, 56 px target.
- `EdgeShelf`: fine border, surface fill, restrained controls.
- `RadialMenu`: brush, eraser, color, size, undo, redo.
- `RangeControl`: minus, track, thumb, plus, numeric value.
- `SaveStatus`: text-first and never styled as a badge.

## Icon Inventory

Icons use custom or matching system SVGs with round caps, approximately 1.75 px strokes at 24 px, `currentColor`, and optical centering.

- Gallery: plus, settings.
- Editor header: back, overflow.
- Shelf: close, drag affordance, control settings.
- Radial menu: brush, eraser, color, size, undo, redo.

Text glyphs must not substitute for these icons.

## Responsive Continuation

- Landscape uses a three-column gallery and edge-anchored editor chrome.
- Portrait uses a two-column gallery, then one column when width requires it.
- Gallery title and primary action retain hierarchy rather than shrinking into a dense toolbar.
- Editor shelves retain logical edge placement and respect safe-area insets.
- Left-handed mode mirrors Brushes and Materials without changing their names.
- No horizontal page overflow is permitted.

## Motion

- Shelf open/close: 180–240 ms, interruptible.
- Control presses: 90–140 ms.
- Project opening may use a restrained paper-scale transition.
- Honor `prefers-reduced-motion` with immediate state changes.

## Artwork Treatment

The artwork inside the concepts demonstrates fashion-sketching quality; it is not app chrome. Initial implementation may show an empty gallery or user-created drawings until real project thumbnails exist. Never rasterize UI text or controls from the concepts into the product.

## Fidelity Gates

- The primary action, product mark, editorial grid, paper treatment, chrome density, and oxblood accent match the gallery reference.
- Default zoom, document framing, shelf density, radial control, and save-status placement match the editor reference.
- UI controls remain code-native and functional.
- Empty or loading states use the same open container model and do not introduce filler cards.
