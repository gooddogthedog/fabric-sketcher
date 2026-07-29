# Fabric Sketcher — Post-Checkpoint-A Roadmap

- Status: Approved order; awaiting written-spec review
- Date: 2026-07-29
- Parent product specification:
  `docs/superpowers/specs/2026-07-20-fabric-sketcher-product-design.md`
- Parent milestone design:
  `docs/superpowers/specs/2026-07-28-foundation-sketching-loop-design.md`
- Visual north star:
  `docs/design/concepts/editor-landscape-approved.png`

## 1. Purpose

This document records where the product stands after Checkpoint A of the
Foundation Sketching Loop and fixes the order of the next five development
goals. It is a sequencing decision, not a system design. Each goal receives its
own implementation plan when it is reached.

## 2. Verified Current State

Verified on 2026-07-29 against the running development server and the full
quality suite.

### 2.1 Delivered

- Installable iPad-first PWA shell with a project gallery and an editor.
- Pointer pipeline distinguishing pen, touch, and mouse, using coalesced and
  predicted samples with palm rejection. Touch never paints.
- WebGL2 renderer with a visible Canvas 2D compatibility mode.
- Touch pan, zoom, and rotation through a matrix-owning viewport controller.
- IndexedDB append-only operation journal plus OPFS snapshots, with proven
  reload and crash recovery.
- Five procedural fabric brush presets (Pencil, Silk, Denim, Wool, Knit) with
  immutable per-stroke brush snapshots.
- Schema-version-2 Foundation guide with two credible front-view assets and the
  complete Checkpoint A control set: opacity, landmark groups, lock, move,
  scale, flip, hide, replace, and remove.
- Missing-asset containment: an unavailable pinned guide never blocks artwork.
- Automated suite: 291 tests across 28 files, green.
- Real-device acceptance: Checkpoint A passed on iPad with Apple Pencil,
  including Pencil drag on an unlocked guide, two-finger pinch-scale, and a
  physical stroke.

### 2.2 Not yet delivered

Checkpoints B, C, and D of the Foundation Sketching Loop are unstarted.
Specifically:

- No brush size, opacity, or color control. Five fixed presets only.
- No eraser. Undo is one-way stroke hiding with no redo.
- No stabilization, curve finishing, foundation symmetry, or canvas flip.
- No Settings surface. The gallery gear control only moves focus to the storage
  status text.
- No export pipeline. `FoundationState.includeInExport` is persisted but unused.
- Gallery tiles render a static blank sheet rather than a preview of the
  artwork.
- One artwork layer.

## 3. Sequencing Principle

The canvas can currently produce a mark but not a drawing worth keeping. Marks
cannot be erased, line weight and color are fixed, and no work can leave the
app. Goal 1 removes that block.

After that, the order takes the two cheapest large gains first — assistance,
then layers — and then builds depth on top of them: fabric materials, and
finally output. Checkpoint D content therefore lands later than the Foundation
Sketching Loop document sequenced it, so that export is written once against a
layered document containing material fills. This is a deliberate reordering, not
a change to what that checkpoint contains.

## 4. Approved Order

### Goal 1 — Essential correction controls (Checkpoint B)

Adds brush size, opacity, and color; a brush-shaped reversible eraser; redo; and
the movable quick-tool puck.

This allows a real garment sketch: fine linework and broad fabric passes in one
drawing, with mistakes corrected instead of whole strokes deleted.

It is first because it is the smallest change that turns the canvas from a
demonstration into a usable tool. `stroke.visibility-set` already carries a
`visible` flag, so redo is nearly free.

### Goal 2 — Deterministic drawing assistance (Checkpoint C)

Adds stabilization, intentional curve finishing, foundation symmetry across the
guide's transformed center line, canvas flip, and the global
`Drawing assistance` setting. This requires the Settings surface that the
gallery gear currently stands in for.

This allows an untrained hand to produce clean, symmetric garment lines.

It is second because it is the product's stated differentiator and the cheapest
large gain in perceived line quality. Symmetry depends on the foundation center
line that Checkpoint A established, so nothing blocks it. Shipping it here also
means that every stroke committed by the later goals is already shaped, so no
later goal has to be revisited to route its samples through a shaping stage.

### Goal 3 — Artwork layers

Adds a rough, linework, and color stack with per-layer opacity, visibility,
lock, and reorder. Erase becomes scoped to the active layer.

This allows the workflow that actually rescues a weak illustrator: sketch
loosely, fade the sketch, trace cleanly above it, and color beneath.

It is third because stroke operations already carry `layerId` and the Foundation
proved the compositing boundary, so the retrofit is cheap. Both remaining goals
assume layers exist.

### Goal 4 — First materials slice

Adds filling a bounded region with a fabric swatch clipped to a layer, with
scale, rotation, and opacity, plus importing a single photo swatch.

This allows a sketch to read as real fabric rather than flat color, which is the
capability no generic drawing app supplies.

It is fourth because it clips to the layers that Goal 3 introduces, and because
it reads best over the shaped linework that Goal 2 produces.

### Goal 5 — Export, gallery previews, and milestone hardening (Checkpoint D)

Adds PNG and transparent export with the guide excluded by default and
explicitly includable, real gallery thumbnails, and storage-quota and recovery
hardening.

This allows finished work to leave the app and gives the first honest read on
output quality.

It is last because it composites everything the preceding goals introduce.
Building export once, after layers and material fills exist, avoids building a
flat export path and then replacing it.

## 5. Cross-Goal Constraints

- The Goal 1 eraser is written as a layer-scoped reversible operation from the
  start, so Goal 3 changes the document schema without rewriting eraser
  persistence.
- Goal 1 leaves the stroke-commit path open to a sample-shaping stage rather
  than assuming that the samples reaching a commit are the raw pointer samples.
  Otherwise Goal 2 stabilization and curve finishing become a rewrite.
- Goal 5 export composites layers and material fills. No flat-only export path
  is shipped first.
- Each goal preserves warm paper `#F7F3EC`, cool field `#f2f1ef`, oxblood
  selection `#97251f`, restrained editorial chrome, the one-shelf rule, and at
  least 80% default artwork viewport ownership.
- Every visible interactive target remains at least 56 × 56 CSS pixels and
  VoiceOver-readable.
- No generative AI and no runtime network content is introduced.
- Existing projects remain readable across every schema change in this
  roadmap.

## 6. Explicitly Deferred

Beyond the scope of these five goals:

- Side and back foundations, adjustable body proportions, and pose rigging.
- Large foundation or template libraries.
- Groups, masks, and blend modes beyond the flat layer stack in Goal 3.
- Selections, lasso, warp, and liquify.
- Mesh warp, Follow Form, and directional fabric flow.
- Multi-board management and multi-view projects.
- Full radial-menu customization.
- PSD, OpenRaster, PDF, and timelapse export.
- Cloud synchronization and accounts.

## 7. Next Action

Write the implementation plan for Goal 1 only. Each subsequent goal is planned
when the preceding goal's checkpoint has been exercised in the browser and on
device.
