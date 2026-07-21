# Fabric Sketcher — Product and Experience Specification

- Status: Approved and finalized
- Date: 2026-07-20
- Primary platform: iPadOS Home Screen web app
- Primary input: Apple Pencil
- Intended audience: Intermediate hobbyist fashion designers and sewists
- Visual direction: Immersive canvas with contextual edge shelves

## 1. Executive Summary

Fabric Sketcher is a drawing-first fashion illustration and garment-mockup studio for iPad. It helps intermediate hobbyists move from an idea to a polished, believable fashion concept without repeatedly sourcing croquis, rebuilding fabric effects, or reconstructing the same project organization in generic drawing software.

The canvas is the product. Templates, dress forms, fashion components, fabrics, references, and guides accelerate drawing, but they do not define or constrain the garment. The user's artwork is always the source of truth.

The interface uses four contextual edge shelves—Brushes, Layers, Views, and Materials—while preserving at least 80% of the default viewport for the artwork. Only one shelf may be open at once. A movable radial menu keeps the most common Pencil actions close to the drawing hand.

The product deliberately excludes pattern drafting, printable sewing patterns, 3D garment simulation, parametric garment construction, and desktop-first workflows.

## 2. Product Thesis

### 2.1 User problem

Intermediate hobbyists fall into a gap between two product categories:

1. Generic drawing apps provide excellent brushes and editing, but users must repeatedly find croquis, assemble fashion references, create fabric brushes and masks, and rebuild palettes and layer structures.
2. Fashion-specific apps reduce the blank-page problem, but often provide a shallower drawing experience, overwhelming content libraries, restrictive access models, or weak file reliability.

The missing product is not simply a larger template library. It is a high-quality drawing studio that remembers the fashion context of a project from beginning to end.

### 2.2 Core promise

> Start with as much or as little structure as desired, draw without constraint, and finish with a convincing fashion concept whose views, fabrics, colors, references, and history remain organized throughout the project.

### 2.3 Jobs to be done

Users should be able to:

- Capture a clothing idea immediately without first drawing anatomy.
- Sketch freely over a body, croquis, dress form, garment, accessory, photograph, or blank page.
- Create expressive illustrations and clean technical-looking flats in the same project.
- Apply fabric, prints, texture, transparency, sheen, and directional flow without a complicated multi-app process.
- Keep front, side, back, detail, moodboard, and colorway canvases consistent without mechanically synchronizing their artwork.
- Recover experiments and earlier variations without destructive duplication or flattening.
- Export presentation-ready and editable results while retaining ownership of the source project.

## 3. Scope

### 3.1 In scope

- Natural Apple Pencil drawing and painting.
- High-resolution raster canvases.
- Layers, masks, selections, transforms, liquify, guides, and deep undo.
- At least 1,000 fashion template sets.
- Anatomically accurate bodies, croquis, and professional dress forms.
- Garment, shoe, bag, jewelry, accessory, and fashion-component libraries.
- Fabric import, seamless repeat, clipping, flow, scale, recoloring, and warp.
- Multi-view and multi-board projects.
- Moodboards and floating references.
- Project-level palettes, fabrics, brushes, templates, and references.
- Local-first autosave, crash recovery, named versions, offline use, and optional cloud synchronization.
- High-resolution, layered, transparent, printable, and video exports.

### 3.2 Explicitly out of scope

- Pattern drafting, grading, seam allowances, and printable sewing patterns.
- Construction blueprints and automated sewing instructions.
- 3D cloth simulation or virtual try-on.
- Parametric garment assembly.
- Generative-AI garment creation or a persistent AI assistant.
- Marketplace, social feed, or collaboration for the initial release.
- Desktop optimization or desktop interaction parity.

## 4. Audience

### 4.1 Primary user

An intermediate hobbyist who:

- Has sewing or fashion knowledge but limited formal illustration training.
- Understands garment vocabulary and basic fabric behavior.
- Wants more control than a template configurator offers.
- May use Procreate, Adobe Fresco, Pinterest, Photos, and paper references today.
- Values expressive authorship and does not want the app to design on their behalf.
- Works primarily on an iPad with Apple Pencil.

### 4.2 Secondary users

- Fashion students.
- Costume and cosplay designers.
- Stylists and wardrobe planners.
- Independent fashion illustrators.
- Experienced sewists exploring original garments visually.

