# Fabric Brush Alpha Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let an iPad user choose Pencil, Silk, Denim, Wool, or Knit, draw a visibly material-specific pressure/tilt-aware mark on the paper, and recover that exact mark after reload.

**Architecture:** Extend the immutable per-stroke `BrushSnapshot` with a compact procedural texture description and central preset catalog. The editor store owns coarse brush selection while the imperative drawing controller captures the current brush at Pencil-down for that contact's preview and commit. WebGL2 and Canvas2D consume the same `RenderTexture` contract but implement it independently, allowing their renderer tasks to run in parallel after the shared contract checkpoint.

**Tech Stack:** TypeScript, React 19, Vite, Vitest, WebGL2 GLSL ES 3.00, Canvas 2D, IndexedDB/OPFS repository contract.

## Global Constraints

- This is an iPad- and Apple-Pencil-first drawing milestone; touch continues to navigate and never paints.
- Raw Pencil samples stay outside React. Brush selection is coarse React state; preview and commit remain imperative.
- Every committed stroke stores an immutable complete brush snapshot. Changing the selected preset never changes an earlier stroke.
- Existing schema-version-1 projects using `studio-pencil-v1` remain readable without migration or destructive rewriting.
- Texture is anchored in document coordinates so it does not swim while the user pans or zooms.
- WebGL2 remains the primary renderer. Canvas2D compatibility mode stays visible and produces a recognizable, deterministic approximation.
- The five alpha presets are visual starting behaviors, not manufacturing or fabric-physics claims.
- Closed brush UI overlays the editor and does not reduce the default visible canvas below 80%.
- The approved editor palette, typography, paper treatment, safe-area behavior, and editorial restraint remain unchanged.
- No dependency is added for procedural texture generation.

## Checkpoints

1. **Checkpoint A — selectable marks:** after Tasks 1 and 2, the running app exposes five named presets. Their color, size, opacity, pressure, and tilt behavior are distinct and each committed stroke recovers with its chosen preset, even before renderer-specific grain lands.
2. **Checkpoint B — material texture:** after Tasks 3 and 4 merge, WebGL2 and Canvas2D show recognizable graphite, sheen, weave, fuzz, and rib structures.
3. **Checkpoint C — showable milestone:** after Task 5, browser QA, reload recovery, responsive layout, and the full quality gate pass; restart the development server from the integrated branch.

---

### Task 1: Freeze the brush, render, and persistence contracts

**Files:**

- Create: `src/engine/brush/presets.ts`
- Create: `src/engine/brush/presets.test.ts`
- Modify: `src/domain/document/types.ts`
- Modify: `src/engine/render/Renderer.ts`
- Modify: `src/state/editorStore.ts`
- Modify: `src/state/editorStore.test.ts`
- Modify: `src/platform/persistence/types.ts`
- Modify: `src/platform/persistence/ProjectRepository.contract.ts`
- Modify: renderer test fixtures that construct `RenderStroke`

**Interfaces:**

- Produces `BrushPresetId`, `BrushTextureKind`, `BrushTextureSnapshot`, and the expanded `BrushSnapshot` in `src/domain/document/types.ts`.
- Produces `BRUSH_PRESETS`, `DEFAULT_BRUSH_ID`, `getBrushPreset(id)`, and `isBrushPresetId(value)` in `src/engine/brush/presets.ts`.
- Produces `RenderTexture` and required `RenderStroke.texture` in `src/engine/render/Renderer.ts`.
- Produces stable store methods `getActiveBrush(): BrushSnapshot` and `selectBrush(id: BrushPresetId): void`, plus `EditorSnapshot.brush`.
- Extends `commitStroke(samples, brush?)` so the controller may provide the brush captured at Pencil-down; direct callers default to the currently selected brush.
- Tasks 2–4 consume these names verbatim and must not revise their shapes.

- [ ] **Step 1: Write failing preset and store tests**

Add tests that demonstrate the desired public API:

```ts
expect(BRUSH_PRESETS.map(({ id }) => id)).toEqual([
  "studio-pencil-v1",
  "silk-v1",
  "denim-v1",
  "wool-v1",
  "knit-v1",
]);

store.selectBrush("denim-v1");
expect(store.getSnapshot().brush.id).toBe("denim-v1");
await store.commitStroke(samples);
expect(repository.operations[0]?.brush).toEqual(getBrushPreset("denim-v1"));

store.selectBrush("silk-v1");
expect(repository.operations[0]?.brush.id).toBe("denim-v1");
```

