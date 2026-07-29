# Essential Correction Controls Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver Goal 1 of the post-Checkpoint-A roadmap: adjustable brush
size, opacity, and colour; a brush-shaped reversible eraser; working undo and
redo over every mark; and a movable quick-tool puck.

**Architecture:** Brush customisation stays user-level state on the editor store
and is captured as an immutable `BrushSnapshot` at Pencil-down, exactly as
preset selection already is. The eraser becomes a new journalled
`erase.committed` operation carrying an `EraserSnapshot` and its own samples, so
stored stroke samples are never rewritten; the renderers composite it as
destination-out over the transparent artwork canvas, which reveals the DOM
foundation and paper beneath without touching them. Undo and redo reuse the
existing `stroke.visibility-set` operation, widened to target strokes and erases
alike, with an in-session redo stack. Documents move to schema version 3, and
version 1 and 2 snapshots normalise forward with an empty erase list.

**Tech Stack:** React 19, TypeScript, WebGL2 GLSL ES 3.00, Canvas 2D, Pointer
Events, IndexedDB/OPFS repository contracts, Vitest, Testing Library, Vite PWA.

**Branch:** `feat/essential-correction-controls`

## Global Constraints

- Implement only Goal 1 of
  `docs/superpowers/specs/2026-07-29-post-checkpoint-a-roadmap-design.md`,
  which is Checkpoint B of
  `docs/superpowers/specs/2026-07-28-foundation-sketching-loop-design.md`.
- Do not implement stabilization, curve finishing, foundation symmetry, canvas
  flip, the Settings surface, layers, materials, or export. Those are Goals 2
  through 5.
- The stroke-commit path must stay open to a later sample-shaping stage. No code
  in this plan may assume that the samples reaching a commit are the raw pointer
  samples, or Goal 2 becomes a rewrite.
- The eraser writes a reversible operation. It never destructively modifies
  stored stroke samples.
- Undo and redo operate on user actions: one stroke is one action, one eraser
  contact is one action.
- Existing schema-version-1 and schema-version-2 projects open unchanged, with
  no destructive rewriting.
- Primary platform is iPadOS; primary drawing input is Apple Pencil. Touch
  navigates and operates the interface and never paints.
- Raw Pencil samples stay outside React. Brush, eraser, and tool selection are
  captured at Pencil-down and never change during an active contact.
- Preserve warm paper `#F7F3EC`, cool app field `#f2f1ef`, oxblood selection
  `#97251f`, restrained editorial chrome, and at least 80% default artwork
  viewport ownership.
- Every visible interactive target is at least 56 × 56 CSS pixels and is a
  native, VoiceOver-readable DOM control.
- Only one edge shelf may be open at once.
- No new runtime dependency is added.
- No generative AI and no runtime network content is introduced.
- Do not edit any file under `docs/superpowers/specs/`.
- Every task ends with its focused tests, `pnpm quality`, and a small commit.

## Existing Test Fixtures To Reuse

Do not introduce parallel fixtures. These already exist and every test in this
plan uses them by these exact names.

- `src/state/editorStore.test.ts`: `samples`, `repository(overrides?)`,
  `renderer()`, `createDocumentFixture(projectId?, title?)`,
  `stroke(overrides?)`, `deferred<T>()`. Stores are opened with
  `await store.openProject("project-1")` and given fixed ids through
  `createId: () => "…"`.
- `src/features/canvas/DrawingSurface.test.tsx`: `projectRepository()`,
  `mockRenderer(kind?)`, `mockViewport()`, `openStore(repository)`,
  `renderSurface(store, renderer, viewport, options?)` whose result exposes
  `.surface`, `sample(clientX, clientY, timeStamp, pressure?, pointerType?)`,
  and `pointerEvent(type, values, predicted?)`.
- `src/engine/render/WebGL2Renderer.texture.test.ts`:
  `TextureCaptureWebGL2Context` with its `events: DrawEvent[]` recorder,
  `stroke(operationId, presetId)`, and `canvas()`.
- `src/engine/render/Canvas2DRenderer.texture.test.ts`: `FakeCanvasContext`
  with its `fills` and `patterns` recorders, `textureDocument()`, and
  `stroke()`.
- `src/platform/persistence/ProjectRepository.contract.ts`:
  `describeProjectRepositoryContract(adapterName, createHarness)` with a
  `harness` exposing `repository`, `setNow`, and `cleanup`, plus the exported
  `stroke`, `foundation`, and `visibility` operation builders.

## Checkpoints

1. **Checkpoint B-1 — a drawing you can control:** after Tasks 1 and 2, the
   running app exposes brush size, opacity, colour, five recent colours, and
   reset-to-preset. A thin dark line and a broad pale wash are both reachable
   with the same preset.
2. **Checkpoint B-2 — correction:** after Tasks 3 through 6, the eraser removes
   artwork without disturbing the guide or paper, and undo and redo walk every
   mark in both directions and survive reload.
3. **Checkpoint B-3 — showable milestone:** after Tasks 7 and 8, the quick-tool
   puck is in place, integrated recovery and browser QA pass, `pnpm quality` is
   green, and the device handoff checklist is written.

## File and Responsibility Map

**Create:**

- `src/engine/brush/brushEdits.ts` — pure clamped brush edits and recent-colour
  list. No DOM, no React.
- `src/engine/brush/brushEdits.test.ts`
- `src/engine/brush/eraser.ts` — derives an `EraserSnapshot` from a
  `BrushSnapshot`.
- `src/engine/brush/eraser.test.ts`
- `src/domain/document/documentMarks.ts` — ordering and lookup across strokes
  and erases.
- `src/domain/document/documentMarks.test.ts`
- `src/features/tools/QuickToolPuck.tsx` — movable puck.
- `src/features/tools/QuickToolPuck.test.tsx`
- `docs/testing/essential-correction-controls-checklist.md`

**Modify:**

- `src/domain/document/types.ts` — `HexColor`, `EraserSnapshot`,
  `EraseOperation`, `DocumentMark`, schema version 3, `erases`.
- `src/domain/document/createDocument.ts` — emit schema 3 with `erases: []`.
- `src/domain/document/documentReducer.ts` — reduce `erase.committed`; widen
  visibility targeting to marks.
- `src/domain/document/documentReducer.test.ts`
- `src/domain/document/createDocument.test.ts`
- `src/engine/brush/buildStrokeMesh.ts` — accept a structural geometry brush.
- `src/engine/render/Renderer.ts` — `RenderComposite` and
  `RenderStroke.composite`.
- `src/engine/render/WebGL2Renderer.ts` — erase blend function.
- `src/engine/render/Canvas2DRenderer.ts` — erase composite operation.
- `src/engine/render/WebGL2Renderer.texture.test.ts`
- `src/engine/render/Canvas2DRenderer.texture.test.ts`
- `src/platform/persistence/types.ts` — validate and normalise schema 3 and
  `erase.committed`.
- `src/platform/persistence/ProjectRepository.contract.ts` — export an `erase`
  builder and add the erase-recovery contract test.
- `src/state/editorStore.ts` — brush edits, tool mode, erase commit, undo/redo.
- `src/state/editorStore.test.ts`
- `src/features/brushes/BrushShelf.tsx` — size, opacity, colour, recents, reset.
- `src/features/brushes/BrushShelf.test.tsx`
- `src/features/canvas/createDrawingController.ts` — branch on tool at
  Pencil-down.
- `src/features/canvas/DrawingSurface.tsx` — mount the puck.
- `src/features/canvas/DrawingSurface.test.tsx`
- `src/app/app.css` — brush controls and puck styling.
- `src/platform/persistence/BrowserProjectRepository.integration.test.ts`

## Dependency and Parallelization Map

- Task 1 → Task 2.
- Task 1 → Task 3 (needs the `StrokeGeometry` signature).
- Task 3 and Task 4 may run in parallel.
- Task 3 and Task 4 → Task 5 → Task 6 → Task 7 → Task 8.

---

### Task 1: Brush Edit Domain and Store API

**Files:**

- Create: `src/engine/brush/brushEdits.ts`
- Create: `src/engine/brush/brushEdits.test.ts`
- Modify: `src/domain/document/types.ts`
- Modify: `src/engine/brush/buildStrokeMesh.ts:1-11`
- Modify: `src/state/editorStore.ts`
- Test: `src/state/editorStore.test.ts`

**Interfaces:**

- Consumes: `getBrushPreset(id)` from `src/engine/brush/presets.ts`;
  `BrushSnapshot` from `src/domain/document/types.ts`.
- Produces:
  - `type HexColor = \`#${string}\``exported from`src/domain/document/types.ts`.
  - `MIN_BRUSH_SIZE = 2`, `MAX_BRUSH_SIZE = 240`, `MIN_BRUSH_OPACITY = 0.05`,
    `MAX_BRUSH_OPACITY = 1`, `RECENT_COLOR_LIMIT = 5`.
  - `setBrushSize(brush: BrushSnapshot, size: number): BrushSnapshot`
  - `setBrushOpacity(brush: BrushSnapshot, opacity: number): BrushSnapshot`
  - `setBrushColor(brush: BrushSnapshot, color: string): BrushSnapshot`
  - `resetBrushToPreset(brush: BrushSnapshot): BrushSnapshot`
  - `addRecentColor(colors: readonly HexColor[], color: HexColor): readonly HexColor[]`
  - `class BrushColorError extends Error`
  - `type StrokeGeometry` accepted by `buildStrokeMesh`.
  - Store methods `setBrushSize(size)`, `setBrushOpacity(opacity)`,
    `setBrushColor(color)`, `resetBrush()`, and
    `EditorSnapshot.recentColors: readonly HexColor[]`.

- [ ] **Step 1: Write the failing brush-edit tests**

Create `src/engine/brush/brushEdits.test.ts`:

```tsx
import { describe, expect, it } from "vitest";
import type { HexColor } from "../../domain/document/types";
import { getBrushPreset } from "./presets";
import {
  BrushColorError,
  MAX_BRUSH_OPACITY,
  MAX_BRUSH_SIZE,
  MIN_BRUSH_OPACITY,
  MIN_BRUSH_SIZE,
  RECENT_COLOR_LIMIT,
  addRecentColor,
  resetBrushToPreset,
  setBrushColor,
  setBrushOpacity,
  setBrushSize,
} from "./brushEdits";

describe("brushEdits", () => {
  it("clamps size into the supported range and keeps preset identity", () => {
    const denim = getBrushPreset("denim-v1");

    expect(setBrushSize(denim, 1).size).toBe(MIN_BRUSH_SIZE);
    expect(setBrushSize(denim, 9000).size).toBe(MAX_BRUSH_SIZE);

    const resized = setBrushSize(denim, 64);
    expect(resized.size).toBe(64);
    expect(resized.id).toBe("denim-v1");
    expect(resized.texture).toEqual(denim.texture);
  });

  it("clamps opacity and keeps the current value for a non-finite request", () => {
    const silk = getBrushPreset("silk-v1");

    expect(setBrushOpacity(silk, 0).opacity).toBe(MIN_BRUSH_OPACITY);
    expect(setBrushOpacity(silk, 4).opacity).toBe(MAX_BRUSH_OPACITY);
    expect(setBrushOpacity(silk, Number.NaN).opacity).toBe(silk.opacity);
  });

  it("recolors without changing the characteristic texture", () => {
    const wool = getBrushPreset("wool-v1");
    const recolored = setBrushColor(wool, "#1B4B33");

    expect(recolored.color).toBe("#1b4b33");
    expect(recolored.texture).toEqual(wool.texture);
  });

  it("rejects a malformed color", () => {
    expect(() => setBrushColor(getBrushPreset("knit-v1"), "green")).toThrow(
      BrushColorError,
    );
  });

  it("restores every calibrated preset default", () => {
    const pencil = getBrushPreset("studio-pencil-v1");
    const edited = setBrushColor(
      setBrushOpacity(setBrushSize(pencil, 200), 0.1),
      "#123456",
    );

    expect(resetBrushToPreset(edited)).toEqual(pencil);
  });

  it("keeps the five most recent colors, newest first, without duplicates", () => {
    const entered: readonly HexColor[] = [
      "#111111",
      "#222222",
      "#333333",
      "#444444",
      "#555555",
      "#666666",
    ];
    const colors = entered.reduce<readonly HexColor[]>(
      (list, color) => addRecentColor(list, color),
      [],
    );

    expect(colors).toEqual([
      "#666666",
      "#555555",
      "#444444",
      "#333333",
      "#222222",
    ]);
    expect(colors).toHaveLength(RECENT_COLOR_LIMIT);
    expect(addRecentColor(colors, "#444444")).toEqual([
      "#444444",
      "#666666",
      "#555555",
      "#333333",
      "#222222",
    ]);
  });
});
```