## 5. Product Principles

1. **The canvas is sovereign.** At least 80% of the default viewport belongs to the artwork.
2. **Artwork is the source of truth.** No garment object or template owns the user's design.
3. **Templates are references, not rules.** Every inserted asset can be transformed, faded, hidden, erased, painted over, or converted into ordinary artwork.
4. **Fashion intelligence is optional.** Fabric flow, anatomy landmarks, symmetry, and garment-detail aids may always be ignored or disabled.
5. **Power appears in context.** The interface exposes the controls relevant to the current tool or selection.
6. **Every action is reversible.** Experimentation is protected by masks, snapshots, history, and undo.
7. **Project context persists.** Views share a project kit without synchronizing their marks.
8. **Work remains accessible.** Existing projects stay readable and exportable regardless of subscription status.
9. **Reliability is visible.** Saving, synchronization, storage, and recovery state are never hidden.
10. **Hardware gestures are enhancements.** Every function remains available through visible controls.

## 6. Information Architecture

### 6.1 Primary surfaces

- Project gallery.
- Drawing canvas.
- Brushes shelf.
- Layers shelf.
- Views shelf.
- Materials shelf.
- Template and reference browser.
- Export sheet.
- Settings and gesture preferences.

### 6.2 Project data hierarchy

```text
Account or local profile
└── Project
    ├── Project kit
    │   ├── Palettes
    │   ├── Fabrics and materials
    │   ├── Favorite brushes
    │   ├── Templates and dress forms
    │   ├── References
    │   └── Export presets
    ├── Boards
    │   ├── Front view
    │   ├── Side view
    │   ├── Back view
    │   ├── Three-quarter view
    │   ├── Detail canvas
    │   ├── Technical flat
    │   ├── Moodboard
    │   └── Colorway or exploration
    ├── Layer trees
    ├── Imported assets
    ├── Operation journal
    └── Named versions
```

## 7. End-to-End User Experience

### 7.1 Start or resume

The opening gallery prioritizes:

1. Continue the most recent project.
2. Recover an interrupted session.
3. Start a blank project.
4. Start from a body, dress form, garment, accessory, or saved project kit.

The gallery does not place a promotional feed, store, or content marketplace ahead of the user's work.

Each project tile shows:

- Latest preview.
- Project name.
- Last edited time.
- Local and cloud save state.
- Number of boards.
- Recovery or storage warning when applicable.

### 7.2 Create a project

The user chooses only:

- Canvas preset or custom size.
- Blank, body, croquis, dress form, garment, accessory, or personal template.
- Optional front/side/back board set.

The project opens immediately after these choices. A forced setup wizard is not used.

### 7.3 Establish a foundation

Foundations include:

- Blank paper.
- Fashion croquis.
- Anatomically accurate body.
- Professional dress form or fitting mannequin.
- Garment, shoe, bag, jewelry, or accessory guide.
- Imported photograph, scan, or personal template.

A foundation may be inserted as:

- Locked underlay.
- Editable normal layer.
- Trace-only non-exporting guide.
- Floating reference.
- Reusable personal template.

### 7.4 Sketch

The default canvas displays only:

- Artwork.
- Four edge-shelf handles.
- Compact project name and save state.
- Movable radial Pencil menu.

Pencil draws. Touch navigates or operates the interface according to the user's finger-action preference.

### 7.5 Refine

The user can:

- Ink and clean rough lines.
- Select, move, distort, warp, or liquify regions.
- Fill bounded regions.
- Clip colors and materials.
- Add shadows, highlights, transparency, and texture.
- Add or trace fashion details.
- Compare silhouette, value, and mirrored views.

Fashion components may be inserted as new editable layers, stamps, or guides. They never become locked parametric garment parts.

### 7.6 Apply materials

The user opens the bottom Materials shelf, chooses a library or imported fabric, and applies it to a selection, layer, or mask.

The material remains editable through:

- Scale.
- Rotation.
- Offset.
- Repeat style.
- Directional flow.
- Perspective or mesh warp.
- Recoloring.
- Opacity, contrast, sheen, grain, and softness.
- Paint and erase operations on the resulting layer or mask.

### 7.7 Add related views

The top Views shelf contains front, side, back, three-quarter, detail, flat, moodboard, and colorway boards.

All boards share the project kit. Artwork is never automatically synchronized.

The user can:

- Duplicate a board.
- Create a colorway from a named version.
- Apply a palette or fabric from another board.
- Compare two boards side by side.
- Overlay another board at low opacity.
- Review all views as small silhouettes.

### 7.8 Finish and export

The user can add:

- Labels.
- Freehand or typed notes.
- Callouts.
- Background paper.
- Presentation framing.
- Moodboard context.

Exports may include one board, selected boards, all views, or a composed collection sheet.

## 8. Primary Interaction Model

### 8.1 Edge shelves

The selected visual direction uses four inset edge handles:

- Left: Brushes.
- Right: Layers.
- Top: Views.
- Bottom: Materials.

Behavior requirements:

- Only one shelf may be open at once.
- Shelves support shallow, medium, and full positions.
- Dragging or tapping the handle opens a shelf.
- Tapping the canvas, swiping the shelf away, or choosing an item may collapse it.
- Handles remain inset from iPadOS system-gesture regions.
- Shelf gestures respond to touch and not active Pencil drawing.
- Left-handed mode mirrors Brushes and Layers.
- Handle positions may be adjusted within safe ranges.
- Shelf state is remembered per project and orientation.
- Opening or closing a shelf never changes artwork.

### 8.2 Radial Pencil menu

The movable radial menu contains:

- Current brush.
- Eraser.
- Undo or redo.
- Selection.
- Current color.
- Last-used tool.

Users may replace slots with preferred commands.

Apple Pencil hover, squeeze, double-tap, barrel roll, and related capabilities enhance the radial menu where browser feature detection confirms support. They are never required.

### 8.3 Default gestures

- Pencil: draw or operate precise controls.
- One finger: pan by default; configurable.
- Two fingers: pan, zoom, and rotate.
- Two-finger tap: undo.
- Three-finger tap: redo.
- Long press: sample color.
- Quick hold after a stroke: invoke shape correction when applicable.
- Touch shelf handle: open or resize shelf.

Gesture changes are available in Preferences and demonstrated in place.

## 9. Drawing Engine

### 9.1 Brush families

Launch brush families include:

- Graphite and colored pencil.
- Technical pencil.
- Fine liner and fashion ink.
- Marker and alcohol marker.
- Watercolor and wet wash.
- Gouache and opaque paint.
- Chalk and pastel.
- Airbrush.
- Smudge and fabric blender.
- Seam, topstitch, zipper, bead, sequin, embroidery, and trim brushes.
- Fabric grain and texture brushes.

### 9.2 Brush behavior

Supported inputs and properties:

- Pressure.
- Tilt.
- Altitude and azimuth when available.
- Velocity.
- Taper.
- Stabilization and streamline.
- Texture rotation and directional grain.
- Wet edge, buildup, glaze, opacity, and flow.
- Pencil barrel orientation when exposed by the platform.
- Per-brush finger and Pencil response.

Users can favorite brushes, create project brush sets, import the app's documented brush format, and build custom brushes. The default brush editor presents essential controls first and advanced controls in a secondary section.

### 9.3 Core drawing tools

- Brush.
- Eraser using any brush tip.
- Smudge using compatible brush behavior.
- Flood fill with adjustable gap tolerance.
- Drag-to-fill.
- Color picker.
- Clone and patch.
- Freehand, rectangular, elliptical, and automatic selection.
- Move, rotate, scale, skew, perspective, and freeform warp.
- Liquify: push, pinch, expand, twirl, reconstruct, and smooth.
- Quick lines, arcs, rectangles, ellipses, and shape correction.
- Horizontal, vertical, radial, and custom-axis symmetry.
- Measurement and proportion guides for illustration.
- Canvas flip, grayscale, silhouette, and value previews.

### 9.4 Canvas behavior

- Portrait and landscape iPad orientations.
- Pinch zoom and rotation.
- Reset rotation and fit-to-screen actions.
- Custom paper color and texture.
- Transparent background.
- Optional grid, ruler, perspective, symmetry, and anatomy overlays.
- Device-aware maximum dimensions and layer budget.
- Tile-based rendering to limit memory use.

## 10. Fashion Template System

### 10.1 Definition of a template set

A template set represents one distinct body, dress form, garment, shoe, bag, accessory, or component design. Applicable front, side, back, and three-quarter views belong to the same set and are not counted as separate templates.

The initial library contains at least 1,000 template sets.

