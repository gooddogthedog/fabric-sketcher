# Traceable Fashion Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver Checkpoint A of the Foundation Sketching Loop: a user can add,
configure, transform, hide, save, recover, and draw over one of two credible
front-view fashion foundations.

**Architecture:** Foundation state becomes a schema-version-2 document property
updated through journaled `foundation.set` operations. Two bundled semantic SVG
assets render in a DOM SVG layer beneath the existing transparent WebGL2 or
Canvas2D drawing surface, sharing the canvas viewport matrix without putting
vector geometry into either stroke renderer. A focused Layers shelf edits
foundation state; an isolated pointer controller previews one- and two-contact
transforms and commits once at gesture completion.

**Tech Stack:** React 19, TypeScript, DOM SVG, Pointer Events, existing affine
matrix utilities, IndexedDB/OPFS repository contracts, Vitest, Testing Library,
Vite PWA.

## Global Constraints

- Implement only Checkpoint A from
  `docs/superpowers/specs/2026-07-28-foundation-sketching-loop-design.md`.
- Do not implement brush editing, eraser, redo, the quick-tool puck,
  stabilization, curve finishing, symmetry, canvas flip, export controls,
  parametric bodies, side/back views, or multi-board UI.
- No generative AI or runtime network content is introduced.
- Primary platform is iPadOS; primary drawing input is Apple Pencil.
- The visual north star remains
  `docs/design/concepts/editor-landscape-approved.png`.
- Preserve warm paper `#F7F3EC`, cool app field `#f2f1ef`, oxblood selection
  `#97251f`, restrained editorial chrome, and at least 80% default artwork
  viewport ownership.
- Every visible interactive target is at least 56 × 56 CSS pixels.
- The Foundation is excluded from export conceptually; Checkpoint A does not add
  export UI or an export pipeline.
- New foundation content is bundled and available offline.
- Existing schema-version-1 projects must open unchanged with
  `foundation: null`.
- Missing or unknown foundation assets must not prevent artwork recovery.
- Opening shelves or editing Foundation state must not recreate the drawing
  controller, reset the viewport, or change paper fit.
- Foundation transforms are committed once per completed gesture; pointer moves
  are preview-only.
- Preserve unrelated working-tree changes, including the existing local
  `vite.config.ts` host configuration and `docs/testing/` artifacts.
- Use TDD for every task. Run the stated RED command before implementation,
  then the stated GREEN command and `pnpm quality` before each task commit.

## File and Responsibility Map

| Path                                                              | Responsibility                                               |
| ----------------------------------------------------------------- | ------------------------------------------------------------ |
| `src/domain/document/types.ts`                                    | Durable Foundation and operation types                       |
| `src/domain/document/foundationState.ts`                          | Foundation defaults, immutability, and validation            |
| `src/domain/document/createDocument.ts`                           | New schema-v2 document defaults                              |
| `src/domain/document/documentReducer.ts`                          | Replay `foundation.set` operations                           |
| `src/features/foundations/types.ts`                               | Runtime asset metadata and landmark contracts                |
| `src/features/foundations/foundationCatalog.ts`                   | Bundled asset lookup and default state creation              |
| `public/foundations/*.svg`                                        | Semantic, scalable foundation artwork                        |
| `src/platform/persistence/types.ts`                               | Schema-v1 migration and schema-v2 validation                 |
| `src/state/editorStore.ts`                                        | Immediate Foundation state and durable operation queue       |
| `src/features/foundations/FoundationOverlay.tsx`                  | SVG compositing and missing-asset presentation state         |
| `src/features/foundations/createFoundationTransformController.ts` | Pointer-owned move/scale preview and one-shot commit         |
| `src/features/foundations/LayersShelf.tsx`                        | Foundation picker and controls                               |
| `src/features/brushes/BrushShelf.tsx`                             | Controlled shelf open state                                  |
| `src/features/canvas/DrawingSurface.tsx`                          | Shared shelf state, SVG/canvas stack, viewport forwarding    |
| `src/features/canvas/createDrawingController.ts`                  | Optional viewport-matrix callback only                       |
| `src/app/app.css`                                                 | North-star shelf, overlay, transform, and responsive styling |

## Dependency and Parallelization Map

1. Task 1 establishes Foundation types.
2. After Task 1, Task 2 (asset production) and Task 3 (durability/migration) are
   independent and may run in parallel in isolated worktrees.
3. Task 4 depends on Tasks 1 and 3.
4. Task 5 depends on Tasks 1 and 2 and may run in parallel with Tasks 3 and 4.
5. Task 6 depends on Task 5.
6. Task 7 depends on Tasks 2, 4, 5, and 6.
7. Task 8 is the integrated review and live checkpoint.

---

### Task 1: Foundation Domain and Asset Contracts

**Files:**

- Modify: `src/domain/document/types.ts`
- Create: `src/domain/document/foundationState.ts`
- Create: `src/domain/document/foundationState.test.ts`
- Create: `src/features/foundations/types.ts`

**Interfaces:**

- Consumes: existing `Matrix3` from `src/engine/math/affine.ts`.
- Produces durable state types from `src/domain/document/types.ts`, runtime
  asset metadata from `src/features/foundations/types.ts`, and state helpers
  from `src/domain/document/foundationState.ts`. The domain helper accepts a
  durable seed rather than importing the feature-layer asset type:

```ts
export type FoundationType = "figure" | "dress-form";
export type FoundationView = "front" | "side" | "back";

export type FoundationLandmarkGroup =
  "outline" | "center" | "levels" | "construction";

export type FoundationState = Readonly<{
  assetId: string;
  assetVersion: number;
  foundationType: FoundationType;
  transform: Matrix3;
  opacity: number;
  visible: boolean;
  visibleLandmarkGroups: readonly FoundationLandmarkGroup[];
  locked: boolean;
  includeInExport: boolean;
}>;

export type FoundationStateSeed = Readonly<{
  assetId: string;
  assetVersion: number;
  foundationType: FoundationType;
  visibleLandmarkGroups: readonly FoundationLandmarkGroup[];
}>;

export type FoundationAsset = Readonly<{
  id: string;
  version: number;
  name: string;
  foundationType: FoundationType;
  view: FoundationView;
  sourceUrl: string;
  viewBox: Readonly<{ x: 0; y: 0; width: 2480; height: 3508 }>;
  bounds: Readonly<{ x: number; y: number; width: number; height: number }>;
  centerLineX: number;
  groups: readonly Readonly<{
    id: FoundationLandmarkGroup;
    label: string;
    symbolId: string;
    defaultVisible: boolean;
  }>[];
}>;

export function createFoundationState(
  seed: FoundationStateSeed,
): FoundationState;
export function normalizeFoundationState(value: unknown): FoundationState;
export function immutableFoundation(
  foundation: FoundationState | null,
): FoundationState | null;
export class FoundationValidationError extends Error {}
```

- `normalizeFoundationState` accepts unknown asset IDs so old or temporarily
  unavailable bundled assets do not block artwork recovery. It validates all
  numeric and enum fields, requires a finite nonsingular affine matrix, clamps
  no values silently, and throws `FoundationValidationError` on malformed
  input.

- [ ] **Step 1: Write failing Foundation-state tests**

```ts
it("creates an immutable, locked, faded, non-exporting default", () => {
  const state = createFoundationState(seedFixture);
  expect(state).toMatchObject({
    assetId: "neutral-figure-front",
    assetVersion: 1,
    foundationType: "figure",
    opacity: 0.34,
    visible: true,
    locked: true,
    includeInExport: false,
    transform: identity(),
  });
  expect(state.visibleLandmarkGroups).toEqual(["outline", "center", "levels"]);
  expect(Object.isFrozen(state.transform)).toBe(true);
});

it("rejects a singular or non-finite transform", () => {
  expect(() =>
    normalizeFoundationState({
      ...createFoundationState(seedFixture),
      transform: [0, 0, 0, 0, 0, 0, 0, 0, 1],
    }),
  ).toThrow(FoundationValidationError);
});

it("retains an unknown but well-formed asset reference", () => {
  expect(
    normalizeFoundationState({
      ...createFoundationState(seedFixture),
      assetId: "retired-foundation",
      assetVersion: 7,
    }).assetId,
  ).toBe("retired-foundation");
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```bash
pnpm exec vitest run src/domain/document/foundationState.test.ts
```

Expected: FAIL because the Foundation modules and types do not exist.

- [ ] **Step 3: Implement the exact contracts and validation**

Use explicit validation rather than type assertions:

```ts
const FOUNDATION_GROUPS = new Set<FoundationLandmarkGroup>([
  "outline",
  "center",
  "levels",
  "construction",
]);

function isAffineMatrix(value: unknown): value is Matrix3 {
  return (
    Array.isArray(value) &&
    value.length === 9 &&
    value.every(
      (entry) => typeof entry === "number" && Number.isFinite(entry),
    ) &&
    value[6] === 0 &&
    value[7] === 0 &&
    value[8] === 1 &&
    Math.abs(value[0] * value[4] - value[1] * value[3]) > 1e-9
  );
}
```

`createFoundationState` clones and freezes the seed's landmark array, uses
`identity()`, opacity `0.34`, `visible: true`, `locked: true`, and
`includeInExport: false`. `immutableFoundation` clones and freezes the matrix
and landmark array as well as the outer object.

- [ ] **Step 4: Run focused tests and typecheck**

Run:

```bash
pnpm exec vitest run src/domain/document/foundationState.test.ts
pnpm typecheck
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/domain/document/types.ts src/domain/document/foundationState.ts src/domain/document/foundationState.test.ts src/features/foundations/types.ts
git commit -m "feat: define fashion foundation state"
```

---

### Task 2: Produce and Register the Two Foundation Assets

**Files:**

- Create: `public/foundations/neutral-figure-front-v1.svg`
- Create: `public/foundations/dress-form-front-v1.svg`
- Create: `src/features/foundations/foundationCatalog.ts`
- Create: `src/features/foundations/foundationCatalog.test.ts`
- Create: `src/features/foundations/foundationAssets.test.ts`

**Interfaces:**

- Consumes: `FoundationAsset`, `FoundationState`, `FoundationType`,
  `FoundationView`, and `FoundationLandmarkGroup` from Task 1, plus the domain
  `createFoundationState` helper.
- Produces:

```ts
export const FOUNDATION_ASSETS: readonly FoundationAsset[];
export function getFoundationAsset(
  assetId: string,
  assetVersion: number,
): FoundationAsset | null;
export function getFoundationAssets(): readonly FoundationAsset[];
export function createDefaultFoundationState(
  asset: FoundationAsset,
): FoundationState;
```

- Stable IDs are `neutral-figure-front` version `1` and
  `dress-form-front` version `1`.
- Both SVGs use `viewBox="0 0 2480 3508"` and contain these semantic symbols:
  `foundation-outline`, `foundation-center`, `foundation-levels`, and
  `foundation-construction`.
- Within those groups, stable element IDs distinguish `landmark-body-contour`,
  `landmark-center-front`, `landmark-shoulder`, `landmark-bust`,
  `landmark-waist`, `landmark-hip`, `landmark-armhole`,
  `landmark-princess-line`, and `landmark-side-seam`. The figure may omit the
  dress-form-only princess and side-seam elements.
- SVGs contain vector `path`, `line`, `polyline`, or `ellipse` elements only;
  no raster `<image>`, embedded font, script, remote URL, garment artwork,
  facial detail, hairstyle, or decorative styling is allowed.

- [ ] **Step 1: Write failing catalog and asset-structure tests**

```ts
it("returns immutable front-view assets in editorial order", () => {
  expect(getFoundationAssets().map(({ id, version }) => [id, version])).toEqual(
    [
      ["neutral-figure-front", 1],
      ["dress-form-front", 1],
    ],
  );
  expect(Object.isFrozen(getFoundationAssets())).toBe(true);
});