Add these tests to the existing `describe` block in
`src/state/editorStore.test.ts`:

```tsx
it("edits the active brush and records recent colors", () => {
  const store = createEditorStore({ repository: repository() });

  store.selectBrush("silk-v1");
  store.setBrushSize(72);
  store.setBrushOpacity(0.25);
  store.setBrushColor("#2E4A3C");

  const brush = store.getActiveBrush();
  expect(brush.id).toBe("silk-v1");
  expect(brush.size).toBe(72);
  expect(brush.opacity).toBe(0.25);
  expect(brush.color).toBe("#2e4a3c");
  expect(brush.texture).toEqual(getBrushPreset("silk-v1").texture);
  expect(store.getSnapshot().recentColors).toEqual(["#2e4a3c"]);
});

it("resets the active brush to its preset defaults without clearing recents", () => {
  const store = createEditorStore({ repository: repository() });

  store.selectBrush("wool-v1");
  store.setBrushColor("#2E4A3C");
  store.setBrushSize(200);
  store.resetBrush();

  expect(store.getActiveBrush()).toEqual(getBrushPreset("wool-v1"));
  expect(store.getSnapshot().recentColors).toEqual(["#2e4a3c"]);
});

it("commits a stroke with the edited brush, not the bare preset", async () => {
  const operations: DocumentOperation[] = [];
  const store = createEditorStore({
    repository: repository({
      appendOperation: vi.fn(async (operation) => {
        operations.push(operation);
      }),
    }),
    createId: () => "stroke-1",
  });
  await store.openProject("project-1");

  store.selectBrush("denim-v1");
  store.setBrushSize(90);
  await store.commitStroke(samples);

  expect(operations[0]).toMatchObject({
    type: "stroke.committed",
    brush: { id: "denim-v1", size: 90 },
  });
});
```

- [ ] **Step 2: Run the focused tests and verify RED**

Run:

```bash
pnpm exec vitest run src/engine/brush/brushEdits.test.ts src/state/editorStore.test.ts
```

Expected: FAIL. `brushEdits.ts` does not exist, and the store has no
`setBrushSize`, `setBrushOpacity`, `setBrushColor`, `resetBrush`, or
`recentColors`.

- [ ] **Step 3: Add the `HexColor` alias and widen the mesh signature**

In `src/domain/document/types.ts`, add the alias above `FoundationType`:

```ts
export type HexColor = `#${string}`;
```

Change `BrushSnapshot`'s colour field from `color: \`#${string}\``to`color: HexColor`. This is an alias, so no call site changes.

In `src/engine/brush/buildStrokeMesh.ts`, replace the first eleven lines so an
eraser can reuse the same mesh builder:

```ts
import type { PenSample } from "../../domain/document/types";

/** Each vertex is stored as three consecutive floats in `(x, y, alpha)` order. */
export const STROKE_VERTEX_STRIDE = 3;

export type StrokeVertex = Readonly<{ x: number; y: number; alpha: number }>;

/** The only brush fields stroke geometry depends on. */
export type StrokeGeometry = Readonly<{
  size: number;
  opacity: number;
  pressureSize: number;
  pressureOpacity: number;
  tiltShape: number;
}>;

export function buildStrokeMesh(
  samples: readonly PenSample[],
  brush: StrokeGeometry,
): Float32Array {
```

Leave the body of `buildStrokeMesh` unchanged. `BrushSnapshot` satisfies
`StrokeGeometry` structurally, so existing callers keep compiling.

- [ ] **Step 4: Implement the pure brush edits**

Create `src/engine/brush/brushEdits.ts`:

```ts
import type { BrushSnapshot, HexColor } from "../../domain/document/types";
import { getBrushPreset } from "./presets";

export const MIN_BRUSH_SIZE = 2;
export const MAX_BRUSH_SIZE = 240;
export const MIN_BRUSH_OPACITY = 0.05;
export const MAX_BRUSH_OPACITY = 1;
export const RECENT_COLOR_LIMIT = 5;

const HEX_COLOR = /^#[0-9a-f]{6}$/i;

export class BrushColorError extends Error {
  constructor(value: string) {
    super(`Expected a six-digit hex color, received ${value}.`);
    this.name = "BrushColorError";
  }
}

export function setBrushSize(
  brush: BrushSnapshot,
  size: number,
): BrushSnapshot {
  return immutableBrush({
    ...brush,
    size: clamp(size, MIN_BRUSH_SIZE, MAX_BRUSH_SIZE, brush.size),
  });
}

export function setBrushOpacity(
  brush: BrushSnapshot,
  opacity: number,
): BrushSnapshot {
  return immutableBrush({
    ...brush,
    opacity: clamp(
      opacity,
      MIN_BRUSH_OPACITY,
      MAX_BRUSH_OPACITY,
      brush.opacity,
    ),
  });
}

export function setBrushColor(
  brush: BrushSnapshot,
  color: string,
): BrushSnapshot {
  if (!HEX_COLOR.test(color)) {
    throw new BrushColorError(color);
  }
  return immutableBrush({ ...brush, color: color.toLowerCase() as HexColor });
}

export function resetBrushToPreset(brush: BrushSnapshot): BrushSnapshot {
  return getBrushPreset(brush.id);
}

export function addRecentColor(
  colors: readonly HexColor[],
  color: HexColor,
): readonly HexColor[] {
  const normalized = color.toLowerCase() as HexColor;
  return Object.freeze(
    [normalized, ...colors.filter((entry) => entry !== normalized)].slice(
      0,
      RECENT_COLOR_LIMIT,
    ),
  );
}

function clamp(
  value: number,
  minimum: number,
  maximum: number,
  fallback: number,
): number {
  if (!Number.isFinite(value)) {
    return fallback;
  }
  return Math.min(maximum, Math.max(minimum, value));
}

function immutableBrush(brush: BrushSnapshot): BrushSnapshot {
  return Object.freeze({
    ...brush,
    texture: Object.freeze({ ...brush.texture }),
  });
}
```

- [ ] **Step 5: Wire the store**

In `src/state/editorStore.ts`, add the import:

```ts
import {
  addRecentColor,
  resetBrushToPreset,
  setBrushColor,
  setBrushOpacity,
  setBrushSize,
} from "../engine/brush/brushEdits";
```

Add `HexColor` to the existing type import from `../domain/document/types`.

Add `recentColors` to `EditorSnapshot` after `brush`:

```ts
  recentColors: readonly HexColor[];
```

Add the backing field beside `#brush`:

```ts
  #recentColors: readonly HexColor[] = Object.freeze([] as HexColor[]);
```

Add `recentColors: Object.freeze([])` to the initial `#snapshot` literal, after
`brush: studioPencil`.

Add the four public methods immediately after `selectBrush`:

```ts
  public setBrushSize(size: number): void {
    this.#applyBrush(setBrushSize(this.#brush, size));
  }

  public setBrushOpacity(opacity: number): void {
    this.#applyBrush(setBrushOpacity(this.#brush, opacity));
  }

  public setBrushColor(color: HexColor): void {
    const brush = setBrushColor(this.#brush, color);
    this.#recentColors = addRecentColor(this.#recentColors, brush.color);
    this.#brush = brush;
    this.#update({ brush, recentColors: this.#recentColors });
  }

  public resetBrush(): void {
    this.#applyBrush(resetBrushToPreset(this.#brush));
  }

  #applyBrush(brush: BrushSnapshot): void {
    this.#brush = brush;
    this.#update({ brush });
  }
```

- [ ] **Step 6: Run the focused tests and verify GREEN**

Run:

```bash
pnpm exec vitest run src/engine/brush src/state/editorStore.test.ts
```

Expected: PASS, with no failures.

- [ ] **Step 7: Run the full gate and commit**

Run:

```bash
pnpm quality
```

Expected: format, lint, typecheck, all tests, and build succeed. The three
jsdom `HTMLCanvasElement's getContext()` notices are known non-failing
environment noise.

```bash
git add src/domain/document/types.ts src/engine/brush src/state/editorStore.ts src/state/editorStore.test.ts
git commit -m "feat: edit brush size, opacity, and color"
```

---

### Task 2: Brush Controls in the Brushes Shelf

**Files:**

- Modify: `src/features/brushes/BrushShelf.tsx`
- Modify: `src/app/app.css`
- Test: `src/features/brushes/BrushShelf.test.tsx`

**Interfaces:**

- Consumes: store `setBrushSize`, `setBrushOpacity`, `setBrushColor`,
  `resetBrush`, `snapshot.brush`, `snapshot.recentColors` from Task 1;
  `MIN_BRUSH_SIZE`, `MAX_BRUSH_SIZE`, `MIN_BRUSH_OPACITY`, `MAX_BRUSH_OPACITY`
  from `src/engine/brush/brushEdits.ts`.
- Produces: accessible control names later tasks and tests rely on —
  `"Brush size"`, `"Brush opacity"`, `"Brush color"`,
  `"Reset brush to preset"`, and recent-colour buttons named
  `"Use color #rrggbb"`.

- [ ] **Step 1: Write the failing shelf tests**

Add to `src/features/brushes/BrushShelf.test.tsx` inside the existing
`describe("BrushShelf", …)`. The file already imports `fireEvent`, `render`,
`screen`, `userEvent`, and `vi`; add
`import { getBrushPreset } from "../../engine/brush/presets";` if it is absent.

