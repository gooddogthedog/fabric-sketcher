# Fabric Sketcher — Foundation Sketching Loop Design

- Status: Approved design; awaiting written-spec review
- Date: 2026-07-28
- Parent product specification:
  `docs/superpowers/specs/2026-07-20-fabric-sketcher-product-design.md`
- Visual north star:
  `docs/design/concepts/editor-landscape-approved.png`
- Primary platform: iPadOS
- Primary input: Apple Pencil

## 1. Purpose

This milestone turns Fabric Sketcher from a capable blank drawing surface into a
recognizable fashion-design tool for sewists whose garment ideas exceed their
illustration ability.

The experience should help a mediocre artist move an imagined garment onto the
page with credible proportion and enough control to explore silhouette,
materials, and details. The user remains the author. The software supplies
deterministic scaffolding and drawing assistance but does not generate or invent
the garment.

The completed loop is:

1. Open a blank design.
2. Add a credible fashion foundation.
3. Configure and lock the guide.
4. Sketch and refine a garment over it.
5. Hide the guide and judge the garment independently.
6. Reopen or export the work without losing its structure.

## 2. Locked Product Decisions

### 2.1 Authorial boundary

The app improves the user's ability, not her idea.

- No generative AI is included.
- No prompt-to-garment or automatic design completion is included.
- Assistance may stabilize input, mirror marks, or offer an intentional
  geometric refinement of the user's own stroke.
- Assistance never silently replaces, invents, or completes artwork.
- Raw drawing remains available through one global setting.

### 2.2 Workspace direction

A project will eventually contain a flexible collection of exploration, view,
detail, material, and presentation boards. This milestone implements one board
at a time and makes its data model compatible with later multi-board projects.
It does not add board-management UI.

### 2.3 Foundation direction

The foundation is a first-class non-destructive guide object. It is not a
flattened reference image, ordinary paint stroke, or parametric body rig.

The model must support future front, side, and back foundation sets without
requiring this milestone to ship those views.

## 3. User Experience

### 3.1 Entry

`New blank design` continues to open the canvas immediately. There is no setup
wizard or mandatory foundation choice.

In a new untouched project, the Layers edge handle gives one restrained,
one-time pulse. Opening it reveals only:

- Artwork.
- Foundation — None.
- Add foundation.

No empty groups, masks, blend modes, or future layer controls are shown.

### 3.2 Add a foundation

`Add foundation` opens a compact visual picker inside the Layers shelf. The
initial milestone contains one coordinated front-view foundation set:

1. A neutral, anatomically proportionate full-body figure.
2. A matching professional dress-form torso.

Choosing either foundation places it centered beneath Artwork, locked and faded
to a useful tracing opacity. The user can begin drawing immediately.

### 3.3 Configure a foundation

When a foundation is selected, the Layers shelf exposes:

- Figure or dress-form choice.
- Opacity.
- Show or hide landmark groups.
- Lock or reposition.
- Scale.
- Horizontal flip.
- Hide.
- Include in export, off by default.
- Mirror drawing across the transformed center line.

Unlocking the foundation shows one restrained transform boundary. Pencil or
touch can reposition and scale it. Locking dismisses the transform boundary and
returns Pencil completely to drawing.

Foundation controls are contextual and do not remain over the artwork.

### 3.4 Draw and refine

The Brushes shelf exposes:

- Live stroke preview.
- Brush preset.
- Size.
- Opacity.
- Color.
- Stabilization.
- Five recent colors.
- Reset to the selected preset's calibrated defaults.

Pencil, Silk, Denim, Wool, and Knit describe material behavior rather than fixed
colors. Color changes preserve the selected brush's characteristic texture.

A small movable quick-tool puck provides:

- Current brush.
- Eraser.
- Undo.
- Redo.
- Current color.

This puck establishes the stable center of the final north-star radial menu
without implementing its full customization in this milestone.

### 3.5 Hide and judge

The user can hide the foundation at any time. Hiding, replacing, moving, or
removing a foundation does not move or alter existing artwork.

The foundation is excluded from export by default. The user may explicitly
include it when exporting a process image or annotated design sheet.

## 4. Deterministic Drawing Assistance

### 4.1 Global setting

Settings contains one control:

`Drawing assistance: On / Off`

It defaults to On.

Turning assistance Off disables stabilization, curve finishing, and foundation
symmetry together. It does not disable pressure, tilt, erasing, color, undo,
redo, or canvas flip because those are direct input and editing tools.

Individual assistance toggles are intentionally deferred.

### 4.2 Stabilization