Also extend the repository contract with one operation per new preset and prove a snapshot round-trip retains its complete nested texture object.

- [ ] **Step 2: Run the focused tests and verify RED**

Run:

```bash
pnpm test -- src/engine/brush/presets.test.ts src/state/editorStore.test.ts src/platform/persistence
```

Expected: fail because the preset catalog, selection methods, and texture snapshot do not exist.

- [ ] **Step 3: Add the exact shared types**

Use this contract:

```ts
export type BrushPresetId =
  "studio-pencil-v1" | "silk-v1" | "denim-v1" | "wool-v1" | "knit-v1";

export type BrushTextureKind = "graphite" | "silk" | "denim" | "wool" | "knit";

export type BrushTextureSnapshot = Readonly<{
  kind: BrushTextureKind;
  scale: number;
  strength: number;
  angle: number;
  scatter: number;
}>;

export type BrushSnapshot = Readonly<{
  id: BrushPresetId;
  color: `#${string}`;
  opacity: number;
  size: number;
  pressureSize: number;
  pressureOpacity: number;
  tiltShape: number;
  texture: BrushTextureSnapshot;
}>;
```

`angle` is stored in degrees. `scale` must be finite and greater than zero. `strength`, `scatter`, `opacity`, `pressureSize`, `pressureOpacity`, and `tiltShape` must be finite within `0...1` at persistence boundaries.

Extend the render contract without importing domain objects into renderers:

```ts
export type RenderTexture = Readonly<{
  kind: BrushTextureKind;
  scale: number;
  strength: number;
  angle: number;
  scatter: number;
}>;