```tsx
it("edits size, opacity, and color from the open shelf", async () => {
  const user = userEvent.setup();
  const store = createStore();

  render(<BrushShelf open onOpenChange={vi.fn()} store={store} />);

  fireEvent.change(screen.getByRole("slider", { name: "Brush size" }), {
    target: { value: "88" },
  });
  fireEvent.change(screen.getByRole("slider", { name: "Brush opacity" }), {
    target: { value: "0.3" },
  });
  fireEvent.change(screen.getByLabelText("Brush color"), {
    target: { value: "#2e4a3c" },
  });

  expect(store.getActiveBrush().size).toBe(88);
  expect(store.getActiveBrush().opacity).toBe(0.3);
  expect(store.getActiveBrush().color).toBe("#2e4a3c");

  await user.click(
    screen.getByRole("button", { name: "Reset brush to preset" }),
  );

  expect(store.getActiveBrush()).toEqual(getBrushPreset("studio-pencil-v1"));
});

it("reapplies a recent color without reopening the color control", async () => {
  const user = userEvent.setup();
  const store = createStore();

  render(<BrushShelf open onOpenChange={vi.fn()} store={store} />);

  fireEvent.change(screen.getByLabelText("Brush color"), {
    target: { value: "#2e4a3c" },
  });
  fireEvent.change(screen.getByLabelText("Brush color"), {
    target: { value: "#7a1f2b" },
  });
  await user.click(screen.getByRole("button", { name: "Use color #2e4a3c" }));

  expect(store.getActiveBrush().color).toBe("#2e4a3c");
});

it("preserves the preset texture through a color change", () => {
  const store = createStore();

  render(<BrushShelf open onOpenChange={vi.fn()} store={store} />);

  fireEvent.click(screen.getByRole("radio", { name: "Denim" }));
  fireEvent.change(screen.getByLabelText("Brush color"), {
    target: { value: "#2e4a3c" },
  });

  expect(store.getActiveBrush().texture).toEqual(
    getBrushPreset("denim-v1").texture,
  );
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```bash
pnpm exec vitest run src/features/brushes/BrushShelf.test.tsx
```

Expected: FAIL. No slider named `Brush size` exists.

- [ ] **Step 3: Add the controls to the shelf**

In `src/features/brushes/BrushShelf.tsx`, add the imports:

```tsx
import type { HexColor } from "../../domain/document/types";
import {
  MAX_BRUSH_OPACITY,
  MAX_BRUSH_SIZE,
  MIN_BRUSH_OPACITY,
  MIN_BRUSH_SIZE,
} from "../../engine/brush/brushEdits";
```

Insert this block inside the `<aside>`, directly after the closing `</div>` of
`brush-shelf__presets`:

```tsx
<div className="brush-shelf__controls">
  <label className="brush-shelf__range">
    <span>
      <span>Size</span>
      <output>{Math.round(snapshot.brush.size)} px</output>
    </span>
    <input
      aria-label="Brush size"
      max={MAX_BRUSH_SIZE}
      min={MIN_BRUSH_SIZE}
      onChange={(event) =>
        store.setBrushSize(event.currentTarget.valueAsNumber)
      }
      step={1}
      type="range"
      value={snapshot.brush.size}
    />
  </label>
  <label className="brush-shelf__range">
    <span>
      <span>Opacity</span>
      <output>{Math.round(snapshot.brush.opacity * 100)}%</output>
    </span>
    <input
      aria-label="Brush opacity"
      max={MAX_BRUSH_OPACITY}
      min={MIN_BRUSH_OPACITY}
      onChange={(event) =>
        store.setBrushOpacity(event.currentTarget.valueAsNumber)
      }
      step={0.05}
      type="range"
      value={snapshot.brush.opacity}
    />
  </label>
  <label className="brush-shelf__color">
    <span>Color</span>
    <input
      aria-label="Brush color"
      onChange={(event) =>
        store.setBrushColor(event.currentTarget.value as HexColor)
      }
      type="color"
      value={snapshot.brush.color}
    />
  </label>
  {snapshot.recentColors.length > 0 ? (
    <div aria-label="Recent colors" className="brush-shelf__recents">
      {snapshot.recentColors.map((color) => (
        <button
          aria-label={`Use color ${color}`}
          className="brush-shelf__recent"
          key={color}
          onClick={() => store.setBrushColor(color)}
          style={{ backgroundColor: color }}
          type="button"
        />
      ))}
    </div>
  ) : null}
  <button
    className="brush-shelf__reset"
    onClick={() => store.resetBrush()}
    type="button"
  >
    Reset brush to preset
  </button>
</div>
```

- [ ] **Step 4: Style the controls**

Append to `src/app/app.css`:

```css
.brush-shelf__controls {
  display: grid;
  gap: 12px;
  padding: 16px;
  border-block-start: 1px solid var(--color-line);
}

.brush-shelf__range {
  display: grid;
  gap: 6px;
  min-block-size: 56px;
}

.brush-shelf__range > span {
  display: flex;
  justify-content: space-between;
  color: var(--color-muted);
  font-size: 0.875rem;
}

.brush-shelf__range input[type="range"] {
  accent-color: var(--color-accent);
  min-block-size: 32px;
  inline-size: 100%;
}

.brush-shelf__color {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  min-block-size: 56px;
  color: var(--color-muted);
  font-size: 0.875rem;
}

.brush-shelf__color input[type="color"] {
  min-inline-size: 56px;
  min-block-size: 56px;
  padding: 0;
  border: 1px solid var(--color-line);
  border-radius: 8px;
  background: none;
}

.brush-shelf__recents {
  display: flex;
  gap: 8px;
}

.brush-shelf__recent {
  min-inline-size: 56px;
  min-block-size: 56px;
  border: 1px solid var(--color-line);
  border-radius: 8px;
  cursor: pointer;
}

.brush-shelf__recent:focus-visible {
  outline: 2px solid var(--color-focus);
  outline-offset: 2px;
}

.brush-shelf__reset {
  min-block-size: 56px;
  padding: 12px;
  border: 1px solid var(--color-line);
  border-radius: 8px;
  background: var(--color-surface);
  color: var(--color-ink);
  font: inherit;
  cursor: pointer;
}

.brush-shelf__reset:hover {
  border-color: var(--color-accent);
  color: var(--color-accent);
}
```

- [ ] **Step 5: Run the focused test and verify GREEN**

Run:

```bash
pnpm exec vitest run src/features/brushes/BrushShelf.test.tsx
```

Expected: PASS, all tests in the file.

- [ ] **Step 6: Verify Checkpoint B-1 in a browser**

Run the app:

```bash
./run-app.sh
```

At the printed LAN URL, confirm by direct observation and record each result:

1. Open Brushes. Size, Opacity, Color, and Reset are visible below the presets.
2. With Pencil selected, set size 4 and opacity 100% and draw. The mark is a
   thin dark line.
3. Set size 200 and opacity 15% and draw. The mark is a broad pale wash with
   the same graphite grain.
4. Set colour to a green and draw. The grain is unchanged and the mark is green.
5. Two recent colour swatches appear. Tapping the older one restores it.
6. Press Reset brush to preset. Size, opacity, and colour return to the Pencil
   defaults.
7. Measure each new control's box. Every one is at least 56 × 56 CSS pixels.
8. With the shelf closed, the paper still occupies at least 80% of the field.

- [ ] **Step 7: Run the full gate and commit**

```bash
pnpm quality
git add src/features/brushes src/app/app.css
git commit -m "feat: expose brush size, opacity, and color in the shelf"
```

---

### Task 3: Eraser Domain, Mark Ordering, and Schema Version 3

**Files:**

- Create: `src/engine/brush/eraser.ts`
- Create: `src/engine/brush/eraser.test.ts`
- Create: `src/domain/document/documentMarks.ts`
- Create: `src/domain/document/documentMarks.test.ts`
- Modify: `src/domain/document/types.ts`
- Modify: `src/domain/document/createDocument.ts`
- Modify: `src/domain/document/documentReducer.ts`
- Modify: `src/platform/persistence/types.ts`
- Test: `src/domain/document/documentReducer.test.ts`
- Test: `src/domain/document/createDocument.test.ts`
- Test: `src/platform/persistence/ProjectRepository.contract.ts`

**Interfaces:**

- Consumes: `BrushSnapshot`, `PenSample`, `StrokeOperation`, `DesignDocument`
  from `src/domain/document/types.ts`; `StrokeGeometry` from Task 1.
- Produces:
  - `EraserSnapshot`, `EraseOperation`, `DocumentMark` in
    `src/domain/document/types.ts`; `DesignDocument.schemaVersion` becomes `3`
    and gains `erases: readonly EraseOperation[]`.
  - `createEraserSnapshot(brush: BrushSnapshot): EraserSnapshot` in
    `src/engine/brush/eraser.ts`.
  - `orderedMarks(document): readonly DocumentMark[]`,
    `orderedVisibleMarks(document): readonly DocumentMark[]`,
    `lastVisibleMark(document): DocumentMark | null`,
    `findMark(document, operationId): DocumentMark | null` in
    `src/domain/document/documentMarks.ts`.
  - An exported `erase(overrides?)` builder in
    `src/platform/persistence/ProjectRepository.contract.ts`, matching the
    existing exported `stroke` and `visibility` builders.

- [ ] **Step 1: Write the failing eraser and mark tests**

Create `src/engine/brush/eraser.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { setBrushSize } from "./brushEdits";
import { createEraserSnapshot } from "./eraser";
import { getBrushPreset } from "./presets";

describe("createEraserSnapshot", () => {
  it("takes the active brush tip shape and carries no color or texture", () => {
    const wool = setBrushSize(getBrushPreset("wool-v1"), 96);
    const eraser = createEraserSnapshot(wool);

    expect(eraser).toEqual({
      tipBrushId: "wool-v1",
      size: 96,
      opacity: wool.opacity,
      pressureSize: wool.pressureSize,
      pressureOpacity: wool.pressureOpacity,
      tiltShape: wool.tiltShape,
    });
    expect(Object.hasOwn(eraser, "color")).toBe(false);
    expect(Object.hasOwn(eraser, "texture")).toBe(false);
  });
});
```

Create `src/domain/document/documentMarks.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { getBrushPreset } from "../../engine/brush/presets";
import { createDocument } from "./createDocument";
import {
  findMark,
  lastVisibleMark,
  orderedMarks,
  orderedVisibleMarks,
} from "./documentMarks";
import type {
  DesignDocument,
  EraseOperation,
  PenSample,
  StrokeOperation,
} from "./types";

const markSamples: readonly PenSample[] = [
  {
    x: 0,
    y: 0,
    pressure: 0.5,
    tiltX: 0,
    tiltY: 0,
    twist: 0,
    altitudeAngle: null,
    azimuthAngle: null,
    time: 0,
  },
  {
    x: 10,
    y: 10,
    pressure: 0.5,
    tiltX: 0,
    tiltY: 0,
    twist: 0,
    altitudeAngle: null,
    azimuthAngle: null,
    time: 10,
  },
];

function markStroke(operationId: string, sequence: number): StrokeOperation {
  return {
    type: "stroke.committed",
    operationId,
    projectId: "project",
    layerId: "paint-layer:project",
    sequence,
    committedAt: "2026-07-29T00:00:00.000Z",
    brush: getBrushPreset("studio-pencil-v1"),
    samples: markSamples,
  };
}

function markErase(operationId: string, sequence: number): EraseOperation {
  return {
    type: "erase.committed",
    operationId,
    projectId: "project",
    layerId: "paint-layer:project",
    sequence,
    committedAt: "2026-07-29T00:00:00.000Z",
    eraser: {
      tipBrushId: "studio-pencil-v1",
      size: 40,
      opacity: 1,
      pressureSize: 1,
      pressureOpacity: 0,
      tiltShape: 0,
    },
    samples: markSamples,
  };
}

function documentWith(
  strokes: readonly StrokeOperation[],
  erases: readonly EraseOperation[],
  hiddenStrokeIds: readonly string[] = [],
): DesignDocument {
  return {
    ...createDocument({ projectId: "project", title: "Marks" }),
    operationSequence: 10,
    strokes,
    erases,
    hiddenStrokeIds,
  };
}