it("returns null for an unavailable pinned version", () => {
  expect(getFoundationAsset("neutral-figure-front", 99)).toBeNull();
  expect(getFoundationAsset("retired-foundation", 1)).toBeNull();
});
```

Read both SVG files in `foundationAssets.test.ts`, parse with `DOMParser`, and
assert:

```ts
expect(svg.getAttribute("viewBox")).toBe("0 0 2480 3508");
expect(svg.querySelector("image, script, style")).toBeNull();
for (const id of [
  "foundation-outline",
  "foundation-center",
  "foundation-levels",
  "foundation-construction",
]) {
  expect(svg.querySelector(`symbol#${id}`)).not.toBeNull();
}
for (const id of [
  "landmark-body-contour",
  "landmark-center-front",
  "landmark-shoulder",
  "landmark-bust",
  "landmark-waist",
  "landmark-hip",
  "landmark-armhole",
]) {
  expect(svg.querySelector(`#${id}`)).not.toBeNull();
}
expect(
  svg.querySelectorAll("path, line, polyline, ellipse").length,
).toBeGreaterThan(12);
```

For the dress-form file, additionally assert
`#landmark-princess-line` and `#landmark-side-seam` exist. This preserves
fine-grained fashion semantics inside the four intentionally simple user-facing
visibility groups.

- [ ] **Step 2: Run focused tests and verify RED**

Run:

```bash
pnpm exec vitest run src/features/foundations/foundationCatalog.test.ts src/features/foundations/foundationAssets.test.ts
```

Expected: FAIL because the catalog and SVGs do not exist.

- [ ] **Step 3: Author the neutral figure**

Create a front-facing adult figure in a neutral stance with arms slightly clear
of the torso and realistic human proportions. Use the exact document view box.
Divide the art into:

- `foundation-outline`: quiet body contour, head oval, limb contours, hands,
  feet, shoulder and neck outline.
- `foundation-center`: center-front guide from neck through stance midpoint.
- `foundation-levels`: shoulder, bust, waist, high-hip, full-hip, knee, and
  ankle references.
- `foundation-construction`: armhole arcs and balance references.

Use rounded, unfilled strokes with no line heavier than 3 document units at
native scale. Keep the stance symmetrical enough for garment block-in while
remaining anatomically credible. Inspect at fit-to-screen and 400% zoom.

- [ ] **Step 4: Author the professional dress form**

Create a torso fitting form on a stand, not a retail display mannequin. Include:

- `foundation-outline`: neck cap, shoulders, torso shell, hip termination,
  support pole, and restrained base.
- `foundation-center`: center front.
- `foundation-levels`: bust, waist, high hip, and full hip.
- `foundation-construction`: princess lines, armhole, side seam, shoulder seam,
  neck reference, and balance lines.

Use the same coordinate system and center line (`x = 1240`) as the figure so
switching assets can preserve the user's transform.

- [ ] **Step 5: Register exact metadata**

```ts
export const FOUNDATION_ASSETS = Object.freeze([
  Object.freeze({
    id: "neutral-figure-front",
    version: 1,
    name: "Neutral figure — Front",
    foundationType: "figure",
    view: "front",
    sourceUrl: "/foundations/neutral-figure-front-v1.svg",
    viewBox: Object.freeze({ x: 0, y: 0, width: 2480, height: 3508 }),
    bounds: Object.freeze({ x: 690, y: 170, width: 1100, height: 3160 }),
    centerLineX: 1240,
    groups: figureGroups,
  }),
  Object.freeze({
    id: "dress-form-front",
    version: 1,
    name: "Professional dress form — Front",
    foundationType: "dress-form",
    view: "front",
    sourceUrl: "/foundations/dress-form-front-v1.svg",
    viewBox: Object.freeze({ x: 0, y: 0, width: 2480, height: 3508 }),
    bounds: Object.freeze({ x: 760, y: 360, width: 960, height: 2780 }),
    centerLineX: 1240,
    groups: dressFormGroups,
  }),
]);
```

All catalog arrays and nested metadata are frozen.
`createDefaultFoundationState` converts the catalog asset to the domain seed:

```ts
return createFoundationState({
  assetId: asset.id,
  assetVersion: asset.version,
  foundationType: asset.foundationType,
  visibleLandmarkGroups: asset.groups
    .filter((group) => group.defaultVisible)
    .map((group) => group.id),
});
```

- [ ] **Step 6: Run tests, build, and inspect the assets**

Run:

```bash
pnpm exec vitest run src/features/foundations/foundationCatalog.test.ts src/features/foundations/foundationAssets.test.ts
pnpm build
```

Expected: PASS, and the built `dist/foundations/` directory contains both SVGs.

Render each SVG on the warm paper token and inspect it beside
`editor-landscape-approved.png`. Reject the task if either asset reads as clip
art, an elongated runway caricature, a generic mannequin, or decorative sample
art.

- [ ] **Step 7: Commit**

```bash
git add public/foundations src/features/foundations/foundationCatalog.ts src/features/foundations/foundationCatalog.test.ts src/features/foundations/foundationAssets.test.ts
git commit -m "feat: add the first fashion foundation set"
```

---

### Task 3: Schema-v2 Foundation Durability and Migration

**Files:**