Stabilization reduces high-frequency hand wobble while preserving the intended
path. The Brushes shelf exposes one strength control when assistance is On.

Stabilization does not snap a line to a garment component or invent geometry.

### 4.3 Curve finishing

Holding briefly at the end of a stroke offers a smoother geometric version of
that same path. Normal Pencil lift commits the raw or stabilized stroke without
curve finishing.

The refined preview appears before commit. The user may accept it by completing
the hold gesture or reject it by resuming movement or lifting before the hold
threshold.

### 4.4 Foundation symmetry

When enabled, confirmed and predicted samples preview simultaneously on both
sides of the foundation's transformed center line.

The original and mirrored marks:

- Commit as one undoable action.
- Preserve the same brush snapshot.
- Recover together after reload.
- Remain ordinary independent artwork after commit.

The center line is sampled for each new stroke. Moving the foundation later
does not reposition previously mirrored artwork.

### 4.5 Canvas flip

Canvas flip mirrors the rendered view temporarily for proportion checking. It
does not mutate document coordinates, foundations, strokes, or exports.

## 5. Eraser and Edit Semantics

The eraser uses the selected brush tip's size, pressure, and texture behavior.
It writes a reversible eraser operation rather than destructively modifying
stored stroke samples.

Undo and redo operate on user actions:

- One ordinary stroke is one action.
- One mirrored stroke pair is one action.
- One eraser contact is one action.
- One accepted foundation transform is one action.

Changing a foundation does not merge guide state into artwork history.

## 6. Board and Foundation Data Model

Each board is conceptually structured as:

```text
Board
├── Foundation guide
└── Artwork layers
```

This milestone may continue rendering one Artwork layer, but Foundation and
Artwork must have distinct persistence and rendering boundaries.

### 6.1 Foundation state

A saved Foundation stores:

- Stable foundation asset ID.
- Pinned asset version.
- Foundation type.
- Transform matrix.
- Center-line geometry in asset coordinates.
- Opacity.
- Visibility.
- Visible landmark groups.
- Lock state.
- Export inclusion.
- Symmetry state.

The global Drawing assistance preference is user-level state. The board stores
whether foundation symmetry was selected, but symmetry has no effect while the
global preference is Off.

### 6.2 Foundation content

Foundation assets are authored as scalable vector line groups. At minimum, the
content model distinguishes:

- Body or form contour.
- Center front.
- Shoulder reference.
- Bust level.
- Waist level.
- Hip level.
- Armhole reference.
- Princess lines.
- Side seam or balance reference.

The full-body figure may omit dress-form-only construction lines. The matching
dress form exposes all applicable landmarks.

### 6.3 Artwork independence

Committed strokes store document-space samples. They do not retain a live
dependency on the foundation transform.

Mirrored operations retain the center-line transform used at commit only for
recovery and auditability. They do not recompute when the foundation changes.

## 7. Foundation Content Quality

Both initial assets must be:

- Anatomically and proportionally credible.
- Neutral in posture and suitable for many silhouettes.
- Quiet enough to trace over.
- Crisp at deep zoom.
- Visually compatible with the north-star illustration.
- Usable without a face, hairstyle, skin rendering, or decorative styling.

The full-body figure uses realistic human proportions rather than an extremely
elongated runway croquis. The dress form uses professional fitting landmarks
and must not be represented as a generic display mannequin.

Content quality is a release gate. A mediocre foundation asset cannot be
compensated for by a larger library.

## 8. Rendering and Data Flow

The renderer composites in this order:

1. Paper.
2. Visible Foundation vector groups.
3. Artwork.
4. Active drawing and eraser previews.
5. Temporary selection or transform chrome.

Foundation geometry is transformed into document space before rendering. Its
center line feeds symmetry in document space. Viewport pan, zoom, rotation, and
flip affect presentation only.

Brush customization produces an immutable brush snapshot at Pencil-down.
Changing brush controls during an active contact affects only the next contact.

The store journals completed artwork operations and accepted foundation
changes. Transient transforms, rejected curve previews, predicted samples, and
temporary canvas flip state are never persisted as artwork.

## 9. Reliability and Failure Handling

- Every accepted foundation change is durable before the project reports
  `Saved on this iPad`.
- Reload restores the exact foundation, transform, landmark visibility,
  assistance state, and artwork once.
- A missing or damaged foundation asset never prevents artwork from opening.
- The app reports the unavailable guide and offers Restore or Replace.
- Replacing a missing foundation does not alter artwork.
- A failed foundation save keeps the in-memory state visible, reports the
  failure, and supports retry using the existing durability model.