describe("documentMarks", () => {
  it("interleaves strokes and erases in commit order", () => {
    const document = documentWith(
      [markStroke("s1", 1), markStroke("s2", 3)],
      [markErase("e1", 2), markErase("e2", 4)],
    );

    expect(orderedMarks(document).map((mark) => mark.operationId)).toEqual([
      "s1",
      "e1",
      "s2",
      "e2",
    ]);
  });

  it("omits hidden marks of either kind", () => {
    const document = documentWith(
      [markStroke("s1", 1), markStroke("s2", 3)],
      [markErase("e1", 2)],
      ["s2", "e1"],
    );

    expect(
      orderedVisibleMarks(document).map((mark) => mark.operationId),
    ).toEqual(["s1"]);
  });

  it("reports the newest visible mark and finds marks by id", () => {
    const document = documentWith(
      [markStroke("s1", 1)],
      [markErase("e1", 2), markErase("e2", 5)],
      ["e2"],
    );

    expect(lastVisibleMark(document)?.operationId).toBe("e1");
    expect(findMark(document, "e2")?.type).toBe("erase.committed");
    expect(findMark(document, "missing")).toBeNull();
  });
});
```

- [ ] **Step 2: Write the failing reducer, document, and contract tests**

Add to `src/domain/document/documentReducer.test.ts`. Reuse the file's existing
sample constant and stroke builder; add only this erase builder beside them,
substituting the file's own sample constant name for `markSamples`:

```ts
function eraseOperation(sequence: number): EraseOperation {
  return {
    type: "erase.committed",
    operationId: `erase-${sequence}`,
    projectId: "project",
    layerId: "paint-layer:project",
    sequence,
    committedAt: "2026-07-29T00:00:00.000Z",
    eraser: {
      tipBrushId: "studio-pencil-v1",
      size: 40,
      opacity: 1,
      pressureSize: 1,
      pressureOpacity: 0,
      tiltShape: 0,
    },
    samples: markSamples,
  };
}
```

```ts
it("appends an erase without touching stored stroke samples", () => {
  const base = documentReducer(
    createDocument({ projectId: "project", title: "Erase" }),
    strokeOperation(1),
  );
  const originalSamples = base.strokes[0]!.samples;

  const erased = documentReducer(base, eraseOperation(2));

  expect(erased.schemaVersion).toBe(3);
  expect(erased.erases).toHaveLength(1);
  expect(erased.strokes[0]!.samples).toEqual(originalSamples);
  expect(erased.hiddenStrokeIds).toEqual([]);
});

it("hides and reshows an erase through the visibility operation", () => {
  const withErase = documentReducer(
    documentReducer(
      createDocument({ projectId: "project", title: "Erase" }),
      strokeOperation(1),
    ),
    eraseOperation(2),
  );

  const hidden = documentReducer(withErase, {
    type: "stroke.visibility-set",
    operationId: "visibility-1",
    projectId: "project",
    sequence: 3,
    committedAt: "2026-07-29T00:00:00.000Z",
    targetOperationId: "erase-2",
    visible: false,
  });
  expect(hidden.hiddenStrokeIds).toEqual(["erase-2"]);

  const shown = documentReducer(hidden, {
    type: "stroke.visibility-set",
    operationId: "visibility-2",
    projectId: "project",
    sequence: 4,
    committedAt: "2026-07-29T00:00:00.000Z",
    targetOperationId: "erase-2",
    visible: true,
  });
  expect(shown.hiddenStrokeIds).toEqual([]);
});

it("rejects an erase with fewer than two samples", () => {
  const document = createDocument({ projectId: "project", title: "Erase" });
  const operation = eraseOperation(1);

  expect(() =>
    documentReducer(document, {
      ...operation,
      samples: [operation.samples[0]!],
    }),
  ).toThrow(DocumentStrokeError);
});

it("treats a replayed erase as idempotent", () => {
  const base = documentReducer(
    createDocument({ projectId: "project", title: "Erase" }),
    eraseOperation(1),
  );

  expect(documentReducer(base, eraseOperation(1))).toBe(base);
});
```

If the file names its stroke builder something other than `strokeOperation`,
use its name.

Add to `src/domain/document/createDocument.test.ts`:

```ts
it("creates a schema-version-3 document with no erases", () => {
  const document = createDocument({ projectId: "project", title: "New" });

  expect(document.schemaVersion).toBe(3);
  expect(document.erases).toEqual([]);
});
```

In `src/platform/persistence/ProjectRepository.contract.ts`, extract the
two-sample array that the existing exported `stroke` builder inlines into a
module-level `const contractSamples: readonly PenSample[]`, reference it from
`stroke`, and add the matching exported erase builder:

```ts
export const erase = (
  overrides: Partial<EraseOperation> = {},
): EraseOperation => ({
  type: "erase.committed",
  operationId: "erase-1",
  projectId: "project-1",
  layerId: "paint-layer:project-1",
  sequence: 2,
  committedAt: "2026-07-21T10:02:00.000Z",
  eraser: {
    tipBrushId: "studio-pencil-v1",
    size: 40,
    opacity: 1,
    pressureSize: 1,
    pressureOpacity: 0,
    tiltShape: 0,
  },
  samples: contractSamples,
  ...overrides,
});
```

Then add this test inside `describeProjectRepositoryContract`, so both the
memory and browser adapters run it:

```ts
it("recovers an erase operation at schema version 3", async () => {
  const document = createDocument({ projectId: "project-1", title: "Erase" });
  await harness.repository.createProject(document);
  await harness.repository.appendOperation(stroke());
  await harness.repository.appendOperation(erase());

  const reopened = await harness.repository.loadProject("project-1");

  expect(reopened.schemaVersion).toBe(3);
  expect(reopened.strokes.map((entry) => entry.operationId)).toEqual([
    "stroke-1",
  ]);
  expect(reopened.erases.map((entry) => entry.operationId)).toEqual([
    "erase-1",
  ]);
  expect(reopened.erases[0]!.eraser.tipBrushId).toBe("studio-pencil-v1");
});

it("hides an erase through a visibility operation", async () => {
  const document = createDocument({ projectId: "project-1", title: "Erase" });
  await harness.repository.createProject(document);
  await harness.repository.appendOperation(stroke());
  await harness.repository.appendOperation(erase());
  await harness.repository.appendOperation(
    visibility({
      operationId: "visibility-1",
      sequence: 3,
      targetOperationId: "erase-1",
      visible: false,
    }),
  );

  const reopened = await harness.repository.loadProject("project-1");

  expect(reopened.hiddenStrokeIds).toEqual(["erase-1"]);
  expect(reopened.erases).toHaveLength(1);
});
```

Add `EraseOperation` and `PenSample` to that file's type imports.

- [ ] **Step 3: Run the focused tests and verify RED**

Run:

```bash
pnpm exec vitest run src/engine/brush/eraser.test.ts src/domain/document src/platform/persistence
```

Expected: FAIL. `eraser.ts` and `documentMarks.ts` do not exist,
`EraseOperation` is not a type, and the reducer rejects `erase.committed`.

- [ ] **Step 4: Add the domain types**

In `src/domain/document/types.ts`, add after `BrushSnapshot`:

```ts
export type EraserSnapshot = Readonly<{
  tipBrushId: BrushPresetId;
  size: number;
  opacity: number;
  pressureSize: number;
  pressureOpacity: number;
  tiltShape: number;
}>;
```

Add after `StrokeOperation`:

```ts
export type EraseOperation = Readonly<{
  type: "erase.committed";
  operationId: string;
  projectId: string;
  layerId: string;
  sequence: number;
  committedAt: string;
  eraser: EraserSnapshot;
  samples: readonly PenSample[];
}>;

/** A stroke or an erase. Both are journalled, reversible artwork marks. */
export type DocumentMark = StrokeOperation | EraseOperation;
```

Add `EraseOperation` to the `DocumentOperation` union.

Add this comment above `StrokeVisibilityOperation`:

```ts
/**
 * Sets the visibility of one artwork mark. `targetOperationId` may name a
 * stroke or an erase. The operation type and `DesignDocument.hiddenStrokeIds`
 * keep their original names so existing journals stay readable without
 * migration.
 */
```

Change `DesignDocument`:

```ts
schemaVersion: 3;
```

and add after `strokes`:

```ts
  erases: readonly EraseOperation[];
```

In `src/domain/document/createDocument.ts`, set `schemaVersion: 3` and add
`erases: []` after `strokes: []`.

- [ ] **Step 5: Implement the eraser snapshot and mark selectors**

Create `src/engine/brush/eraser.ts`:

```ts
import type {
  BrushSnapshot,
  EraserSnapshot,
} from "../../domain/document/types";

/**
 * The eraser borrows the active brush's tip shape and pressure response. It
 * deliberately carries no colour or texture: erasing removes artwork alpha
 * rather than painting a material.
 */
export function createEraserSnapshot(brush: BrushSnapshot): EraserSnapshot {
  return Object.freeze({
    tipBrushId: brush.id,
    size: brush.size,
    opacity: brush.opacity,
    pressureSize: brush.pressureSize,
    pressureOpacity: brush.pressureOpacity,
    tiltShape: brush.tiltShape,
  });
}
```

Create `src/domain/document/documentMarks.ts`:

```ts
import type { DesignDocument, DocumentMark } from "./types";

export function orderedMarks(
  document: DesignDocument,
): readonly DocumentMark[] {
  return Object.freeze(
    [...document.strokes, ...document.erases].sort(
      (left, right) => left.sequence - right.sequence,
    ),
  );
}

export function orderedVisibleMarks(
  document: DesignDocument,
): readonly DocumentMark[] {
  return Object.freeze(
    orderedMarks(document).filter(
      (mark) => !document.hiddenStrokeIds.includes(mark.operationId),
    ),
  );
}

export function lastVisibleMark(document: DesignDocument): DocumentMark | null {
  return orderedVisibleMarks(document).at(-1) ?? null;
}

export function findMark(
  document: DesignDocument,
  operationId: string,
): DocumentMark | null {
  return (
    orderedMarks(document).find((mark) => mark.operationId === operationId) ??
    null
  );
}
```

- [ ] **Step 6: Reduce the erase operation**

In `src/domain/document/documentReducer.ts`, change the leading idempotence
guard so a replayed erase is also a no-op:

```ts
if (
  document.strokes.some(
    (stroke) => stroke.operationId === operation.operationId,
  ) ||
  document.erases.some((erase) => erase.operationId === operation.operationId)
) {
  return document;
}
```

In the `stroke.visibility-set` branch, widen the target check:

```ts
const targetExists =
  document.strokes.some(
    (stroke) => stroke.operationId === operation.targetOperationId,
  ) ||
  document.erases.some(
    (erase) => erase.operationId === operation.targetOperationId,
  );
```

Add an `erase.committed` branch immediately before the final stroke handling:

```ts
if (operation.type === "erase.committed") {
  if (operation.samples.length < 2) {
    throw new DocumentStrokeError(operation.samples.length);
  }

  return {
    ...document,
    operationSequence: operation.sequence,
    erases: [...document.erases, operation],
  };
}
```

Add `EraseOperation` to the file's type imports.

- [ ] **Step 7: Validate and normalise schema 3**

In `src/platform/persistence/types.ts`:

1. Add `EraseOperation` and `EraserSnapshot` to the type imports.
2. In `normalizeDesignDocument`, accept schema version 1, 2, or 3 in the guard,
   and additionally require `Array.isArray(candidate.erases)` when
   `candidate.schemaVersion === 3`.
3. Return `schemaVersion: 3` and add, after the `strokes` field:

```ts
    erases:
      candidate.schemaVersion === 3
        ? (candidate.erases as readonly EraseOperation[]).map((erase) => ({
            ...erase,
            samples: [...erase.samples],
          }))
        : [],
```

4. Add these validators beside the existing ones:

```ts
function isEraserSnapshot(value: unknown): value is EraserSnapshot {
  return (
    isRecord(value) &&
    isBrushPresetId(value.tipBrushId) &&
    isPositiveFiniteNumber(value.size) &&
    isUnitIntervalFiniteNumber(value.opacity) &&
    isUnitIntervalFiniteNumber(value.pressureSize) &&
    isUnitIntervalFiniteNumber(value.pressureOpacity) &&
    isUnitIntervalFiniteNumber(value.tiltShape)
  );
}