### 10.2 Categories

- Bodies and croquis.
- Professional dress forms and fitting mannequins.
- Garments.
- Shoes.
- Bags.
- Jewelry and accessories.
- Sleeves.
- Collars and necklines.
- Cuffs.
- Pockets.
- Openings and closures.
- Hems and edge finishes.
- Trims, findings, and construction details.

### 10.3 Body representation

The body and croquis library covers:

- Multiple heights and proportions.
- Straight, curvy, petite, tall, and plus-size forms.
- Masculine, feminine, and androgynous forms.
- Adult, teen, child, and baby proportions.
- Standing, seated, walking, and selected dynamic poses.
- Diverse facial structures, skin tones, hairstyles, and mobility aids.

Stylized croquis are clearly distinguished from anatomically proportionate bodies.

### 10.4 Dress forms

Professional dress forms include accurate visual landmarks:

- Center front and center back.
- Bust, waist, and hip levels.
- Side seam.
- Princess lines.
- Neck and shoulder reference.
- Armhole and balance lines.
- Optional padding and proportion variations.
- Stand, tabletop, and torso-only variants.

Dress-form landmarks can be independently faded or hidden.

### 10.5 Template controls

- Scale, rotate, flip, skew, warp, and reposition.
- Line color and opacity.
- Lock, hide, erase, rasterize, or exclude from export.
- Save personal presets.
- Convert to ordinary artwork.
- Reuse across project boards.

### 10.6 Discovery

The library supports:

- Plain-language search.
- Category, view, pose, proportion, garment family, and silhouette filters.
- Recents and favorites.
- Personal libraries.
- Similar-shape results.
- Offline content pinning.
- Curated starter sets.

New content packs extend existing categories and do not add navigation items.

## 11. Materials and Fabric System

### 11.1 Material sources

- Built-in fabrics, patterns, textures, and trims.
- Camera and Photos.
- Files and scanned swatches.
- Cropped areas from reference images.
- User-created seamless repeats.

### 11.2 Repeat controls

- Automatic seamless-repeat suggestion with manual correction.
- Straight repeat.
- Half-drop.
- Brick.
- Mirrored.
- Custom repeat.
- Scale, rotation, offset, and spacing.

### 11.3 Garment rendering controls

- Apply to a selection, mask, or layer.
- Directional fabric flow.
- Editable perspective and mesh warp.
- Follow Form visual projection.
- Preserve texture while recoloring.
- Opacity and transparency.
- Contrast and tonal range.
- Sheen, grain, softness, and edge behavior.
- Paint, erase, smudge, or distort after application.

Follow Form suggests curvature from a guide or painted flow map. It is not physics simulation and never permanently modifies the source material.

### 11.4 Material presets

Launch presets include satin, silk, chiffon, organza, denim, wool, leather, suede, velvet, knit, jersey, lace, sequins, faux fur, canvas, and common technical fabrics.

Presets provide visual starting behavior rather than manufacturing claims.

## 12. Layers

Supported layer features:

- Raster paint layers.
- Groups and nested groups.
- Masks and clipping masks.
- Alpha lock.
- Reference layers.
- Guide-only non-exporting layers.
- Blend modes.
- Opacity and visibility.
- Lock and solo.
- Duplicate, merge, flatten, and clear.
- Rename, notes, and color tags.
- Drag reordering and multi-selection.
- Search by name or tag.
- Large, Pencil-friendly thumbnails.

Optional starter stacks include:

- Foundation.
- Rough Sketch.
- Linework.
- Base Color.
- Fabric.
- Shadow.
- Highlight.
- Notes.

Starter stacks remain fully editable and may be disabled globally.

## 13. Project Kit

Every project owns a persistent kit containing:

- Project palettes.
- Imported and library fabrics.
- Favorite and recent brushes.
- Templates and dress forms.
- Reference images.
- View settings.
- Paper and background settings.
- Export presets.

The project kit is shared across boards. It removes repeated setup without synchronizing or altering artwork.

## 14. Color

- HSL, RGB, and hexadecimal input.
- Accessible color names.
- Palette extraction from images and fabrics.
- Project, global, recent, and favorite palettes.
- Optional harmonies and tonal ramps.
- Drag-and-drop application to fills, layers, and swatches.
- Replace Color and Recolor Layer tools.
- Colorblind-safe labels and contrast previews.