- Turning Drawing assistance Off during an active contact affects the next
  contact only.
- Losing Pencil capture cancels uncommitted original and mirrored previews
  together.

## 10. Accessibility and Input

- Every shelf and Settings control remains available as a native,
  VoiceOver-readable DOM control.
- Every visible control has at least a 56 × 56 CSS-pixel target.
- Pencil draws or performs a precise transform.
- Touch operates shelves and foundation transforms and navigates the canvas.
- Left-handed layout preserves the same control names and behaviors.
- Drawing assistance state is communicated by text and control state, not color
  alone.
- Hardware Pencil gestures may accelerate visible commands but are never
  required.

## 11. Testing and Acceptance

### 11.1 Automated coverage

Tests must prove:

- Foundation state round-trips through repository snapshots and operation
  recovery.
- Artwork opens when the referenced foundation asset is unavailable.
- Hiding, replacing, or transforming a foundation does not mutate existing
  stroke coordinates.
- Brush size, opacity, color, and stabilization are captured at Pencil-down.
- Eraser contacts persist and recover without rewriting stroke samples.
- Mirrored pairs preview, commit, undo, redo, and recover as one action.
- Moving the foundation after a mirrored commit does not move the artwork.
- Assistance Off bypasses stabilization, curve finishing, and symmetry.
- Changing the global setting during a contact affects the next contact.
- Predicted samples and rejected curve previews never enter durable operations.
- Canvas flip does not mutate persisted coordinates.
- Existing projects without Foundation state still open unchanged.

### 11.2 Real-device acceptance

On a supported iPad and Apple Pencil:

1. Create a design over the LAN and as an installed Home Screen app.
2. Add and configure both initial foundations.
3. Reposition and lock a guide with touch and Pencil.
4. Draw raw, stabilized, curve-finished, and mirrored marks with varying
   pressure.
5. Erase, undo, and redo each action type.
6. Hide the guide and inspect the garment alone.
7. Reload and confirm exact recovery.
8. Export with the guide excluded and included.
9. Repeat with Drawing assistance Off.

Synthetic pointer automation is not accepted as a substitute for this hardware
check.

### 11.3 Milestone success

The milestone succeeds when a mediocre illustrator can produce a proportionate,
recognizable garment concept over a credible foundation, hide the guide, and
feel that the resulting idea came from her rather than from the software.

## 12. Delivery Checkpoints

The milestone is large enough to require usable vertical checkpoints. Work must
not remain invisible until every assistance feature is complete.

### Checkpoint A — Traceable fashion foundation

- Layers shelf with Foundation and Artwork.
- Both initial front-view assets.
- Add, fade, show landmarks, lock, move, scale, flip, hide, and persist.
- Existing Pencil and fabric brushes draw above the guide.
- Reload and missing-asset recovery pass.

This is the first user-visible checkpoint and the highest-priority next slice.

### Checkpoint B — Essential correction controls

- Brush size, opacity, and color.
- Brush-shaped eraser.
- Undo and redo.
- Minimal quick-tool puck.
- Reopen and recover customized brush and eraser operations.

### Checkpoint C — Deterministic drawing assistance

- Stabilization.
- Intentional curve finishing.
- Foundation symmetry.
- Canvas flip.
- Global Drawing assistance setting.

### Checkpoint D — Milestone hardening

- Export foundation exclusion and explicit inclusion.
- Complete recovery, compatibility, accessibility, and performance gates.
- Real iPad and Apple Pencil acceptance.
- Final north-star visual calibration.

The development server is reloaded at every checkpoint so the user can exercise
new functionality before the next slice begins.

## 13. Explicitly Deferred

- Adjustable body proportions.
- Pose rigging.
- Side and back foundations.
- Large foundation or template libraries.
- Multiple paint layers, groups, masks, and blend modes.
- Garment component libraries.
- Lasso, warp, liquify, and selection transforms.
- Fabric-region application and mesh warp.
- Multi-board management.
- Full radial-menu customization.
- Individual Drawing assistance toggles.
- Generative AI.

## 14. North-Star Constraints

The milestone must preserve:

- Warm paper as the dominant drawing surface.
- Restrained editorial chrome.
- Edge-anchored contextual shelves.
- At least 80% default viewport ownership by artwork.
- Oxblood selection accents and fine neutral rules.
- No desktop toolbar, floating-card dashboard, feature feed, or permanent
  onboarding panel.
- No implementation shortcut that rasterizes north-star UI or sample artwork
  into the product.