- Modify: `src/domain/document/types.ts`
- Modify: `src/domain/document/createDocument.ts`
- Modify: `src/domain/document/createDocument.test.ts`
- Modify: `src/domain/document/documentReducer.ts`
- Modify: `src/domain/document/documentReducer.test.ts`
- Modify: `src/platform/persistence/types.ts`
- Modify: `src/platform/persistence/ProjectRepository.contract.ts`
- Modify: `src/platform/persistence/BrowserProjectRepository.ts`
- Modify: `src/platform/persistence/BrowserProjectRepository.integration.test.ts`

**Interfaces:**

- Consumes: `FoundationState`, `normalizeFoundationState`, and
  `immutableFoundation` from Task 1.
- Produces:

```ts
export type FoundationSetOperation = Readonly<{
  type: "foundation.set";
  operationId: string;
  projectId: string;
  sequence: number;
  committedAt: string;
  foundation: FoundationState | null;
}>;

export type DocumentOperation =
  StrokeOperation | StrokeVisibilityOperation | FoundationSetOperation;

export type DesignDocument = Readonly<{
  schemaVersion: 2;
  projectId: string;
  title: string;
  width: number;
  height: number;
  background: "#F7F3EC";
  activeLayerId: string;
  operationSequence: number;
  foundation: FoundationState | null;
  strokes: readonly StrokeOperation[];
  hiddenStrokeIds: readonly string[];
}>;

export function normalizeDesignDocument(
  value: unknown,
  expectedProjectId: string,
): DesignDocument;
```

- Schema-version-1 input migrates to schema version 2 with `foundation: null`.
- Schema-version-2 input validates Foundation state but accepts an unavailable
  asset reference.
- IndexedDB object-store versions and keys do not change.

- [ ] **Step 1: Write failing reducer, snapshot, and repository tests**

```ts
it("applies and replaces a complete foundation snapshot", () => {
  const withFigure = documentReducer(document, foundationOperation(figure));
  const withForm = documentReducer(
    withFigure,
    foundationOperation(dressForm, {
      sequence: 2,
      operationId: "foundation-2",
    }),
  );
  expect(withForm.foundation).toEqual(dressForm);
  expect(withForm.operationSequence).toBe(2);
});

it("removes a foundation without changing strokes", () => {
  const result = documentReducer(documentWithStrokeAndFoundation, {
    ...foundationOperation(null),
    sequence: 3,
  });
  expect(result.foundation).toBeNull();
  expect(result.strokes).toEqual(documentWithStrokeAndFoundation.strokes);
});

it("migrates a schema-v1 project without a foundation", () => {
  const result = normalizeDesignDocument(schemaV1Fixture, "project-1");
  expect(result).toMatchObject({ schemaVersion: 2, foundation: null });
});
```

Extend the shared repository contract to create, append, snapshot, reload, and
exact-compare a document with an unavailable-but-valid asset ID. This proves
recovery is independent from catalog availability.

- [ ] **Step 2: Run focused tests and verify RED**

Run:

```bash
pnpm exec vitest run src/domain/document src/platform/persistence/BrowserProjectRepository.integration.test.ts
```

Expected: FAIL because schema version 2 and `foundation.set` are unsupported.

- [ ] **Step 3: Add schema-v2 document and reducer behavior**

`createDocument` returns:

```ts
{
  schemaVersion: 2,
  foundation: null,
  projectId,
  title,
  width: 2480,
  height: 3508,
  background: "#F7F3EC",
  activeLayerId: `paint-layer:${projectId}`,
  operationSequence: 0,
  strokes: [],
  hiddenStrokeIds: [],
}
```

In `documentReducer`, validate sequence first, then apply
`foundation.set` as:

```ts
if (operation.type === "foundation.set") {
  return {
    ...document,
    operationSequence: operation.sequence,
    foundation: immutableFoundation(operation.foundation),
  };
}
```

- [ ] **Step 4: Implement one normalization boundary**

Replace snapshot-only validation with `normalizeDesignDocument`. It accepts only
schema versions 1 and 2, preserves all existing stroke-history checks, migrates
schema 1, and validates schema-2 Foundation state.

Call the same normalizer for:

- OPFS snapshots.
- IndexedDB compressed snapshots.
- `record.initialDocument` before journal replay.

Extend `normalizeDocumentOperation` with strict `foundation.set` metadata and
Foundation validation.

- [ ] **Step 5: Run repository contracts and quality**

Run:

```bash
pnpm exec vitest run src/domain/document src/platform/persistence
pnpm quality
```

Expected: all schema-v1 fixtures, schema-v2 Foundation fixtures, malformed
Foundation rejection, snapshot fallback, and operation replay tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/domain/document src/platform/persistence
git commit -m "feat: persist recoverable fashion foundations"
```

---

### Task 4: EditorStore Foundation Operations

**Files:**

- Modify: `src/state/editorStore.ts`
- Modify: `src/state/editorStore.test.ts`

**Interfaces:**

- Consumes: `FoundationState`, `FoundationSetOperation`, `documentReducer`, and
  the existing durable operation queue.
- Produces:

```ts
public setFoundation(
  foundation: FoundationState | null,
): Promise<void>;
```

- One call creates one complete immutable `foundation.set` operation.
- State updates immediately, then uses the same save-failure and retry semantics
  as strokes.
- Foundation changes do not call stroke-renderer methods or recreate the active
  renderer.

- [ ] **Step 1: Write failing store tests**

```ts
it("updates the visible foundation immediately and appends once", async () => {
  const append = deferred<void>();
  const store = openStore({
    appendOperation: vi.fn(() => append.promise),
  });

  const saving = store.setFoundation(figure);
  expect(store.getSnapshot()).toMatchObject({
    saveStatus: "saving",
    document: { foundation: figure },
  });
  expect(repository.appendOperation).toHaveBeenCalledWith(
    expect.objectContaining({
      type: "foundation.set",
      sequence: 1,
      foundation: figure,
    }),
  );

  append.resolve();
  await saving;
  expect(store.getSnapshot().saveStatus).toBe("saved");
});