## 15. References and Moodboards

References can float over the canvas, dock in a shelf, or occupy a dedicated board.

Supported actions:

- Import images, PDFs, screenshots, and camera captures.
- Crop, rotate, annotate, group, and reorder.
- Sample colors and material areas.
- Keep a reference visible while the drawing zooms or rotates.
- Pin references to one board or the complete project.
- Convert references into moodboard compositions.

Moodboards are board types, not a separate application mode.

## 16. Views and Variants

Supported board types:

- Front.
- Side.
- Back.
- Three-quarter.
- Detail.
- Technical flat.
- Moodboard.
- Freeform exploration.
- Colorway.

Supported workflows:

- Duplicate a board.
- Create a colorway from a named version.
- Apply a shared palette or fabric.
- Compare two boards.
- Overlay another view at adjustable opacity.
- Review boards at silhouette scale.
- Export a composed view sheet.

Artwork is never automatically synchronized between views.

## 17. History, Saving, and Ownership

### 17.1 Local-first saving

- Each completed stroke is appended to a local operation journal.
- Periodic document snapshots compact the journal.
- Save state is always visible: Saving, Saved locally, Syncing, Synced, or Attention needed.
- The local document remains usable when cloud services are offline.
- Interrupted sessions reopen to the latest journaled state.

### 17.2 Versioning

- Deep linear undo and redo during the session.
- Persistent history across app restarts.
- Named milestones.
- Branches for colorways and explorations.
- Visual version previews.
- Restore as a new branch rather than overwriting by default.

### 17.3 Cloud synchronization

- Optional account-based synchronization.
- Asset upload occurs after durable local save.
- Conflicts preserve both versions.
- Board-level forks are preferred to silent pixel merging.
- Synchronization status is visible at project and board level.

### 17.4 Ownership rules

- Native project backups may be downloaded at any time.
- Existing projects remain readable and exportable after a trial or subscription ends.
- Subscription changes never delete local or cloud projects.
- The app does not use private artwork to train models without explicit, separate opt-in consent.

## 18. Export

### 18.1 Formats

- PNG.
- JPEG.
- WebP.
- PDF.
- Transparent PNG or WebP.
- Native `.fsketch` project archive.
- OpenRaster for layered interchange.
- Layered PSD where the target feature maps safely to PSD.
- MP4 or compatible video for timelapse playback.

Unsupported PSD blend modes or effects trigger a clear compatibility warning and a choice to rasterize affected groups or cancel. Export never silently changes the source document.

### 18.2 Export scopes

- Current board.
- Selected boards.
- All views.
- Selected layers.
- Composed view sheet.
- Collection board.
- Timelapse.

### 18.3 Output controls

- Pixel dimensions.
- Print dimensions and DPI.
- Color profile when supported.
- Background transparency or paper.
- Crop marks and margins for presentation output only.
- File naming and board suffix rules.
- Reusable project export presets.

## 19. Onboarding

Initial onboarding asks only:

- Left- or right-handed layout.
- Whether finger input draws or navigates.
- Whether to begin blank or with a foundation.

Everything else is taught contextually:

- The first shelf handle pulses once.
- The first material import demonstrates clipping and flow.
- The first additional view explains the shared project kit.
- A Show Me action demonstrates unfamiliar controls in place.
- Tutorials never depend on unavailable premium content.

There is no mandatory feature tour and no permanent beginner mode.

## 20. Anti-Bloat Requirements

- Never show more than one edge shelf plus the radial menu.
- Advanced controls appear only for the active tool, layer, selection, or material.
- Every shelf begins with Favorites, Recent, and Search.
- New content extends an existing taxonomy.
- The canvas has no activity feed, inspiration feed, marketplace, or AI chat box.
- Beginner and advanced modes are not separate products.
- Primary controls remain stable as deeper controls are revealed.
- Destructive and uncommon commands live in secondary menus.
- Closing a shelf never changes artwork.
- Important capabilities must be discoverable without showing all controls continuously.

## 21. Accessibility and Personalization

- Left-handed shelf layout.
- Adjustable handle and touch-target sizes.
- High-contrast interface option.
- Reduced motion.
- Color labels and non-color selection indicators.
- VoiceOver-readable DOM controls for all shelves, dialogs, and actions.
- Configurable finger actions and gestures.
- Pencil-only drawing lock.
- Optional confirmation for destructive gestures.
- Interface scale independent from canvas zoom.
- Keyboard support for attached iPad keyboards where practical, without making it a requirement.