function isValidEraseOperation(value: unknown): value is EraseOperation {
  return (
    isOperationMetadata(value) &&
    value.type === "erase.committed" &&
    typeof value.layerId === "string" &&
    value.layerId.length > 0 &&
    isEraserSnapshot(value.eraser) &&
    Array.isArray(value.samples) &&
    value.samples.length >= 2 &&
    value.samples.every(isPenSample)
  );
}
```

5. Register it in `normalizeDocumentOperation`, immediately after the stroke
   check:

```ts
if (isValidEraseOperation(value)) {
  return value;
}
```

6. In `isCanonicalDocumentHistory`, build the valid mark-id set from strokes and
   erases so `hiddenStrokeIds` may reference either kind. Immediately after the
   existing `operationIds` uniqueness check, add:

```ts
const eraseIds = Array.isArray(candidate.erases)
  ? (candidate.erases as readonly unknown[])
      .filter(isValidEraseOperation)
      .map((erase) => erase.operationId)
  : [];
const markIds = [...operationIds, ...eraseIds];
```

and change the `hiddenStrokeIds` membership test from
`operationIds.includes(operationId)` to `markIds.includes(operationId)`.

- [ ] **Step 8: Run the focused tests and verify GREEN**

Run:

```bash
pnpm exec vitest run src/engine/brush src/domain/document src/platform/persistence
```

Expected: PASS, including the existing schema-1 and schema-2 compatibility
tests.

- [ ] **Step 9: Run the full gate and commit**

```bash
pnpm quality
git add src/domain/document src/engine/brush src/platform/persistence
git commit -m "feat: journal reversible erase operations at schema v3"
```

---

### Task 4: Erase Compositing in Both Renderers

**Files:**

- Modify: `src/engine/render/Renderer.ts`
- Modify: `src/engine/render/WebGL2Renderer.ts:300-355`
- Modify: `src/engine/render/Canvas2DRenderer.ts:108-203`
- Test: `src/engine/render/WebGL2Renderer.texture.test.ts`
- Test: `src/engine/render/Canvas2DRenderer.texture.test.ts`

**Interfaces:**

- Consumes: the existing `Renderer` interface and `RenderStroke`.
- Produces:
  - `type RenderComposite = "paint" | "erase"` and a required
    `RenderStroke.composite` field in `src/engine/render/Renderer.ts`.
  - WebGL2 uses `blendFunc(ZERO, ONE_MINUS_SRC_ALPHA)` for erase marks and
    restores `blendFunc(ONE, ONE_MINUS_SRC_ALPHA)` afterwards.
  - Canvas 2D uses `globalCompositeOperation = "destination-out"` with a solid
    `rgb(0 0 0)` fill for erase marks and restores `"source-over"` afterwards.

- [ ] **Step 1: Extend the two fake contexts**

In `src/engine/render/WebGL2Renderer.texture.test.ts`, add a `ZERO` constant to
`TextureCaptureWebGL2Context` beside the existing `ONE`:

```ts
  public readonly ZERO = 0;
```

Add a blend variant to the `DrawEvent` union:

```ts
  | Readonly<{ type: "blend"; source: number; destination: number }>
```

and replace the no-op `blendFunc` with a recorder:

```ts
  public blendFunc(source: number, destination: number): void {
    this.events.push({ type: "blend", source, destination });
  }
```

In `src/engine/render/Canvas2DRenderer.texture.test.ts`, add the composite
property to `FakeCanvasContext` and record it on every fill:

```ts
  public globalCompositeOperation = "source-over";
```

```ts
  public readonly fills: Array<
    Readonly<{ fillStyle: unknown; alpha: number; composite: string }>
  > = [];
```

```ts
  public fill(): void {
    this.fills.push({
      fillStyle: this.fillStyle,
      alpha: this.globalAlpha,
      composite: this.globalCompositeOperation,
    });
  }
```

Add `composite: "paint"` to the `RenderStroke` returned by the `stroke` builder
in each render test file, so the existing tests still typecheck.

- [ ] **Step 2: Write the failing renderer tests**

Add to `src/engine/render/WebGL2Renderer.texture.test.ts`:

```ts
it("erases with a destination-attenuating blend and restores paint blending", () => {
  const gl = new TextureCaptureWebGL2Context();
  const renderer = new WebGL2Renderer(canvas(), gl.asContext(), {
    getContext: () => gl.asContext(),
  });

  renderer.replaceDocument([
    stroke("painted", "denim-v1"),
    { ...stroke("erased", "denim-v1"), composite: "erase" },
  ]);
  renderer.render(0);

  const blends = gl.events.filter((event) => event.type === "blend");
  expect(blends).toHaveLength(3);
  expect(blends.slice(-2)).toEqual([
    { type: "blend", source: gl.ZERO, destination: gl.ONE_MINUS_SRC_ALPHA },
    { type: "blend", source: gl.ONE, destination: gl.ONE_MINUS_SRC_ALPHA },
  ]);
});
```

The first of the three blend calls is the one `initializeGpuState` makes in the
constructor. A painted mark must add none.

Add to `src/engine/render/Canvas2DRenderer.texture.test.ts`:

```ts
it("erases with destination-out and a solid fill, then restores source-over", () => {
  const context = new FakeCanvasContext();
  const renderer = new Canvas2DRenderer(
    document.createElement("canvas"),
    context.asContext(),
    textureDocument(),
  );
  renderer.replaceDocument([{ ...stroke(), composite: "erase" }]);

  renderer.render(0);

  expect(context.patterns).toHaveLength(0);
  expect(context.fills).toHaveLength(1);
  expect(context.fills[0]?.fillStyle).toBe("rgb(0 0 0)");
  expect(context.fills[0]?.composite).toBe("destination-out");
  expect(context.globalCompositeOperation).toBe("source-over");
});
```

- [ ] **Step 3: Run the focused tests and verify RED**

Run:

```bash
pnpm exec vitest run src/engine/render
```

Expected: FAIL. `composite` is not a property of `RenderStroke`, and neither
renderer switches compositing.

- [ ] **Step 4: Add the composite field to the contract**

In `src/engine/render/Renderer.ts`, add above `RenderStroke`:

```ts
export type RenderComposite = "paint" | "erase";
```

and add to `RenderStroke`:

```ts
/** `erase` removes artwork alpha instead of painting material. */
composite: RenderComposite;
```

- [ ] **Step 5: Implement WebGL2 erase blending**

In `src/engine/render/WebGL2Renderer.ts`, inside `drawBoundBuffer`, immediately
before `this.gl.drawArrays(this.gl.TRIANGLE_STRIP, 0, vertexCount);` add:

```ts
if (stroke.composite === "erase") {
  this.gl.blendFunc(this.gl.ZERO, this.gl.ONE_MINUS_SRC_ALPHA);
}
```

and immediately after that `drawArrays` call add:

```ts
if (stroke.composite === "erase") {
  this.gl.blendFunc(this.gl.ONE, this.gl.ONE_MINUS_SRC_ALPHA);
}
```

No shader change is required. The fragment shader already yields
`effectiveAlpha` from mesh alpha times `u_color.a`, and
`mix(1.0, textureCoverage, u_texture_strength)` returns `1.0` when an erase
mark's texture strength is `0`.

- [ ] **Step 6: Implement Canvas 2D erase compositing**

In `src/engine/render/Canvas2DRenderer.ts`, in `render`, stop erase marks from
taking a texture pattern. Change the retained loop:

```ts
for (const stroke of this.strokes.values()) {
  drawStroke(
    context,
    stroke,
    stroke.composite === "erase" ? null : this.texturePattern(stroke),
  );
}
```

Apply the same `stroke.composite === "erase" ? null : …` guard to the
`confirmedPreview` and `predictedPreview` `drawStroke` calls.

In `drawStroke`, replace the two lines that currently set `fillStyle` with:

```ts
const erasing = stroke.composite === "erase";
context.globalCompositeOperation = erasing ? "destination-out" : "source-over";
const [red, green, blue, colorAlpha] = stroke.color;
context.fillStyle = erasing
  ? "rgb(0 0 0)"
  : (pattern ?? `rgb(${toByte(red)} ${toByte(green)} ${toByte(blue)})`);
```

and add this as the final statement of `drawStroke`, after the fill loop:

```ts
context.globalCompositeOperation = "source-over";
```

- [ ] **Step 7: Run the focused tests and verify GREEN**

Run:

```bash
pnpm exec vitest run src/engine/render
```

Expected: PASS.

- [ ] **Step 8: Run the full gate and commit**

```bash
pnpm quality
git add src/engine/render
git commit -m "feat: composite erase marks in both renderers"
```

---

### Task 5: Tool Mode and the Eraser Input Path

**Files:**

- Modify: `src/state/editorStore.ts`
- Modify: `src/features/canvas/createDrawingController.ts`
- Modify: `src/features/canvas/DrawingSurface.tsx:67-83`
- Test: `src/state/editorStore.test.ts`
- Test: `src/features/canvas/DrawingSurface.test.tsx`

**Interfaces:**

- Consumes: `createEraserSnapshot` and `orderedVisibleMarks` from Task 3;
  `RenderComposite` from Task 4; `buildStrokeMesh(samples, StrokeGeometry)` from
  Task 1.
- Produces:
  - `type EditorTool = "brush" | "eraser"` exported from
    `src/state/editorStore.ts`; `EditorSnapshot.tool: EditorTool`;
    `store.setTool(tool)`; `store.getActiveTool(): EditorTool`;
    `store.getActiveEraser(): EraserSnapshot`.
  - `store.commitErase(samples, eraser?): Promise<void>`.
  - `toRenderMark(mark: DocumentMark): RenderStroke` exported from
    `src/state/editorStore.ts`. `toRenderStroke` stays exported and
    paint-only, because existing tests use it.
  - `createDrawingController` options gain `commitErase`, `getTool`, and
    `getEraser`.

- [ ] **Step 1: Write the failing store tests**

Add to `src/state/editorStore.test.ts`:

```tsx
it("commits an erase carrying the active brush tip", async () => {
  const operations: DocumentOperation[] = [];
  const store = createEditorStore({
    repository: repository({
      appendOperation: vi.fn(async (operation) => {
        operations.push(operation);
      }),
    }),
    createId: () => "erase-1",
  });
  await store.openProject("project-1");

  store.selectBrush("denim-v1");
  store.setBrushSize(64);
  store.setTool("eraser");
  await store.commitErase(samples, store.getActiveEraser());

  expect(store.getSnapshot().tool).toBe("eraser");
  expect(operations[0]).toMatchObject({
    type: "erase.committed",
    eraser: { tipBrushId: "denim-v1", size: 64 },
  });
  expect(store.getSnapshot().document?.strokes).toEqual([]);
  expect(store.getSnapshot().document?.erases).toHaveLength(1);
});