it("retries the same immutable foundation operation after failure", async () => {
  await store.setFoundation(figure);
  await store.retrySave();
  const calls = vi.mocked(repository.appendOperation).mock.calls;
  expect(calls[0]?.[0]).toBe(calls[1]?.[0]);
});
```

Also assert that mutating the caller's matrix or landmark array after
`setFoundation` does not alter the operation or document.

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```bash
pnpm exec vitest run src/state/editorStore.test.ts
```

Expected: FAIL because `setFoundation` does not exist.

- [ ] **Step 3: Implement the minimal store method**

```ts
public setFoundation(foundation: FoundationState | null): Promise<void> {
  const startedAt = this.#performance.now();
  const document = this.#requireDocument();
  const operation: FoundationSetOperation = Object.freeze({
    type: "foundation.set",
    operationId: this.#createId(),
    projectId: document.projectId,
    sequence: document.operationSequence + 1,
    committedAt: this.#now(),
    foundation: immutableFoundation(foundation),
  });
  return this.#queueOperation(
    operation,
    documentReducer(document, operation),
    startedAt,
  );
}
```

Rename the diagnostic measure from `stroke-durability` to
`operation-durability` because the queue now measures more than strokes. Update
the exact test expectation.

- [ ] **Step 4: Run store tests and quality**

Run:

```bash
pnpm exec vitest run src/state/editorStore.test.ts
pnpm quality
```

Expected: PASS with existing stroke, retry, Back-protection, and navigation
behavior unchanged.

- [ ] **Step 5: Commit**

```bash
git add src/state/editorStore.ts src/state/editorStore.test.ts
git commit -m "feat: journal foundation changes in the editor"
```

---

### Task 5: Composite the Semantic SVG Foundation Beneath Artwork

**Files:**

- Create: `src/features/foundations/FoundationOverlay.tsx`
- Create: `src/features/foundations/FoundationOverlay.test.tsx`
- Create: `src/features/foundations/svgMatrix.ts`
- Create: `src/features/foundations/svgMatrix.test.ts`
- Modify: `src/features/canvas/DrawingSurface.tsx`
- Modify: `src/features/canvas/DrawingSurface.test.tsx`
- Modify: `src/features/canvas/createDrawingController.ts`
- Modify: `src/app/app.css`

**Interfaces:**

- Consumes: `FoundationState`, `FoundationAsset`, `getFoundationAsset`, existing
  `Matrix3`, and the current canvas viewport.
- Produces:

```ts
export type FoundationOverlayHandle = Readonly<{
  setViewport(matrix: Matrix3): void;
  setPreviewTransform(transform: Matrix3 | null): void;
  getInverseViewport(): Matrix3;
}>;

export function svgMatrix(matrix: Matrix3): string;
```

`createDrawingController` gains:

```ts
onViewportChange?: (matrix: Matrix3) => void;
```

It invokes the callback after initial fit and on every viewport update. This
callback never enters React state.

- [ ] **Step 1: Write failing matrix and overlay tests**

```ts
it("maps the row-major affine matrix into SVG order", () => {
  expect(svgMatrix([2, 0, 40, 0, 3, 50, 0, 0, 1])).toBe(
    "matrix(2 0 0 3 40 50)",
  );
});

it("renders only selected semantic groups under the artwork", () => {
  render(
    <FoundationOverlay
      foundation={{
        ...figure,
        visibleLandmarkGroups: ["outline", "center"],
      }}
      ref={ref}
    />,
  );
  expect(screen.getByTestId("foundation-outline-use")).toHaveAttribute(
    "href",
    "/foundations/neutral-figure-front-v1.svg#foundation-outline",
  );
  expect(screen.queryByTestId("foundation-levels-use")).toBeNull();
});

it("keeps the existing canvas and controller alive when foundation state changes", async () => {
  const view = renderSurface(store, renderer, viewport);
  const initialCanvas = view.surface;
  await store.setFoundation(figure);
  expect(view.surface).toBe(initialCanvas);
  expect(view.rendererFactory).toHaveBeenCalledTimes(1);
  expect(viewport.reset).toHaveBeenCalledTimes(1);
});
```

- [ ] **Step 2: Run focused tests and verify RED**

Run:

```bash
pnpm exec vitest run src/features/foundations/FoundationOverlay.test.tsx src/features/foundations/svgMatrix.test.ts src/features/canvas/DrawingSurface.test.tsx
```

Expected: FAIL because the overlay and viewport callback do not exist.

- [ ] **Step 3: Implement the imperative SVG overlay**

The paper DOM becomes:

```tsx
<div className="drawing-surface__paper">
  <FoundationOverlay
    foundation={snapshot.document?.foundation ?? null}
    ref={foundationOverlayRef}
  />
  <div className="drawing-surface__canvas-mount" ref={canvasMountRef} />
</div>
```

`FoundationOverlay` renders a full-inset guide SVG with one `<use>` per visible
semantic group. It composes:

```ts
const composed = multiply(
  viewportMatrix,
  previewTransform ?? foundation.transform,
);
group.setAttribute("transform", svgMatrix(composed));
```

Use `vector-effect="non-scaling-stroke"`, `fill="none"`, rounded caps/joins,
`currentColor`, and Foundation opacity. Unknown asset ID/version renders no
guide, sets `data-foundation-missing="true"`, and does not throw.

- [ ] **Step 4: Make the canvas transparent without changing paper**

Keep `--color-document` on `.drawing-surface__paper`. Change the canvas to
transparent and layer it above the SVG:

```css
.foundation-overlay__guide,
.drawing-surface__canvas-mount,
.drawing-surface__canvas {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
}

.foundation-overlay__guide {
  z-index: 0;
  overflow: visible;
  pointer-events: none;
}

.drawing-surface__canvas-mount {
  z-index: 1;
}