## 22. Technical Architecture

### 22.1 Application shell

- TypeScript.
- React for application state, DOM interface, accessibility, navigation, and dialogs.
- Installable Progressive Web App manifest.
- Service Worker for the application shell and downloadable content packs.

### 22.2 Rendering

- Tile-based WebGL2 raster renderer.
- OffscreenCanvas and a rendering worker where supported and stable.
- Main-thread fallback for affected devices or browser regressions.
- WebAssembly only for measured performance bottlenecks such as brush stamping, compositing, or image operations.
- Device capability profile created at first launch and updated after major browser changes.

### 22.3 Pencil input

- Pointer Events distinguish pen, touch, and other input.
- Coalesced events improve captured path fidelity.
- Predicted events reduce perceived latency and are replaced by confirmed points.
- Pressure, tilt, altitude, azimuth, velocity, and orientation are feature-detected.
- Rapid Pencil lift and recontact receives explicit state-machine handling.
- Active Pencil drawing suppresses unrelated touch input near the contact region.

### 22.4 Storage

- Origin Private File System stores document tiles and binary assets.
- IndexedDB stores metadata, indexes, settings, and the append-only operation journal.
- Periodic snapshots compact the journal.
- StorageManager estimates usage and quota.
- Persistent storage is requested when available.
- Service Worker caches the app shell and pinned template or material packs.
- Optional cloud object storage stores versioned project blobs and assets.

### 22.5 Compatibility tiers

- Baseline: iPadOS 17 or later, pressure and tilt drawing, offline PWA, WebGL2 rendering.
- Enhanced: iPadOS 18.2 or later, predicted and coalesced Pointer Events plus altitude and azimuth input.
- Hardware-specific Pencil capabilities are used only after feature detection.

### 22.6 Content architecture

- Versioned content-pack manifests.
- Separate metadata, preview, vector guide, and high-resolution raster assets.
- Lazy download.
- Offline pinning and unpinning.
- Integrity hashes.
- Content migration independent of project-file migration.
- Missing packs may be restored without corrupting projects.

## 23. Performance Budgets

- Cached launch to editable canvas: less than 2.5 seconds.
- Visible stroke latency: below 20 ms at the 95th percentile on current iPad Pro hardware.
- Visible stroke latency: below 32 ms at the 95th percentile on supported base iPads.
- Stable 60 FPS during normal drawing and 120 FPS where hardware and browser permit.
- Local journal commit: within 250 ms after Pencil-up.
- A4 at 300 DPI is the standard high-resolution document preset.
- Zoom, rotation, and normal drawing remain responsive with 100 visible A4 layers on reference iPad Pro hardware.
- Large documents use device-aware memory budgets and tile eviction.
- Shelf opening animation completes in 180–240 ms and remains interruptible.
- Search returns initial local template results within 150 ms.

These targets are verified on real devices and may not be inferred from desktop browser emulation.

## 24. Reliability and Error Handling

- A crash or process termination recovers to the last committed stroke.
- Storage warnings appear before quota failure.
- At 70% of estimated quota, the app suggests cleanup or cloud backup.
- At 90%, large imports pause until the user chooses an action.
- Low-memory mode reduces preview resolution without reducing export fidelity.
- Failed synchronization leaves the local document editable.
- Failed export leaves the source unchanged.
- Missing content assets show a recoverable placeholder and redownload action.
- Corrupted project snapshots fall back to the previous valid snapshot plus journal replay.
- Conflict resolution preserves both branches.
- Login, logout, paywall, and subscription state never delete or hide local work.
- All destructive commands support undo or explicit confirmation.

## 25. Testing Strategy

### 25.1 Real-device matrix

- Current iPad Pro with Apple Pencil Pro.
- Current iPad Air.
- Supported base iPad.
- Apple Pencil Pro.
- Apple Pencil second generation.
- Apple Pencil USB-C.
- Touch-only accessibility use.
- Safari browser tab.
- Installed Home Screen PWA.
- Portrait and landscape.
- Split View and background or foreground transitions.

### 25.2 Functional tests