export type RenderStroke = Readonly<{
  operationId: string;
  mesh: Float32Array;
  color: RenderColor;
  texture: RenderTexture;
}>;
```

- [ ] **Step 4: Implement and freeze the five presets**

Use these exact values so renderer calibration and UI swatches share one source:

```ts
export const BRUSH_PRESETS = Object.freeze([
  preset(
    "studio-pencil-v1",
    "Pencil",
    "#262421",
    0.78,
    16,
    1,
    0.65,
    0.4,
    texture("graphite", 18, 0.34, 0, 0.18),
  ),
  preset(
    "silk-v1",
    "Silk",
    "#8F3E4B",
    0.46,
    48,
    0.55,
    0.42,
    0.2,
    texture("silk", 84, 0.3, -12, 0.06),
  ),
  preset(
    "denim-v1",
    "Denim",
    "#294F68",
    0.74,
    42,
    0.72,
    0.28,
    0.16,
    texture("denim", 38, 0.62, 42, 0.12),
  ),
  preset(
    "wool-v1",
    "Wool",
    "#8A5547",
    0.62,
    52,
    0.62,
    0.34,
    0.3,
    texture("wool", 26, 0.58, 8, 0.72),
  ),
  preset(
    "knit-v1",
    "Knit",
    "#625D55",
    0.66,
    56,
    0.58,
    0.3,
    0.18,
    texture("knit", 62, 0.54, 0, 0.16),
  ),
] as const);
```

The private `preset` shape also includes the display `name`, while `getBrushPreset` returns only a deeply frozen `BrushSnapshot`. No caller receives mutable nested texture state.

- [ ] **Step 5: Wire selection and immutable stroke snapshots**

Replace the store's readonly single brush with a mutable selected snapshot. `selectBrush` resolves only catalog IDs and emits once. `commitStroke` must deep-clone and freeze the selected snapshot:

```ts
const brush = Object.freeze({
  ...this.#brush,
  texture: Object.freeze({ ...this.#brush.texture }),
});
```

`toRenderStroke` copies `operation.brush.texture` into required `RenderStroke.texture`. Test that retry reuses the identical operation and that changing selection does not mutate queued or recovered operations. When the optional captured brush is supplied to `commitStroke`, snapshot that argument rather than re-reading current selection.

- [ ] **Step 6: Verify and commit**

Run:

```bash
pnpm test -- src/engine/brush src/state src/platform/persistence src/engine/render
pnpm quality
```

Expected: all tests and build pass with pristine output.

Commit: `feat: define persistent fabric brush presets`

---

### Task 2: Add the first usable Brushes shelf and dynamic Pencil preview

**Files:**

- Create: `src/features/brushes/BrushShelf.tsx`
- Create: `src/features/brushes/BrushShelf.test.tsx`
- Modify: `src/features/canvas/createDrawingController.ts`
- Modify: `src/features/canvas/DrawingSurface.tsx`
- Modify: `src/features/canvas/DrawingSurface.test.tsx`
- Modify: `src/app/app.css`

**Interfaces:**

- Consumes `BRUSH_PRESETS`, `EditorStore.selectBrush`, `EditorStore.getActiveBrush`, and `EditorSnapshot.brush` from Task 1.
- Changes `CreateDrawingControllerOptions` to require `getBrush: () => BrushSnapshot` and changes its commit callback to `(samples, brush) => void | PromiseLike<void>`.
- Produces `BrushShelf({ store, onOpenChange? })` as the first real edge-shelf surface; later shelf work extends rather than replaces it.

- [ ] **Step 1: Write failing interaction tests**

Test the real behavior:

```tsx
render(<BrushShelf store={store} />);
await user.click(screen.getByRole("button", { name: "Brushes" }));
expect(screen.getByRole("radiogroup", { name: "Brush presets" })).toBeVisible();
await user.click(screen.getByRole("radio", { name: "Denim" }));
expect(store.getActiveBrush().id).toBe("denim-v1");
expect(screen.getByText("Denim")).toBeVisible();
```

Controller tests must select one brush after controller creation, draw a preview, and assert both preview mesh/color and committed operation use the newly selected brush without recreating the controller. A second test changes selection during that Pencil contact and proves preview plus commit keep the Pencil-down brush while the next contact uses the new brush.

- [ ] **Step 2: Run focused tests and verify RED**

Run:

```bash
pnpm test -- src/features/brushes src/features/canvas
```

Expected: fail because `BrushShelf` and `getBrush` are absent and preview is hard-coded to `studioPencil`.

- [ ] **Step 3: Make preview read the active brush at event time**

Add `getBrush` to controller options. Capture one deeply immutable brush when a pen pointer begins, retain it until up/cancel/lost capture, and change the preview helper to accept that captured brush:

```ts
activeBrush = options.getBrush();
renderer.previewStroke(
  previewStroke("preview-confirmed", confirmed, activeBrush),
  previewStroke("preview-predicted", predicted, activeBrush),
);
```

The helper uses `buildStrokeMesh(samples, brush)`, converts `brush.color`, and copies `brush.texture`. On commit, pass that same captured brush to the store callback before clearing it. `DrawingSurface` passes the stable `store.getActiveBrush` function. Do not add brush snapshot dependencies to the layout effect.

- [ ] **Step 4: Implement the overlay shelf**

The closed state is one 56px minimum target labeled `Brushes` at the logical inline start of the drawing field. The open state is a narrow, warm-surface overlay with:

- Heading `Brushes`.
- A `radiogroup` named `Brush presets`.
- Five 56px-minimum radio rows named exactly `Pencil`, `Silk`, `Denim`, `Wool`, and `Knit`.
- A code-native swatch using the preset color and a restrained CSS pattern keyed by `data-texture`.
- Current selection shown through native checked semantics and an oxblood rule, without badges or explanatory marketing copy.
- Escape and a canvas `pointerdown` close the shelf; selecting a brush leaves it open for comparison.

Use logical properties and safe-area variables. The shelf overlays the drawing field rather than resizing it. With the shelf closed, the existing paper dimensions and default viewport fit must be unchanged.

- [ ] **Step 5: Verify Checkpoint A and commit**

Run:

```bash
pnpm test -- src/features/brushes src/features/canvas src/state
pnpm quality
```

Then restart `pnpm dev`, create a design, choose each preset, draw one stroke, return to the gallery, reopen the design, and confirm each stroke remains. Check 1448×1086 and 390×844 with no horizontal overflow.

Commit: `feat: choose persistent brushes from the canvas edge`

---

### Task 3: Render procedural material texture in WebGL2

**Files:**

- Modify: `src/engine/render/shaders.ts`
- Modify: `src/engine/render/WebGL2Renderer.ts`
- Create: `src/engine/render/WebGL2Renderer.texture.test.ts`
- Create: `src/engine/render/textureUniforms.ts`
- Create: `src/engine/render/textureUniforms.test.ts`

**Interfaces:**

- Consumes required `RenderStroke.texture` from Task 1.
- Produces pure `textureUniforms(texture)` returning `{ kind, scale, strength, angleRadians, scatter }` where kind codes are graphite=0, silk=1, denim=2, wool=3, knit=4.
- Does not change `Renderer`, `RenderStroke`, store, React, persistence, or Canvas2D files.

- [ ] **Step 1: Write failing mapping and shader-contract tests**

Test all five kind codes, degree-to-radian conversion, finite/clamped numeric output, and shader source requirements:

```ts
expect(textureUniforms(getBrushPreset("denim-v1").texture)).toMatchObject({
  kind: 2,
  scale: 38,
  strength: 0.62,
});
expect(shaderSource).toContain("v_document_position");
expect(shaderSource).toContain("u_texture_kind");
```

Extend the fake GL context to capture `uniform1i` and `uniform1f`. Assert each draw uploads that stroke's texture uniforms before `drawArrays`.

- [ ] **Step 2: Run focused tests and verify RED**

Run `pnpm test -- src/engine/render/textureUniforms.test.ts src/engine/render/WebGL2Renderer.texture.test.ts`.

Expected: fail because the mapping and uniforms do not exist.

- [ ] **Step 3: Add document-anchored procedural patterns**

The vertex shader passes original document position to the fragment shader. The fragment shader rotates document coordinates by `u_texture_angle`, divides by `u_texture_scale`, then computes:

- Graphite: fine deterministic value noise mixed with sparse grain loss.
- Silk: low-contrast directional sheen bands with gentle noise breakup.
- Denim: two diagonal thread families with an irregular indigo gap.
- Wool: clustered noise plus sparse fiber streaks controlled by scatter.
- Knit: alternating rib columns with a soft loop-shaped secondary modulation.

Every pattern returns a `0...1` coverage multiplier. Mix it with solid coverage by `u_texture_strength`, multiply by vertex/color alpha, and keep premultiplied output:

```glsl
float textureCoverage = materialCoverage(rotated / max(u_texture_scale, 0.001));
float coverage = mix(1.0, textureCoverage, clamp(u_texture_strength, 0.0, 1.0));
float effectiveAlpha = clamp(v_alpha * coverage, 0.0, 1.0) * u_color.a;
outputColor = vec4(u_color.rgb * effectiveAlpha, effectiveAlpha);
```

Patterns must be deterministic and use no time uniform.

- [ ] **Step 4: Upload texture uniforms for retained and preview strokes**

Resolve uniform locations during program creation and upload all texture values inside `drawBoundBuffer`, immediately before the draw. Context restoration recreates the same locations and retained strokes render with their existing snapshots.

- [ ] **Step 5: Verify and commit**

Run:

```bash
pnpm test -- src/engine/render
pnpm quality
```

Commit: `feat: render procedural fabric grain in WebGL`

---

### Task 4: Render deterministic texture tiles in Canvas2D compatibility mode

**Files:**

- Create: `src/engine/render/createTextureTile.ts`
- Create: `src/engine/render/createTextureTile.test.ts`
- Modify: `src/engine/render/Canvas2DRenderer.ts`
- Create: `src/engine/render/Canvas2DRenderer.texture.test.ts`

**Interfaces:**

- Consumes required `RenderStroke.texture` from Task 1.
- Produces `createTextureTile(document, color, texture): HTMLCanvasElement` and `textureCacheKey(color, texture): string`.
- Does not change `Renderer`, `RenderStroke`, store, React, persistence, WebGL, or shader files.

- [ ] **Step 1: Write failing deterministic-tile tests**

Inject a minimal canvas-document seam so tests inspect tile drawing operations. Verify:

- Identical color/texture input returns an identical cache key.
- Each texture kind emits a non-empty, distinct deterministic drawing plan.
- Tile size is bounded between 16 and 128 physical pixels.
- The renderer calls `createPattern(tile, "repeat")`, caches by key, uses the pattern as fill style, and falls back to solid RGB if pattern creation returns null.

- [ ] **Step 2: Run focused tests and verify RED**

Run `pnpm test -- src/engine/render/createTextureTile.test.ts src/engine/render/Canvas2DRenderer.texture.test.ts`.

Expected: fail because compatibility rendering only uses a solid fill.

- [ ] **Step 3: Implement the five bounded procedural tiles**

Use only Canvas 2D primitives and deterministic integer loops:

- Graphite: sparse alpha speckles over the base color.
- Silk: translucent directional bands.
- Denim: crossing diagonal one-pixel thread lines.
- Wool: small clustered fiber dashes with a fixed hash function.
- Knit: alternating ribs and short loop arcs.

Apply the preset angle when drawing tile primitives; do not rotate the live document context. Tile density derives from `texture.scale`, while `strength` and `scatter` control contrast/count. Use no random source and no animation time.

- [ ] **Step 4: Cache and apply patterns without changing geometry**

Canvas2DRenderer owns a bounded map keyed by `textureCacheKey`. Clear it on dispose. For every segment, keep the existing segment-local pressure alpha and use the cached pattern for `fillStyle`. If DOM canvas creation or `createPattern` fails, render the current solid color instead of throwing or losing the stroke.

- [ ] **Step 5: Verify and commit**

Run:

```bash
pnpm test -- src/engine/render
pnpm quality
```

Commit: `feat: approximate fabric texture in Canvas compatibility mode`

---

### Task 5: Integrate, calibrate, recover, and present the fabric-brush alpha

**Files:**

- Modify: `src/features/brushes/BrushShelf.test.tsx`
- Modify: `src/features/canvas/DrawingSurface.test.tsx`
- Modify: `src/platform/persistence/BrowserProjectRepository.integration.test.ts`
- Modify: `src/app/app.css`
- Create: `docs/testing/fabric-brush-alpha-checklist.md`
- Modify: `.superpowers/sdd/progress.md`

**Interfaces:**

- Consumes Tasks 1–4 without changing their public contracts.
- Produces no new product API; this is the cross-system acceptance and visual calibration task.

- [ ] **Step 1: Add cross-system regressions before visual fixes**

Add tests proving:

- Draw one stroke with every preset, persist, reload, and recover the five brush IDs and nested texture snapshots in order.
- Predicted samples never enter any recovered operation.
- Selecting a new brush during an active stroke affects only the next stroke; the active preview and commit use the brush captured at Pencil-down.
- WebGL context restoration and Canvas fallback retain each stroke's texture metadata.
- Closing/reopening the shelf does not recreate the drawing controller or reset pan/zoom.

- [ ] **Step 2: Run focused tests and verify RED where integration is incomplete**

Run:

```bash
pnpm test -- src/features/brushes src/features/canvas src/platform/persistence src/engine/render
```

Expected: any brush-capture or recovery gap fails before its minimal fix.

- [ ] **Step 3: Calibrate against the approved editor concept**

Use `docs/design/concepts/editor-landscape-approved.png` as the visual source of truth. Verify at native 1448×1086 and 390×844:

- Warm paper and cool app field are unchanged.
- Closed shelf consumes no more than its 56px target and paper fit remains unchanged.
- Open shelf is an overlay, not a card or canvas-resizing sidebar.
- Typography, rules, oxblood selected state, square-soft geometry, and control sizes match the existing visual system.
- All five swatches are visibly distinct without gradients, badges, placeholder art, or invented explanatory copy.
- No horizontal overflow, safe-area collision, clipped paper, or obstructed Undo control.

Capture the latest implementation screenshot and inspect it alongside the approved concept with `view_image`. Record at least five comparison points and any intentional milestone deviation in the checklist.

- [ ] **Step 4: Exercise the usable workflow in a browser**

From a fresh project:

1. Open Brushes.
2. Draw Pencil, Silk, Denim, Wool, and Knit strokes with visibly varying pressure.
3. Confirm each mark is visually distinct and texture remains anchored during pan/zoom.
4. Return to gallery, reopen, and confirm all five marks recover exactly once.
5. Force Canvas2D compatibility through the existing injected seam and confirm recognizable patterns plus the visible compatibility notice.

Document that synthetic browser input is not real Pencil hardware acceptance.

- [ ] **Step 5: Run the complete gate, commit, and reload Checkpoint C**

Run:

```bash
pnpm quality
git status --short
```

Restart `pnpm dev` from the integrated feature worktree and verify `http://localhost:5173/` serves the new build.

Commit: `feat: deliver the recoverable fabric brush alpha`

---

## Milestone Acceptance

- The user can open the real Brushes shelf and select Pencil, Silk, Denim, Wool, or Knit.
- The current brush produces confirmed and predicted preview without putting raw samples into React.
- Brush selection at Pencil-down remains stable through that contact.
- Each preset has recognizably distinct geometry, opacity, color, and procedural material texture.
- Texture remains anchored while panning and zooming.
- Every completed stroke persists its full immutable brush snapshot and recovers exactly once.
- Existing `studio-pencil-v1` schema-version-1 projects remain readable.
- WebGL2 and Canvas2D compatibility modes both render every preset without losing art.
- Save failure, retry, Back protection, undo, responsive layout, and safe-area behavior remain intact.
- `pnpm quality` passes and the development server is reloaded at every named checkpoint.