.drawing-surface__canvas {
  background: transparent;
}
```

Paper size, aspect ratio, border, and shadow remain unchanged.

- [ ] **Step 5: Forward viewport changes without React renders**

Call `onViewportChange?.(matrix)` beside each `renderer.setViewport(matrix)`.
DrawingSurface forwards directly to
`foundationOverlayRef.current?.setViewport(matrix)`. Do not add Foundation or
viewport state to the drawing-controller layout-effect dependencies.

- [ ] **Step 6: Run tests and quality**

Run:

```bash
pnpm exec vitest run src/features/foundations src/features/canvas
pnpm quality
```

Expected: both assets render below retained and preview strokes in WebGL2 and
Canvas2D modes; drawing-controller construction count and paper fit are
unchanged.

- [ ] **Step 7: Commit**

```bash
git add src/features/foundations/FoundationOverlay.tsx src/features/foundations/FoundationOverlay.test.tsx src/features/foundations/svgMatrix.ts src/features/foundations/svgMatrix.test.ts src/features/canvas src/app/app.css
git commit -m "feat: render foundations beneath artwork"
```

---

### Task 6: Pencil and Touch Foundation Transform Controller

**Files:**

- Create: `src/features/foundations/createFoundationTransformController.ts`
- Create: `src/features/foundations/createFoundationTransformController.test.ts`
- Modify: `src/features/foundations/FoundationOverlay.tsx`
- Modify: `src/features/foundations/FoundationOverlay.test.tsx`

**Interfaces:**

- Consumes: `FoundationState`, `Matrix3`, `invert`, `multiply`, `scale`,
  `translation`, and the overlay handle from Task 5.
- Extends `FoundationOverlay` with:

```ts
export type FoundationOverlayProps = Readonly<{
  foundation: FoundationState | null;
  onCommitTransform: (transform: Matrix3) => void | PromiseLike<void>;
}>;
```

- Produces:

```ts
export type FoundationTransformControllerOptions = Readonly<{
  surface: SVGSVGElement;
  getFoundation: () => FoundationState | null;
  getInverseViewport: () => Matrix3;
  previewTransform: (transform: Matrix3 | null) => void;
  commitTransform: (transform: Matrix3) => void | PromiseLike<void>;
}>;

export type FoundationTransformController = Readonly<{
  dispose(): void;
}>;

export function createFoundationTransformController(
  options: FoundationTransformControllerOptions,
): FoundationTransformController;
```

- One contact translates in document space.
- Two touch contacts scale uniformly about their document-space centroid.
- The absolute uniform scale encoded in the document transform is clamped to
  `0.25`–`4.00`, where identity is `1.00`; extract it with
  `Math.hypot(transform[0], transform[3])`.
- Rotation is not implemented.
- Pointer cancel or lost capture clears preview and commits nothing.
- The first active contact owns the gesture; unrelated pen contacts are ignored.

- [ ] **Step 1: Write failing pointer-ownership and transform tests**

```ts
it("previews translation and commits once on owner lift", () => {
  pointerDown(surface, { pointerId: 7, pointerType: "pen", x: 100, y: 200 });
  pointerMove(surface, { pointerId: 7, pointerType: "pen", x: 140, y: 260 });
  expect(previewTransform).toHaveBeenLastCalledWith(translation(40, 60));
  pointerUp(surface, { pointerId: 7, pointerType: "pen", x: 140, y: 260 });
  expect(commitTransform).toHaveBeenCalledTimes(1);
});

it("ignores a foreign Pencil and cancels without persistence", () => {
  pointerDown(surface, { pointerId: 7, pointerType: "pen", x: 100, y: 200 });
  pointerDown(surface, { pointerId: 8, pointerType: "pen", x: 300, y: 400 });
  pointerCancel(surface, { pointerId: 7, pointerType: "pen", x: 100, y: 200 });
  expect(commitTransform).not.toHaveBeenCalled();
  expect(previewTransform).toHaveBeenLastCalledWith(null);
});