it("renders paint and erase marks with their own compositing", async () => {
  const activeRenderer = renderer();
  let nextId = 0;
  const store = createEditorStore({
    repository: repository(),
    renderer: activeRenderer,
    createId: () => `mark-${++nextId}`,
  });
  await store.openProject("project-1");

  await store.commitStroke(samples);
  await store.commitErase(samples, store.getActiveEraser());

  expect(
    vi
      .mocked(activeRenderer.commitStroke)
      .mock.calls.map(([mark]) => mark.composite),
  ).toEqual(["paint", "erase"]);
});
```

- [ ] **Step 2: Write the failing controller tests**

Add to `src/features/canvas/DrawingSurface.test.tsx`, following the existing
direct-controller test style:

```tsx
it("commits an erase with the tool captured at Pencil-down", () => {
  const surface = document.createElement("canvas");
  surface.setPointerCapture = vi.fn();
  surface.releasePointerCapture = vi.fn();
  const renderer = mockRenderer();
  const painted: BrushSnapshot[] = [];
  const erased: EraserSnapshot[] = [];
  const denim = getBrushPreset("denim-v1");
  let tool: EditorTool = "eraser";

  createDrawingController({
    surface,
    renderer,
    document: createDocument({ projectId: "project-1", title: "Eraser test" }),
    commitStroke: (_samples, brush) => {
      painted.push(brush);
    },
    commitErase: (_samples, eraser) => {
      erased.push(eraser);
    },
    getBrush: () => denim,
    getTool: () => tool,
    getEraser: () => createEraserSnapshot(denim),
    viewportFactory: () => mockViewport(),
  });

  surface.dispatchEvent(pointerEvent("pointerdown", sample(10, 20, 100)));
  tool = "brush";
  surface.dispatchEvent(pointerEvent("pointermove", sample(30, 40, 110)));

  const preview = vi.mocked(renderer.previewStroke).mock.lastCall?.[0];
  expect(preview?.composite).toBe("erase");
  expect(preview?.texture.strength).toBe(0);

  surface.dispatchEvent(pointerEvent("pointerup", sample(40, 50, 120)));

  expect(painted).toEqual([]);
  expect(erased).toEqual([createEraserSnapshot(denim)]);
});

it("keeps painting when the brush tool is active", () => {
  const surface = document.createElement("canvas");
  surface.setPointerCapture = vi.fn();
  surface.releasePointerCapture = vi.fn();
  const renderer = mockRenderer();
  const painted: BrushSnapshot[] = [];
  const erased: EraserSnapshot[] = [];
  const pencil = getBrushPreset("studio-pencil-v1");

  createDrawingController({
    surface,
    renderer,
    document: createDocument({ projectId: "project-1", title: "Brush test" }),
    commitStroke: (_samples, brush) => {
      painted.push(brush);
    },
    commitErase: (_samples, eraser) => {
      erased.push(eraser);
    },
    getBrush: () => pencil,
    getTool: () => "brush",
    getEraser: () => createEraserSnapshot(pencil),
    viewportFactory: () => mockViewport(),
  });

  surface.dispatchEvent(pointerEvent("pointerdown", sample(10, 20, 100)));
  surface.dispatchEvent(pointerEvent("pointermove", sample(30, 40, 110)));
  surface.dispatchEvent(pointerEvent("pointerup", sample(40, 50, 120)));

  expect(erased).toEqual([]);
  expect(painted).toEqual([pencil]);
});
```

Add to that file's imports:

```tsx
import { createEraserSnapshot } from "../../engine/brush/eraser";
import type { EraserSnapshot } from "../../domain/document/types";
import type { EditorTool } from "../../state/editorStore";
```

Also add `commitErase`, `getTool`, and `getEraser` to every existing
`createDrawingController` call already present in that file, using
`commitErase: () => undefined`, `getTool: () => "brush"`, and
`getEraser: () => createEraserSnapshot(getBrushPreset("studio-pencil-v1"))`,
so those tests keep compiling without changing what they assert.

- [ ] **Step 3: Run the focused tests and verify RED**

Run:

```bash
pnpm exec vitest run src/state/editorStore.test.ts src/features/canvas/DrawingSurface.test.tsx
```

Expected: FAIL. `setTool`, `getActiveEraser`, and `commitErase` do not exist,
and the controller rejects the three new options.

- [ ] **Step 4: Add tool mode and erase commit to the store**

In `src/state/editorStore.ts`, add the imports:

```ts
import { orderedVisibleMarks } from "../domain/document/documentMarks";
import { createEraserSnapshot } from "../engine/brush/eraser";
```

Add `DocumentMark`, `EraseOperation`, and `EraserSnapshot` to the type import
from `../domain/document/types`, and `RenderComposite` to the type import from
`../engine/render/Renderer`.

Add the tool type above `EditorSaveStatus`:

```ts
export type EditorTool = "brush" | "eraser";
```

Add `tool: EditorTool;` to `EditorSnapshot`, `tool: "brush"` to the initial
`#snapshot` literal, and the backing field beside `#brush`:

```ts
  #tool: EditorTool = "brush";
```

Add the accessors after `resetBrush`:

```ts
  public getActiveTool = (): EditorTool => this.#tool;

  public setTool(tool: EditorTool): void {
    this.#tool = tool;
    this.#update({ tool });
  }

  public getActiveEraser = (): EraserSnapshot =>
    createEraserSnapshot(this.#brush);
```

Add `commitErase` directly after `commitStroke`:

```ts
  public commitErase(
    samples: readonly PenSample[],
    eraser: EraserSnapshot = this.getActiveEraser(),
  ): Promise<void> {
    const startedAt = this.#performance.now();
    const document = this.#requireDocument();
    const operation: EraseOperation = Object.freeze({
      type: "erase.committed",
      operationId: this.#createId(),
      projectId: document.projectId,
      layerId: document.activeLayerId,
      sequence: document.operationSequence + 1,
      committedAt: this.#now(),
      eraser: Object.freeze({ ...eraser }),
      samples: immutableSamples(samples),
    });
    const nextDocument = documentReducer(document, operation);
    this.#renderer?.commitStroke(toRenderMark(operation));
    return this.#queueOperation(operation, nextDocument, startedAt);
  }
```

Add `composite: "paint"` to the object returned by the existing
`toRenderStroke`, and replace `toRenderDocument` with a mark-aware pair:

```ts
const ERASE_TEXTURE = Object.freeze({
  kind: "graphite" as const,
  scale: 1,
  strength: 0,
  angle: 0,
  scatter: 0,
});

export function toRenderMark(mark: DocumentMark): RenderStroke {
  if (mark.type === "erase.committed") {
    return Object.freeze({
      operationId: mark.operationId,
      mesh: buildStrokeMesh(mark.samples, mark.eraser),
      color: Object.freeze([0, 0, 0, 1]) as RenderStroke["color"],
      texture: ERASE_TEXTURE,
      composite: "erase" as RenderComposite,
    });
  }
  return toRenderStroke(mark);
}

function toRenderDocument(document: DesignDocument): readonly RenderStroke[] {
  return orderedVisibleMarks(document).map(toRenderMark);
}
```

- [ ] **Step 5: Branch the drawing controller on the captured tool**

In `src/features/canvas/createDrawingController.ts`:

1. Add to `CreateDrawingControllerOptions`:

```ts
  commitErase: (
    samples: readonly PenSample[],
    eraser: EraserSnapshot,
  ) => void | PromiseLike<void>;
  getTool: () => EditorTool;
  getEraser: () => EraserSnapshot;
```

importing `EraserSnapshot` from `../../domain/document/types` and
`EditorTool` from `../../state/editorStore`.

2. Add the captured fields beside `pencilDownBrush`:

```ts
let pencilDownTool: EditorTool = "brush";
let pencilDownEraser: EraserSnapshot | null = null;
```

3. In `handlePointerDown`, immediately after `pencilDownBrush` is assigned:

```ts
pencilDownTool = options.getTool();
pencilDownEraser = pencilDownTool === "eraser" ? options.getEraser() : null;
```

4. Replace the body of the `StrokeSession` `onPreview` else-branch so the
   preview follows the captured tool:

```ts
if (pencilDownTool === "eraser" && pencilDownEraser) {
  renderer.previewStroke(
    erasePreview("preview-confirmed", confirmed, pencilDownEraser),
    erasePreview("preview-predicted", predicted, pencilDownEraser),
  );
} else if (pencilDownBrush) {
  renderer.previewStroke(
    previewStroke("preview-confirmed", confirmed, pencilDownBrush),
    previewStroke("preview-predicted", predicted, pencilDownBrush),
  );
}
```

5. Replace `onCommit`:

```ts
    onCommit: (samples) => {
      const result =
        pencilDownTool === "eraser" && pencilDownEraser
          ? options.commitErase(samples, pencilDownEraser)
          : pencilDownBrush
            ? options.commitStroke(samples, pencilDownBrush)
            : undefined;
      scheduleRender();
      return result;
    },
```

The commit callback receives whatever samples the stroke session supplies.
Do not reach back to the raw pointer events here: Goal 2 inserts a shaping
stage between the session and this callback.

6. Add `pencilDownEraser = null;` beside every existing
   `pencilDownBrush = null;` assignment, in `handlePointerUp`,
   `handlePointerCancel`, and `handleLostPointerCapture`.

7. Add `composite: "paint"` to the object returned by `previewStroke`, and add
   this helper beside it:

```ts
function erasePreview(
  operationId: string,
  samples: readonly PenSample[],
  eraser: EraserSnapshot,
): RenderStroke | null {
  if (samples.length === 0) {
    return null;
  }
  return {
    operationId,
    mesh: buildStrokeMesh(samples, eraser),
    color: [0, 0, 0, 1],
    texture: { kind: "graphite", scale: 1, strength: 0, angle: 0, scatter: 0 },
    composite: "erase",
  };
}
```

- [ ] **Step 6: Pass the new options from the surface**

In `src/features/canvas/DrawingSurface.tsx`, extend the
`createDrawingController` call:

```tsx
      commitStroke: store.commitStroke.bind(store),
      commitErase: store.commitErase.bind(store),
      getBrush: store.getActiveBrush,
      getTool: store.getActiveTool,
      getEraser: store.getActiveEraser,
```

- [ ] **Step 7: Run the focused tests and verify GREEN**

Run:

```bash
pnpm exec vitest run src/state src/features/canvas
```

Expected: PASS.

- [ ] **Step 8: Run the full gate and commit**

```bash
pnpm quality
git add src/state/editorStore.ts src/state/editorStore.test.ts src/features/canvas
git commit -m "feat: erase artwork with the active brush tip"
```

---

### Task 6: Undo and Redo Across Every Mark

**Files:**

- Modify: `src/state/editorStore.ts`
- Modify: `src/features/canvas/DrawingSurface.tsx:108-171`
- Test: `src/state/editorStore.test.ts`

**Interfaces:**

- Consumes: `lastVisibleMark`, `findMark`, `orderedVisibleMarks` from Task 3;
  `commitErase` from Task 5.
- Produces: `store.undoLastMark(): Promise<void>`,
  `store.redoLastMark(): Promise<void>`, `EditorSnapshot.canUndo: boolean`,
  and `EditorSnapshot.canRedo: boolean`. `undoLastStroke` is removed; every
  call site moves to `undoLastMark`.

- [ ] **Step 1: Write the failing undo and redo tests**

Add to `src/state/editorStore.test.ts`:

```tsx
it("undoes and redoes strokes and erases in reverse commit order", async () => {
  let nextId = 0;
  const store = createEditorStore({
    repository: repository(),
    createId: () => `mark-${++nextId}`,
  });
  await store.openProject("project-1");

  await store.commitStroke(samples);
  await store.commitErase(samples, store.getActiveEraser());

  expect(store.getSnapshot().canUndo).toBe(true);
  expect(store.getSnapshot().canRedo).toBe(false);

  await store.undoLastMark();
  expect(store.getSnapshot().document?.hiddenStrokeIds).toEqual(["mark-2"]);
  expect(store.getSnapshot().canRedo).toBe(true);

  await store.undoLastMark();
  expect(store.getSnapshot().document?.hiddenStrokeIds).toEqual([
    "mark-2",
    "mark-1",
  ]);
  expect(store.getSnapshot().canUndo).toBe(false);

  await store.redoLastMark();
  await store.redoLastMark();
  expect(store.getSnapshot().document?.hiddenStrokeIds).toEqual([]);
  expect(store.getSnapshot().canRedo).toBe(false);
  expect(store.getSnapshot().canUndo).toBe(true);
});

it("drops the redo stack when a new mark is committed", async () => {
  let nextId = 0;
  const store = createEditorStore({
    repository: repository(),
    createId: () => `mark-${++nextId}`,
  });
  await store.openProject("project-1");

  await store.commitStroke(samples);
  await store.undoLastMark();
  expect(store.getSnapshot().canRedo).toBe(true);

  await store.commitStroke(samples);

  expect(store.getSnapshot().canRedo).toBe(false);
});

it("persists undo as a visibility operation rather than deleting a mark", async () => {
  const operations: DocumentOperation[] = [];
  let nextId = 0;
  const store = createEditorStore({
    repository: repository({
      appendOperation: vi.fn(async (operation) => {
        operations.push(operation);
      }),
    }),
    createId: () => `mark-${++nextId}`,
  });
  await store.openProject("project-1");

  await store.commitStroke(samples);
  await store.undoLastMark();

  expect(operations.at(-1)).toMatchObject({
    type: "stroke.visibility-set",
    targetOperationId: "mark-1",
    visible: false,
  });
  expect(store.getSnapshot().document?.strokes).toHaveLength(1);
});

it("re-renders the visible marks when visibility changes", async () => {
  const activeRenderer = renderer();
  let nextId = 0;
  const store = createEditorStore({
    repository: repository(),
    renderer: activeRenderer,
    createId: () => `mark-${++nextId}`,
  });
  await store.openProject("project-1");

  await store.commitStroke(samples);
  await store.commitErase(samples, store.getActiveEraser());
  await store.undoLastMark();

  const replayed =
    vi.mocked(activeRenderer.replaceDocument).mock.lastCall?.[0] ?? [];
  expect(replayed.map((mark) => mark.composite)).toEqual(["paint"]);
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```bash
pnpm exec vitest run src/state/editorStore.test.ts
```

Expected: FAIL. `undoLastMark`, `redoLastMark`, `canUndo`, and `canRedo` do not
exist.

- [ ] **Step 3: Replace stroke undo with mark undo and redo**

In `src/state/editorStore.ts`, add `findMark` and `lastVisibleMark` to the
`documentMarks` import.

Add to `EditorSnapshot`:

```ts
canUndo: boolean;
canRedo: boolean;
```

with `canUndo: false` and `canRedo: false` in the initial `#snapshot` literal,
and add the redo field:

```ts
  #redoStack: readonly string[] = Object.freeze([] as string[]);
```

Delete `undoLastStroke` entirely and add:

```ts
  public undoLastMark(): Promise<void> {
    const document = this.#requireDocument();
    const target = lastVisibleMark(document);
    if (!target) {
      return Promise.resolve();
    }

    this.#redoStack = Object.freeze([...this.#redoStack, target.operationId]);
    return this.#setMarkVisibility(document, target.operationId, false);
  }

  public redoLastMark(): Promise<void> {
    const document = this.#requireDocument();
    const operationId = this.#redoStack.at(-1);
    if (operationId === undefined || findMark(document, operationId) === null) {
      return Promise.resolve();
    }

    this.#redoStack = Object.freeze(this.#redoStack.slice(0, -1));
    return this.#setMarkVisibility(document, operationId, true);
  }

  #setMarkVisibility(
    document: DesignDocument,
    targetOperationId: string,
    visible: boolean,
  ): Promise<void> {
    const startedAt = this.#performance.now();
    const operation: StrokeVisibilityOperation = Object.freeze({
      type: "stroke.visibility-set",
      operationId: this.#createId(),
      projectId: document.projectId,
      sequence: document.operationSequence + 1,
      committedAt: this.#now(),
      targetOperationId,
      visible,
    });
    const nextDocument = documentReducer(document, operation);
    this.#renderer?.replaceDocument(toRenderDocument(nextDocument));
    this.#requestRender();
    return this.#queueOperation(operation, nextDocument, startedAt);
  }
```

In both `commitStroke` and `commitErase`, clear the redo stack immediately
before the `#queueOperation` call:

```ts
this.#redoStack = Object.freeze([] as string[]);
```

Add a private helper and use it wherever the snapshot's document changes:

```ts
  #historyFlags(
    document: DesignDocument,
  ): Pick<EditorSnapshot, "canUndo" | "canRedo"> {
    return {
      canUndo: orderedVisibleMarks(document).length > 0,
      canRedo: this.#redoStack.some(
        (operationId) => findMark(document, operationId) !== null,
      ),
    };
  }
```

Spread `...this.#historyFlags(document)` into the frozen snapshot literals in
both `#queueOperation` and `#openDocument`. In `#openDocument`, reset
`this.#redoStack = Object.freeze([] as string[]);` before building the
snapshot, so a reopened project starts with an empty in-session redo stack.

- [ ] **Step 4: Move the surface off the removed method**

In `src/features/canvas/DrawingSurface.tsx`, delete the local `canUndo`
computation and replace the `drawing-surface__actions` block with:

```tsx
<div className="drawing-surface__actions">
  <button
    className="undo-control"
    disabled={!snapshot.canUndo}
    onClick={() => void store.undoLastMark()}
    type="button"
  >
    Undo last mark
  </button>
  <button
    className="undo-control"
    disabled={!snapshot.canRedo}
    onClick={() => void store.redoLastMark()}
    type="button"
  >
    Redo
  </button>
</div>
```

Task 7 replaces this row with the puck. It stays here so the app remains usable
between the two tasks.

- [ ] **Step 5: Run the focused tests and verify GREEN**

Run:

```bash
pnpm exec vitest run src/state src/features src/app
```

Expected: PASS. Update any existing assertion that referenced
`"Undo last stroke"` to `"Undo last mark"`.

- [ ] **Step 6: Verify Checkpoint B-2 in a browser**

With `./run-app.sh` running, confirm by direct observation and record each
result:

1. Add a foundation. Draw two overlapping strokes. Switch to the eraser and
   erase across them. Artwork alpha is removed, the foundation guide beneath
   stays intact, and the warm paper is unchanged.
2. Undo. The erase reverts and both strokes reappear whole.
3. Redo. The erase returns.
4. Undo three times, then reload the page and reopen the design. The visible
   artwork matches what was on screen before the reload.
5. Draw a new stroke after undoing. Redo is disabled.
6. The browser console has no application warnings or errors.

- [ ] **Step 7: Run the full gate and commit**

```bash
pnpm quality
git add src/state/editorStore.ts src/state/editorStore.test.ts src/features/canvas
git commit -m "feat: undo and redo every artwork mark"
```

---

### Task 7: Movable Quick-Tool Puck

**Files:**

- Create: `src/features/tools/QuickToolPuck.tsx`
- Create: `src/features/tools/QuickToolPuck.test.tsx`
- Modify: `src/features/canvas/DrawingSurface.tsx`
- Modify: `src/app/app.css`
- Test: `src/features/canvas/DrawingSurface.test.tsx`

**Interfaces:**

- Consumes: `EditorStore` with `snapshot.brush`, `snapshot.tool`,
  `snapshot.canUndo`, `snapshot.canRedo`, `setTool`, `undoLastMark`, and
  `redoLastMark`.
- Produces: `QuickToolPuck` with props
  `{ store: EditorStore; onOpenBrushes: () => void }`, and the accessible
  control names `"Current color"`, `"Brush"`, `"Eraser"`, `"Undo"`, `"Redo"`,
  and `"Move tools"`.

- [ ] **Step 1: Write the failing puck tests**

Create `src/features/tools/QuickToolPuck.test.tsx`:

```tsx
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ProjectRepository } from "../../platform/persistence/types";
import { createEditorStore } from "../../state/editorStore";
import { QuickToolPuck } from "./QuickToolPuck";

afterEach(cleanup);

function createStore() {
  const repository: ProjectRepository = {
    listProjects: vi.fn(async () => []),
    createProject: vi.fn(async () => undefined),
    loadProject: vi.fn(),
    appendOperation: vi.fn(async () => undefined),
    writeSnapshot: vi.fn(async () => undefined),
    deleteProject: vi.fn(async () => undefined),
  };
  return createEditorStore({ repository });
}

describe("QuickToolPuck", () => {
  it("switches between brush and eraser", async () => {
    const user = userEvent.setup();
    const store = createStore();

    render(<QuickToolPuck onOpenBrushes={vi.fn()} store={store} />);

    await user.click(screen.getByRole("button", { name: "Eraser" }));
    expect(store.getActiveTool()).toBe("eraser");
    expect(screen.getByRole("button", { name: "Eraser" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );

    await user.click(screen.getByRole("button", { name: "Brush" }));
    expect(store.getActiveTool()).toBe("brush");
    expect(screen.getByRole("button", { name: "Brush" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("opens the Brushes shelf from the current color swatch", async () => {
    const user = userEvent.setup();
    const onOpenBrushes = vi.fn();

    render(
      <QuickToolPuck onOpenBrushes={onOpenBrushes} store={createStore()} />,
    );

    await user.click(screen.getByRole("button", { name: "Current color" }));
    expect(onOpenBrushes).toHaveBeenCalledTimes(1);
  });

  it("disables undo and redo until there is something to undo", () => {
    render(<QuickToolPuck onOpenBrushes={vi.fn()} store={createStore()} />);

    expect(screen.getByRole("button", { name: "Undo" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Redo" })).toBeDisabled();
  });

  it("repositions with a touch drag on the move handle", () => {
    render(<QuickToolPuck onOpenBrushes={vi.fn()} store={createStore()} />);

    const handle = screen.getByRole("button", { name: "Move tools" });
    handle.setPointerCapture = vi.fn();
    const puck = handle.closest(".quick-tool-puck") as HTMLElement;

    fireEvent.pointerDown(handle, {
      pointerId: 1,
      pointerType: "touch",
      clientX: 100,
      clientY: 400,
    });
    fireEvent.pointerMove(handle, {
      pointerId: 1,
      pointerType: "touch",
      clientX: 60,
      clientY: 300,
    });
    fireEvent.pointerUp(handle, {
      pointerId: 1,
      pointerType: "touch",
      clientX: 60,
      clientY: 300,
    });

    expect(puck.style.getPropertyValue("--puck-offset-x")).toBe("-40px");
    expect(puck.style.getPropertyValue("--puck-offset-y")).toBe("-100px");
  });
});
```

Add to `src/features/canvas/DrawingSurface.test.tsx`:

```tsx
it("mounts the quick-tool puck and opens Brushes from it", async () => {
  const user = userEvent.setup();
  const store = await openStore(projectRepository());
  renderSurface(store, mockRenderer(), mockViewport());

  await user.click(screen.getByRole("button", { name: "Current color" }));

  expect(
    screen.getByRole("radiogroup", { name: "Brush presets" }),
  ).toBeVisible();
});
```

- [ ] **Step 2: Run the focused tests and verify RED**

Run:

```bash
pnpm exec vitest run src/features/tools src/features/canvas/DrawingSurface.test.tsx
```

Expected: FAIL. `QuickToolPuck.tsx` does not exist.

- [ ] **Step 3: Implement the puck**

Create `src/features/tools/QuickToolPuck.tsx`:

```tsx
import { useRef, useState, useSyncExternalStore } from "react";
import type { CSSProperties, PointerEvent as ReactPointerEvent } from "react";
import type { EditorStore } from "../../state/editorStore";

export type QuickToolPuckProps = Readonly<{
  store: EditorStore;
  onOpenBrushes: () => void;
}>;

type Offset = Readonly<{ x: number; y: number }>;

type Drag = Readonly<{
  pointerId: number;
  originX: number;
  originY: number;
  startX: number;
  startY: number;
}>;

const MAX_OFFSET = 320;

export function QuickToolPuck({ store, onOpenBrushes }: QuickToolPuckProps) {
  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot);
  const [offset, setOffset] = useState<Offset>({ x: 0, y: 0 });
  const dragRef = useRef<Drag | null>(null);

  const startDrag = (event: ReactPointerEvent<HTMLButtonElement>) => {
    dragRef.current = {
      pointerId: event.pointerId,
      originX: event.clientX,
      originY: event.clientY,
      startX: offset.x,
      startY: offset.y,
    };
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };

  const continueDrag = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) {
      return;
    }
    setOffset({
      x: clamp(drag.startX + event.clientX - drag.originX),
      y: clamp(drag.startY + event.clientY - drag.originY),
    });
  };

  const endDrag = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (dragRef.current?.pointerId === event.pointerId) {
      dragRef.current = null;
    }
  };

  return (
    <div
      aria-label="Quick tools"
      className="quick-tool-puck"
      role="toolbar"
      style={
        {
          "--puck-offset-x": `${offset.x}px`,
          "--puck-offset-y": `${offset.y}px`,
        } as CSSProperties
      }
    >
      <button
        aria-label="Current color"
        className="quick-tool-puck__swatch"
        onClick={onOpenBrushes}
        style={{ backgroundColor: snapshot.brush.color }}
        type="button"
      />
      <button
        aria-label="Brush"
        aria-pressed={snapshot.tool === "brush"}
        className="quick-tool-puck__action"
        onClick={() => store.setTool("brush")}
        type="button"
      >
        Brush
      </button>
      <button
        aria-label="Eraser"
        aria-pressed={snapshot.tool === "eraser"}
        className="quick-tool-puck__action"
        onClick={() => store.setTool("eraser")}
        type="button"
      >
        Eraser
      </button>
      <button
        aria-label="Undo"
        className="quick-tool-puck__action"
        disabled={!snapshot.canUndo}
        onClick={() => void store.undoLastMark()}
        type="button"
      >
        Undo
      </button>
      <button
        aria-label="Redo"
        className="quick-tool-puck__action"
        disabled={!snapshot.canRedo}
        onClick={() => void store.redoLastMark()}
        type="button"
      >
        Redo
      </button>
      <button
        aria-label="Move tools"
        className="quick-tool-puck__grip"
        onPointerCancel={endDrag}
        onPointerDown={startDrag}
        onPointerMove={continueDrag}
        onPointerUp={endDrag}
        type="button"
      >
        <span aria-hidden="true">⋮⋮</span>
      </button>
    </div>
  );
}

function clamp(value: number): number {
  return Math.min(MAX_OFFSET, Math.max(-MAX_OFFSET, value));
}
```

The puck position is in-session only. Persisting it per project and orientation
belongs to the later radial-menu work and is not in this slice.

- [ ] **Step 4: Style the puck and mount it**

Append to `src/app/app.css`:

```css
.quick-tool-puck {
  position: absolute;
  inset-block-end: 24px;
  inset-inline-end: 24px;
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px;
  border: 1px solid var(--color-line);
  border-radius: 32px;
  background: var(--color-surface);
  box-shadow: 0 2px 12px rgb(38 36 33 / 8%);
  transform: translate(var(--puck-offset-x, 0px), var(--puck-offset-y, 0px));
  touch-action: none;
}

.quick-tool-puck__action,
.quick-tool-puck__grip,
.quick-tool-puck__swatch {
  min-inline-size: 56px;
  min-block-size: 56px;
  border: none;
  border-radius: 28px;
  background: none;
  color: var(--color-ink);
  font: inherit;
  font-size: 0.8125rem;
  cursor: pointer;
}

.quick-tool-puck__swatch {
  border: 1px solid var(--color-line);
}

.quick-tool-puck__action[aria-pressed="true"] {
  background: var(--color-accent);
  color: var(--color-surface);
}

.quick-tool-puck__action:disabled {
  color: var(--color-line);
  cursor: default;
}

.quick-tool-puck__action:focus-visible,
.quick-tool-puck__grip:focus-visible,
.quick-tool-puck__swatch:focus-visible {
  outline: 2px solid var(--color-focus);
  outline-offset: 2px;
}

.quick-tool-puck__grip {
  color: var(--color-muted);
  cursor: grab;
}
```

In `src/features/canvas/DrawingSurface.tsx`, add the import:

```tsx
import { QuickToolPuck } from "../tools/QuickToolPuck";
```

and replace the whole `drawing-surface__actions` block from Task 6 with:

```tsx
<QuickToolPuck
  onOpenBrushes={() => changeShelf("brushes", true)}
  store={store}
/>
```

Remove the `.undo-control` and `.drawing-surface__actions` rules from
`src/app/app.css` only if no other selector references them.

- [ ] **Step 5: Run the focused tests and verify GREEN**

Run:

```bash
pnpm exec vitest run src/features src/app
```

Expected: PASS.

- [ ] **Step 6: Run the full gate and commit**

```bash
pnpm quality
git add src/features src/app/app.css
git commit -m "feat: add the movable quick-tool puck"
```

---

### Task 8: Integrated Recovery, Visual QA, and Checkpoint B Handoff

**Files:**

- Modify: `src/platform/persistence/BrowserProjectRepository.integration.test.ts`
- Create: `docs/testing/essential-correction-controls-checklist.md`

**Interfaces:**

- Consumes: every public API produced by Tasks 1 through 7.
- Produces: no production API. This task adds proof and documentation, and fixes
  only defects it demonstrates.

- [ ] **Step 1: Add the full cross-system recovery test**

Add to `src/platform/persistence/BrowserProjectRepository.integration.test.ts` a
test driving the real `EditorStore` across the real `BrowserProjectRepository`,
following the file's existing construction and IndexedDB cleanup conventions:

```ts
it("recovers edited brushes, erases, and hidden marks across a reopen", async () => {
  const repository = new BrowserProjectRepository();
  const store = createEditorStore({ repository });
  await store.createProject("Correction controls");
  const projectId = store.getSnapshot().document!.projectId;

  store.selectBrush("denim-v1");
  store.setBrushSize(96);
  store.setBrushOpacity(0.35);
  store.setBrushColor("#2E4A3C");
  await store.commitStroke(samples);

  store.setTool("eraser");
  await store.commitErase(samples, store.getActiveEraser());
  await store.undoLastMark();

  const erasedId = store.getSnapshot().document!.erases[0]!.operationId;
  await repository.writeSnapshot(store.getSnapshot().document!);
  await repository.close();

  const reopened = await new BrowserProjectRepository().loadProject(projectId);

  expect(reopened.schemaVersion).toBe(3);
  expect(reopened.strokes).toHaveLength(1);
  expect(reopened.strokes[0]!.brush).toMatchObject({
    id: "denim-v1",
    size: 96,
    opacity: 0.35,
    color: "#2e4a3c",
  });
  expect(reopened.strokes[0]!.brush.texture).toEqual(
    getBrushPreset("denim-v1").texture,
  );
  expect(reopened.erases).toHaveLength(1);
  expect(reopened.erases[0]!.eraser.tipBrushId).toBe("denim-v1");
  expect(reopened.hiddenStrokeIds).toEqual([erasedId]);
});
```

Reuse or add a two-sample `samples` constant in that file consistent with the
`stroke` builder it already imports from `ProjectRepository.contract`.

- [ ] **Step 2: Run the integrated slice**

Run:

```bash
pnpm exec vitest run src/app src/features src/platform/persistence src/state
```

Expected: PASS. Fix only defects this run demonstrates. Do not add production
behaviour that no failing test asked for.

- [ ] **Step 3: Exercise the real browser workflow**

With `./run-app.sh` running, work through this sequence and record each result:

1. Create a design and add Neutral figure — Front.
2. Set Pencil to size 6, opacity 100%, colour near-black. Draw a garment
   outline over the guide.
3. Set size 180, opacity 20%, and a fabric colour. Fill the garment body.
4. Switch to Eraser from the puck and clean an edge. Confirm the guide and the
   warm paper are untouched where artwork was removed.
5. Undo four times, then redo four times. The artwork returns to the same state
   each way.
6. Drag the puck by its grip to the opposite side of the field. Confirm no
   stroke is committed by the drag.
7. Return to the gallery, reopen the design, and confirm exact recovery of
   artwork, erases, and hidden-mark state.
8. Confirm the shelf-closed paper still occupies at least 80% of the field, at
   desktop and at 390 × 844.
9. Confirm the browser console has no application warnings or errors.

- [ ] **Step 4: Measure and record the visual result**

Compare against `docs/design/concepts/editor-landscape-approved.png` and record
measured values, not impressions:

- Warm paper and cool field computed colours.
- Every puck control's box size, each at least 56 × 56.
- Every new brush control's box size, each at least 56 × 56.
- The selected-tool background colour, which must be oxblood
  `rgb(151, 37, 31)`.
- Document scroll width at both viewports, which must not exceed the viewport
  width.

- [ ] **Step 5: Write the checklist**

Create `docs/testing/essential-correction-controls-checklist.md` containing the
verified date, an `- [x]` or `- [ ]` line per item from Steps 2 through 4, the
recorded measurements, and a closing **Real-device handoff** section listing:

1. Draw with three different sizes and opacities using Apple Pencil pressure.
2. Erase with the Pencil and confirm the guide and paper survive.
3. Undo and redo from the puck with touch.
4. Drag the puck with touch while the Pencil rests on the canvas, and confirm
   no mark is produced.
5. Reload as an installed Home Screen app and confirm exact recovery.

State explicitly that synthetic pointer automation is not a substitute for this
hardware gate, and record iPad model, iPadOS and Safari version, and pass or
fail.

- [ ] **Step 6: Run the complete gate and commit**

```bash
pnpm quality
```

Expected: format, lint, typecheck, all tests, and build succeed.

```bash
git add src/platform/persistence/BrowserProjectRepository.integration.test.ts docs/testing/essential-correction-controls-checklist.md
git commit -m "test: prove correction-control recovery for checkpoint B"
```

---

## Milestone Acceptance

Goal 1 is complete when all of the following hold:

- Brush size, opacity, and colour are adjustable, five recent colours are
  offered, and reset restores the selected preset's calibrated defaults.
- Colour and size changes never alter the selected brush's characteristic
  texture.
- Each committed stroke stores the complete edited brush snapshot, and changing
  the brush afterwards never alters an earlier stroke.
- The eraser uses the active brush tip's size, pressure, and tilt behaviour and
  writes a reversible `erase.committed` operation. Stored stroke samples are
  never rewritten.
- Erasing removes artwork alpha only. The foundation guide and the warm paper
  are unaffected.
- Undo and redo walk every stroke and erase in reverse commit order, one action
  per mark, and committing a new mark clears the redo stack.
- The quick-tool puck exposes current colour, brush, eraser, undo, and redo, is
  movable by touch, and never paints while being dragged.
- Reload and gallery reopen recover artwork, erases, and hidden-mark state
  exactly.
- Schema-version-1 and schema-version-2 projects still open, with an empty erase
  list and no destructive rewrite.
- `pnpm quality` passes, and the device handoff checklist is recorded.