- Brush creation and editing.
- Layer, mask, clip, and blend operations.
- Selection, transform, and liquify.
- Template insertion and conversion.
- Fabric repeat, flow, warp, clip, and recolor.
- Project-kit sharing across boards.
- Version branching and restore.
- All export formats and scopes.

### 25.3 Stylus tests

- Pressure and tilt traces.
- Coalesced and predicted point replacement.
- Very slow and very fast strokes.
- Pencil lift and immediate recontact.
- Palm contact during drawing.
- Simultaneous touch navigation.
- Hover and hardware-specific enhancements.
- Left-handed drawing near shelf handles.

### 25.4 Recovery tests

- Terminate during a stroke.
- Terminate during snapshot compaction.
- Work offline for an extended session.
- Exhaust storage quota.
- Interrupt an asset import.
- Create a cloud conflict.
- Remove a content pack used by a project.
- Cancel and restart a large export.

### 25.5 Visual and content QA

- Golden-image brush tests.
- Color and alpha compositing.
- Template anatomy and view consistency.
- Dress-form landmark accuracy reviewed by a qualified fashion educator or patternmaker.
- Material repeat seams and warp artifacts.
- Left- and right-handed shelf placement.
- Dynamic type and high-contrast rendering.

## 26. Launch Requirements

The initial release is not complete without:

- Production-quality Pencil drawing engine.
- All four edge shelves and radial menu.
- Layers, masks, selections, transforms, liquify, and history.
- At least 1,000 template sets under the definition in section 10.1.
- Anatomically accurate bodies and professional dress forms.
- Fashion-detail component libraries.
- Fabric import, seamless repeat, clipping, flow, recolor, and warp.
- Project kit and multi-board views.
- Local-first autosave, crash recovery, versioning, and downloadable backups.
- Offline app use and pinnable content.
- High-resolution, transparent, layered, and presentation exports.
- Real-device performance and recovery validation.

Post-launch candidates include collaboration, creator marketplace, animation, native desktop optimization, 3D simulation, generative AI, and pattern drafting. They must not influence initial navigation or data structures beyond reasonable extensibility.

## 27. Success Criteria

### 27.1 Usability

- A new user reaches a meaningful first stroke within 45 seconds.
- An intermediate hobbyist can start from a template, apply a custom fabric, add a second view, and export without documentation.
- At least 80% of moderated test participants understand the edge-shelf model after one contextual demonstration.
- Users can recover an earlier colorway without flattening or manually duplicating the complete project.
- The default workspace retains at least 80% canvas area.
- Users consistently describe the app as a drawing tool first and a fashion library second.

### 27.2 Reliability

- No tested supported interruption causes unrecoverable project loss.
- Every save or synchronization failure produces a visible, actionable state.
- Recovery successfully restores the last committed stroke in supported crash scenarios.
- Existing local work remains accessible in all account and subscription states.

### 27.3 Performance

- Stroke, launch, shelf, search, and large-document targets in section 23 pass on the real-device matrix.
- Performance degradation produces a clear low-memory or reduced-preview mode rather than silent failure.

## 28. Research Basis

### 28.1 Comparable strengths

Prêt-à-Template demonstrates the value of:

- More than 1,000 multi-view fashion templates.
- Fashion-specific garment and textile libraries.
- Drawing over bodies, garments, accessories, and realistic rendered bases.
- Moodboards and collection workflows.
- Apple Pencil-oriented fashion illustration.

Sources:

- [Prêt-à-Template feature overview](https://www.pretatemplate.com/real-sketch-experience)
- [Prêt-à-Template current App Store listing](https://apps.apple.com/us/app/pr%C3%AAt-%C3%A0-template/id839537579?platform=ipad)
- [Prêt-à-Template subscription features](https://www.pretatemplate.com/subscription)

### 28.2 Public friction signals

Public reviews and support topics include reports related to:

- Paywalls blocking normal app access or earlier designs.
- Lost or missing projects.
- Drawings failing to load.
- Layer confusion.
- Project organization.
- Importing custom prints.
- Crashes and unresponsive interactions.

These are anecdotal public signals rather than representative telemetry. Their frequency cannot be established from available sources, but their severity makes file durability and work access foundational requirements.

Sources:

- [Prêt-à-Template App Store reviews](https://apps.apple.com/us/app/839537579?see-all=reviews&platform=ipad)
- [Prêt-à-Template support topics](https://community.pretatemplate.com/t/support)

### 28.3 Adjacent workflow evidence

Fashion designers using generic drawing apps repeatedly seek:

- Croquis and figure templates.
- Fabric swatches and texture brushes.
- Moodboard and document import.
- Concept sketches and technical flats in one workflow.
- Better pattern and textile placement.

Sources:

- [Fashion workflow discussion](https://www.reddit.com/r/fashiondesigner/comments/1tojqej/procreate_as_a_temp_substitute_for_illustrator/)
- [Fashion sketching and croquis discussion](https://www.reddit.com/r/fashiondesigner/comments/1bznepo/fashion_sketches_and_illustration_any_tips_or/)
- [Procreate pattern and textile discussion](https://www.reddit.com/r/ProCreate/comments/qbsvx8)
- [Procreate texture-fill discussion](https://www.reddit.com/r/ProCreate/comments/1i8jnbg)

### 28.4 Interaction precedents

Procreate demonstrates the importance of masks, clipping, reference layers, symmetry, and a strong non-destructive raster workflow. Concepts demonstrates stylus fidelity, editable strokes, movable interface elements, and customizable tool organization.

Sources:

- [Procreate layer tools](https://help.procreate.com/procreate/handbook/5.4/layers/layers-options)
- [Concepts feature set](https://concepts.app/en/features-pro)

### 28.5 Web-platform feasibility and risks

WebKit supports pressure and tilt through Pointer Events. Safari 18.2 added predicted and coalesced events plus altitude and azimuth properties. Origin Private File System and modern storage quotas make substantial local-first documents possible, but quota failure and eviction still require explicit handling and backup paths.

Sources:

- [WebKit Pointer Events](https://webkit.org/blog/9674/new-webkit-features-in-safari-13/)
- [Safari 18.2 Pointer Event enhancements](https://webkit.org/blog/16301/webkit-features-in-safari-18-2/)
- [WebKit Origin Private File System](https://webkit.org/blog/12257/the-file-system-access-api-with-origin-private-file-system/)
- [WebKit storage policy](https://webkit.org/blog/14403/updates-to-storage-policy/)
- [OffscreenCanvas](https://developer.mozilla.org/en-US/docs/Web/API/OffscreenCanvas)

## 29. Primary Risks and Mitigations

### 29.1 Drawing latency in a web app

Risk: Pencil drawing feels inferior to native illustration tools.

Mitigation:

- Treat latency as the first technical prototype and release gate.
- Use coalesced and predicted Pointer Events.
- Use tile-based WebGL2 rendering and a worker where stable.
- Maintain a main-thread fallback.
- Test on real iPads continuously.

### 29.2 Content quality at 1,000-template scale

Risk: Quantity creates inconsistent anatomy, outdated styles, weak search, or library overload.

Mitigation:

- Define a template set consistently.
- Require fashion-expert review.
- Use a strict metadata taxonomy.
- Emphasize search, favorites, recents, and curated starter sets.
- Release content through versioned packs without changing navigation.

### 29.3 Feature depth overwhelms the canvas

Risk: A powerful app reproduces desktop-suite complexity.

Mitigation:

- Enforce the one-shelf rule.
- Keep at least 80% default canvas area.
- Use contextual controls and stable primary actions.
- Test feature discovery and drawing interruption separately.

### 29.4 Browser storage loss

Risk: Local browser storage is evicted or reaches quota.

Mitigation:

- Monitor quota.
- Request persistent storage.
- Keep an append-only journal and verified snapshots.
- Provide optional cloud redundancy.
- Make native project backup obvious and available at all times.

### 29.5 Hardware-specific gestures are inconsistent

Risk: Squeeze, hover, barrel roll, or double-tap are unavailable or behave differently.

Mitigation:

- Feature-detect every enhancement.
- Never hide required functionality behind a hardware gesture.
- Provide visible radial-menu and shelf equivalents.

## 30. Final Product Decision

Fabric Sketcher will be a freehand fashion drawing studio with deep, optional fashion-specific assistance. Its competitive advantage is the combination of:

- A serious Pencil drawing engine.
- High-quality fashion foundations and component references.
- A uniquely capable material-rendering workflow.
- Project-level continuity across views and colorways.
- An immersive edge-shelf interface that prevents power from becoming clutter.
- Trustworthy local-first ownership and recovery.

This specification intentionally favors expressive control, project continuity, and reliability over automatic garment generation.