it("uses two touches for uniform scale and commits after the final lift", () => {
  pointerDown(surface, {
    pointerId: 10,
    pointerType: "touch",
    x: 100,
    y: 100,
  });
  pointerDown(surface, {
    pointerId: 11,
    pointerType: "touch",
    x: 200,
    y: 100,
  });
  pointerMove(surface, {
    pointerId: 11,
    pointerType: "touch",
    x: 250,
    y: 100,
  });

  expect(previewTransform).toHaveBeenLastCalledWith([
    1.5, 0, -50, 0, 1.5, -50, 0, 0, 1,
  ]);

  pointerUp(surface, {
    pointerId: 11,
    pointerType: "touch",
    x: 250,
    y: 100,
  });
  expect(commitTransform).not.toHaveBeenCalled();
  pointerUp(surface, {
    pointerId: 10,
    pointerType: "touch",
    x: 100,
    y: 100,
  });
  expect(commitTransform).toHaveBeenCalledTimes(1);
});
```

The two-touch test must assert the complete expected matrix, not only that a
callback occurred.

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```bash
pnpm exec vitest run src/features/foundations/createFoundationTransformController.test.ts
```

Expected: FAIL because the controller does not exist.

- [ ] **Step 3: Implement contact ownership and preview**

Maintain:

```ts
const contacts = new Map<number, DocumentContact>();
let baselineContacts = new Map<number, DocumentContact>();
let baselineTransform: Matrix3 | null = null;
let preview: Matrix3 | null = null;
```

Map local pointer coordinates through `getInverseViewport()`. On the first valid
contact, snapshot the immutable Foundation transform. On movement, compute from
the baseline rather than accumulating deltas. Capture and release only accepted
pointer IDs.

- [ ] **Step 4: Integrate only while unlocked**

FoundationOverlay keeps its guide SVG below the canvas and adds a separate
full-inset `.foundation-overlay__interaction` SVG at `z-index: 2`, above the
canvas. The interaction SVG renders the restrained transform boundary plus one
transparent rectangle matching the transformed asset bounds. It has pointer
events only when `foundation.locked === false`; the guide lines remain below
Artwork.

Create/dispose the controller in a layout effect.
`previewTransform` imperatively updates both the guide group and transform
boundary. `commitTransform` calls the supplied `onCommitTransform`, and
DrawingSurface implements that callback as:

```ts
const commitFoundationTransform = (transform: Matrix3) => {
  const foundation = store.getSnapshot().document?.foundation;
  if (foundation && !foundation.locked) {
    return store.setFoundation({ ...foundation, transform });
  }
};
```

Locked state leaves the interaction SVG `pointer-events: none`, so Pencil draws
and touch navigates exactly as before.

- [ ] **Step 5: Run transform, overlay, and canvas tests**

Run:

```bash
pnpm exec vitest run src/features/foundations src/features/canvas
pnpm quality
```

Expected: move, pinch-scale, cancel, lost capture, foreign pointers, locking,
and viewport conversion pass without regressing Pencil drawing or touch
navigation.

- [ ] **Step 6: Commit**

```bash
git add src/features/foundations
git commit -m "feat: transform unlocked foundations with Pencil or touch"
```

---

### Task 7: Controlled Edge Shelves and the Focused Layers UI

**Files:**

- Create: `src/features/foundations/LayersShelf.tsx`
- Create: `src/features/foundations/LayersShelf.test.tsx`
- Create: `src/features/foundations/foundationEdits.ts`
- Create: `src/features/foundations/foundationEdits.test.ts`
- Modify: `src/features/brushes/BrushShelf.tsx`
- Modify: `src/features/brushes/BrushShelf.test.tsx`
- Modify: `src/features/canvas/DrawingSurface.tsx`
- Modify: `src/features/canvas/DrawingSurface.test.tsx`
- Modify: `src/app/app.css`

**Interfaces:**

- Consumes: catalog, Foundation state helpers, `EditorStore.setFoundation`,
  FoundationOverlay, and transform controller.
- Produces:

```ts
export type EdgeShelfId = "brushes" | "layers";

export type ControlledShelfProps = Readonly<{
  open: boolean;
  onOpenChange(open: boolean): void;
}>;

export function replaceFoundationAsset(
  current: FoundationState,
  asset: FoundationAsset,
): FoundationState;
export function setFoundationScale(
  foundation: FoundationState,
  asset: FoundationAsset,
  scaleValue: number,
): FoundationState;
export function flipFoundation(
  foundation: FoundationState,
  asset: FoundationAsset,
): FoundationState;
```

- DrawingSurface owns `openShelf: EdgeShelfId | null`; only one shelf may be
  open.
- Switching between the coordinated figure and dress form preserves transform,
  opacity, visibility, lock state, and supported landmark visibility.
- `flipFoundation` mirrors around the transformed asset center line without
  moving its on-screen center.
- `setFoundationScale` preserves the transformed center of the asset bounds.
  Given current transform `M`, asset-space center `p`, mapped center `c = M(p)`,
  current absolute scale `s = Math.hypot(M[0], M[3])`, and requested scale `n`,
  return `T(c) × S(n / s) × T(-c) × M`.
- `flipFoundation` returns
  `M × T(centerLineX, 0) × S(-1, 1) × T(-centerLineX, 0)`.

- [ ] **Step 1: Write failing edit-helper and shelf tests**

```ts
it("preserves placement when switching from figure to dress form", () => {
  expect(replaceFoundationAsset(placedFigure, dressForm)).toMatchObject({
    assetId: "dress-form-front",
    assetVersion: 1,
    transform: placedFigure.transform,
    opacity: placedFigure.opacity,
    locked: placedFigure.locked,
  });
});

it("shows only real Foundation and Artwork rows", async () => {
  render(<LayersShelf open onOpenChange={vi.fn()} store={store} />);
  expect(screen.getByText("Foundation")).toBeVisible();
  expect(screen.getByText("Artwork")).toBeVisible();
  expect(screen.queryByText("Mask")).toBeNull();
});

it("keeps only one edge shelf open", async () => {
  renderSurface(store);
  await user.click(screen.getByRole("button", { name: "Brushes" }));
  await user.click(screen.getByRole("button", { name: "Layers" }));
  expect(screen.queryByRole("complementary", { name: "Brushes" })).toBeNull();
  expect(screen.getByRole("complementary", { name: "Layers" })).toBeVisible();
});
```

- [ ] **Step 2: Run focused tests and verify RED**

Run:

```bash
pnpm exec vitest run src/features/foundations/LayersShelf.test.tsx src/features/foundations/foundationEdits.test.ts src/features/brushes/BrushShelf.test.tsx src/features/canvas/DrawingSurface.test.tsx
```

Expected: FAIL because the controlled shelf and Layers UI do not exist.

- [ ] **Step 3: Convert Brushes to controlled state**

Replace its private `open` state with `open` and `onOpenChange`. Keep Escape,
canvas-contact dismissal, native radio semantics, and all current tests.

DrawingSurface owns:

```ts
const [openShelf, setOpenShelf] = useState<EdgeShelfId | null>(null);
```

Opening one shelf replaces the other. Closing sets `null`.

- [ ] **Step 4: Implement the narrow Layers shelf**

When no Foundation exists, show:

- Foundation — None.
- `Add foundation`.
- Artwork.

The picker contains two 56px rows with code-native SVG thumbnails and the
catalog names.

When a Foundation exists, show:

- Asset choice.
- Opacity range `0.10`–`1.00`, step `0.05`.
- Visibility button.
- Lock/unlock button.
- Landmark checkboxes for the asset's registered groups.
- Scale range `0.25`–`4.00`, step `0.05`.
- Horizontal flip.
- Replace.
- Remove.
- Artwork row.

Every accepted control change calls `store.setFoundation` once. Range input
changes preview locally during drag. Persist once on `pointerup`, `keyup`, or
`blur`, with a shared dedupe guard so one gesture never journals twice. Do not
journal on every React range `onChange` event.

For an unknown asset, render:

```text
Foundation unavailable
Your artwork is safe.
Replace
Remove
```

Do not show a broken thumbnail or block drawing.

- [ ] **Step 5: Add the restrained one-time pulse**

In an untouched project (`foundation === null` and `strokes.length === 0`), the
Layers handle receives `data-attention="true"` until that shelf is opened once
during the editor mount. The pulse runs once, stops after opening, and honors
`prefers-reduced-motion`.

- [ ] **Step 6: Match the north-star layout**

Place Layers on the logical end edge with the same 56px cross-axis target,
surface, border, typography, and oxblood selected rule as Brushes. The panel
overlays the field and never changes paper dimensions.

At 390 × 844, the open shelf must fit between safe areas with no horizontal
overflow. Long control content scrolls inside the panel; the page does not
scroll horizontally.

- [ ] **Step 7: Run UI tests and quality**

Run:

```bash
pnpm exec vitest run src/features/foundations src/features/brushes src/features/canvas
pnpm quality
```

Expected: picker, controls, missing asset, one-shelf rule, Escape/canvas
dismissal, one-time pulse, controller stability, and responsive DOM tests pass.

- [ ] **Step 8: Commit**

```bash
git add src/features/foundations src/features/brushes src/features/canvas src/app/app.css
git commit -m "feat: add the focused Foundation layers shelf"
```

---

### Task 8: Integrated Recovery, Visual QA, and Checkpoint A Handoff

**Files:**

- Modify: `src/app/App.test.tsx`
- Modify: `src/features/canvas/DrawingSurface.test.tsx`
- Modify: `src/platform/persistence/BrowserProjectRepository.integration.test.ts`
- Create: `docs/testing/traceable-fashion-foundation-checklist.md`
- Create: `docs/testing/traceable-fashion-foundation-ipad.png`
- Modify: `.superpowers/sdd/2026-07-28-traceable-fashion-foundation/progress.md`

**Interfaces:**

- Consumes: Tasks 1–7.
- Produces no new public product API.

- [ ] **Step 1: Add the full cross-system recovery test**

Create a project, set the figure Foundation, change opacity/landmarks/lock and
transform, commit one Denim stroke, snapshot, reopen through
`BrowserProjectRepository`, and assert:

```ts
expect(recovered).toEqual(
  expect.objectContaining({
    schemaVersion: 2,
    foundation: expect.objectContaining({
      assetId: "neutral-figure-front",
      assetVersion: 1,
      opacity: 0.55,
      locked: true,
      visibleLandmarkGroups: ["outline", "center"],
      transform: placedTransform,
    }),
    strokes: [
      expect.objectContaining({
        brush: expect.objectContaining({ id: "denim-v1" }),
      }),
    ],
  }),
);
```

Add an unknown pinned asset fixture and prove the editor renders the artwork,
the missing-guide message, and functional Brushes.

- [ ] **Step 2: Run integrated tests and fix only demonstrated gaps**

Run:

```bash
pnpm exec vitest run src/app src/features src/platform/persistence src/state
```

Expected: PASS. If a gap fails, add the smallest production fix at the owning
boundary and rerun the focused test before continuing.

- [ ] **Step 3: Exercise the real browser workflow**

On a fresh LAN-served project:

1. Create a new design.
2. Open Layers; confirm Brushes closes.
3. Add Neutral figure — Front.
4. Adjust opacity and landmark visibility.
5. Unlock, drag with Pencil, pinch-scale with touch, and relock.
6. Draw a fabric-brush stroke over the guide.
7. Hide and show the guide.
8. Switch to Professional dress form — Front without moving placement.
9. Return to the gallery and reopen.
10. Confirm exact Foundation and artwork recovery.
11. Remove the guide and confirm artwork remains.

Record that synthetic pointer input is not a substitute for the final
real-device Pencil transform check.

- [ ] **Step 4: Inspect visual fidelity**

Capture 1448 × 1086 and 390 × 844. Inspect beside the north-star image and
record:

- Warm paper and cool field unchanged.
- Foundation remains quiet beneath artwork.
- Both shelf handles and panels read as one component family.
- Open shelf overlays rather than resizes paper.
- Controls use 56px targets and oxblood selection.
- No horizontal overflow or safe-area collision.
- Locked mode has no transform chrome.
- Unknown-asset state protects the drawing surface from error UI.

- [ ] **Step 5: Run the complete gate**

Run:

```bash
pnpm quality
git diff --check
git status --short
```

Expected: zero failures; status contains only intentional Checkpoint A changes
plus preserved pre-existing user changes.

- [ ] **Step 6: Commit the integrated checkpoint**

```bash
git add src/app/App.test.tsx src/features/canvas/DrawingSurface.test.tsx src/platform/persistence/BrowserProjectRepository.integration.test.ts docs/testing/traceable-fashion-foundation-checklist.md docs/testing/traceable-fashion-foundation-ipad.png .superpowers/sdd/2026-07-28-traceable-fashion-foundation
git commit -m "feat: deliver the traceable fashion foundation"
```

If Step 2 required a production fix, review `git diff --name-only` and add that
exact owning file to this commit. Do not stage all of `src/` or the pre-existing
`vite.config.ts` and `docs/testing/` changes.

- [ ] **Step 7: Restart and hand off the live checkpoint**

Stop only the exact existing Fabric Sketcher Vite process. Restart:

```bash
pnpm dev
```

Verify both:

```text
http://localhost:5173/
http://192.168.1.242:5173/
```

Ping the user with the new functionality and a short Pencil/touch workflow to
try before planning Checkpoint B.
