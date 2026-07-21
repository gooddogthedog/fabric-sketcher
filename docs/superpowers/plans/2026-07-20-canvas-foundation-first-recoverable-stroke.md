# Canvas Foundation and First Recoverable Stroke Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan. Apply `superpowers:test-driven-development` for every behavior change and `superpowers:verification-before-completion` before claiming a task or milestone complete.

**Goal:** Ship an installable iPad-first PWA in which a user can create a project, make a natural pressure- and tilt-aware Apple Pencil stroke, navigate with touch, and recover every completed stroke after a reload or process termination.

**Architecture:** React owns navigation, panels, accessibility, and document-level state; it stays out of the per-point drawing hot path. An imperative input controller converts Pointer Events into normalized confirmed and predicted samples, a stroke-session state machine owns Pencil lifecycles, and a renderer interface selects WebGL2 or a visible Canvas 2D compatibility mode. IndexedDB holds project metadata and the append-only operation journal; OPFS holds compact binary snapshots behind a replaceable storage interface. The first slice stores replayable stroke operations, proves crash recovery, and establishes the seams needed for tile rendering, workers, layers, brushes, materials, and content packs.

**Tech Stack:** TypeScript, React, Vite, WebGL2, Pointer Events, IndexedDB via `idb`, OPFS, `vite-plugin-pwa`, Vitest, React Testing Library, Playwright, pnpm.

## Global Constraints

- iPad and Apple Pencil behavior is the product constraint; desktop behavior is only a development fallback.
- Pencil draws. One- and two-finger touch navigate or operate the interface. Touch must never emit paint samples.
- React renders controls but must not re-render for each incoming Pencil sample.
- Predicted samples are visual-only. Only confirmed coalesced samples enter history or persistence.
- A stroke becomes durable no later than 250 ms after Pencil-up. The editor must expose `saving`, `saved`, and `error` states rather than implying success.
- The default workspace must retain at least 80% of its area for the canvas. Only one edge shelf may be open.
- WebGL2 is the baseline renderer. Canvas 2D is an explicit compatibility mode with a visible notice, never a silent downgrade.
- Capability checks are feature-based. No browser-version or device-model branching.
- No network is required after the app shell has been loaded once.
- Do not add layers, masks, materials, templates, cloud sync, accounts, or export in this plan. Their data seams are defined here, but their behavior belongs to follow-on plans.
- Do not add a state-management dependency. Use a small external store with `useSyncExternalStore` so hot-path engine state remains framework-independent.
- Keep domain, input, brush, viewport, and engine-math modules free of DOM, React, IndexedDB, and OPFS imports. Only renderer and drawing-surface adapters may touch canvas/WebGL browser APIs.
- Use CSS logical properties and safe-area environment variables so the shell works in portrait, landscape, and left-handed mode.
- Every task ends with its focused tests, the full quality suite, and a small commit.

## Milestone Boundary

This is implementation plan 1 of 6. It proves the riskiest path without creating disposable architecture.

1. **This plan:** PWA shell, input pipeline, recoverable drawing, viewport gestures, edge-shelf shell, radial controls.
2. **Document editing:** tile-backed raster layers, masks, blend modes, selections, transforms, liquify, deep undo.
3. **Drawing studio:** production brush engine, brush library/studio, fashion line helpers, symmetry, guides, quick shapes.
4. **Fashion content:** versioned template packs, body/croquis/dress-form system, components, search, insertion and conversion.
5. **Materials and project kit:** fabric import/repeat/flow/warp/recolor, palettes, references, multi-board views, versions.
6. **Output and hardening:** layered/high-resolution export, time-lapse, backups, optional sync, full device/performance matrix.

## Target File Structure

```text
fabric-sketcher/
├── .github/workflows/quality.yml
├── docs/
│   ├── architecture/canvas-foundation.md
│   └── testing/ipad-pencil-checklist.md
├── e2e/
│   ├── first-stroke.spec.ts
│   ├── helpers/pen.ts
│   └── recovery.spec.ts
├── public/
│   ├── icons/icon-192.png
│   ├── icons/icon-512.png
│   └── icons/icon-maskable-512.png
├── src/
│   ├── app/
│   │   ├── App.tsx
│   │   ├── App.test.tsx
│   │   ├── EditorScreen.tsx
│   │   ├── ProjectGallery.tsx
│   │   └── app.css
│   ├── domain/document/
│   │   ├── createDocument.test.ts
│   │   ├── createDocument.ts
│   │   ├── documentReducer.test.ts
│   │   ├── documentReducer.ts
│   │   └── types.ts
│   ├── engine/brush/
│   │   ├── buildStrokeMesh.test.ts
│   │   └── buildStrokeMesh.ts
│   ├── engine/input/
│   │   ├── normalizePointerEvent.test.ts
│   │   ├── normalizePointerEvent.ts
│   │   ├── StrokeSession.test.ts
│   │   ├── StrokeSession.ts
│   │   └── types.ts
│   ├── engine/math/
│   │   ├── affine.test.ts
│   │   └── affine.ts
│   ├── engine/render/
│   │   ├── Canvas2DRenderer.ts
│   │   ├── createRenderer.test.ts
│   │   ├── createRenderer.ts
│   │   ├── Renderer.ts
│   │   ├── shaders.ts
│   │   └── WebGL2Renderer.ts
│   ├── engine/viewport/
│   │   ├── ViewportController.test.ts
│   │   └── ViewportController.ts
│   ├── features/canvas/
│   │   ├── DrawingSurface.test.tsx
│   │   ├── DrawingSurface.tsx
│   │   └── createDrawingController.ts
│   ├── features/radial-menu/
│   │   ├── RadialMenu.test.tsx
│   │   └── RadialMenu.tsx
│   ├── features/shelves/
│   │   ├── EdgeShelves.test.tsx
│   │   ├── EdgeShelves.tsx
│   │   └── shelfState.ts
│   ├── platform/capabilities/
│   │   ├── detectCapabilities.test.ts
│   │   ├── detectCapabilities.ts
│   │   └── types.ts
│   ├── platform/persistence/
│   │   ├── BrowserProjectRepository.integration.test.ts
│   │   ├── BrowserProjectRepository.ts
│   │   ├── MemoryProjectRepository.ts
│   │   ├── ProjectRepository.contract.ts
│   │   ├── types.ts
│   │   └── writeQueue.ts
│   ├── state/
│   │   ├── editorStore.test.ts
│   │   └── editorStore.ts
│   ├── main.tsx
│   └── vite-env.d.ts
├── .gitignore
├── eslint.config.js
├── index.html
├── package.json
├── playwright.config.ts
├── tsconfig.app.json
├── tsconfig.json
├── tsconfig.node.json
├── vite.config.ts
└── vitest.setup.ts
```

---

## Task 1: Bootstrap the tested iPad-first PWA shell

**Files:**

- Create: `.gitignore`
- Create: `package.json`
- Create: `eslint.config.js`
- Create: `index.html`
- Create: `tsconfig.json`
- Create: `tsconfig.app.json`
- Create: `tsconfig.node.json`
- Create: `vite.config.ts`
- Create: `vitest.setup.ts`
- Create: `src/main.tsx`
- Create: `src/vite-env.d.ts`
- Create: `src/app/App.tsx`
- Create: `src/app/App.test.tsx`
- Create: `src/app/app.css`
- Create: `public/icons/icon-192.png`
- Create: `public/icons/icon-512.png`
- Create: `public/icons/icon-maskable-512.png`

### Step 1: Create the package manifest and install the exact dependency categories

Use the newest mutually compatible stable versions resolved by pnpm at implementation time and commit the lockfile:

```bash
pnpm add react react-dom idb
pnpm add -D typescript vite @vitejs/plugin-react vite-plugin-pwa vitest jsdom @testing-library/react @testing-library/jest-dom @testing-library/user-event @types/react @types/react-dom eslint @eslint/js typescript-eslint prettier @playwright/test fake-indexeddb
```

Required scripts:

```json
{
  "scripts": {
    "dev": "vite --host 0.0.0.0",
    "build": "tsc -b && vite build",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:e2e": "playwright test",
    "typecheck": "tsc -b --pretty false",
    "lint": "eslint .",
    "format:check": "prettier --check .",
    "quality": "pnpm format:check && pnpm lint && pnpm typecheck && pnpm test && pnpm build"
  }
}
```

### Step 2: Write a failing shell test

`src/app/App.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { App } from './App';

describe('App', () => {
  it('opens on the project gallery with an immediate create action', () => {
    render(<App />);
    expect(screen.getByRole('heading', { name: /fabric sketcher/i })).toBeVisible();
    expect(screen.getByRole('button', { name: /new blank design/i })).toBeEnabled();
  });
});
```

Run `pnpm test -- src/app/App.test.tsx`. Expected: failure because `App` does not exist.

### Step 3: Add the smallest accessible app shell

Implement `App` with a semantic `main`, product heading, and 56 px minimum target for “New blank design.” Set `touch-action: none` only on the future drawing surface, never globally. Include `viewport-fit=cover` in `index.html`.

### Step 4: Configure the PWA

In `vite.config.ts`, configure `VitePWA` with:

- `registerType: 'prompt'` so updates never replace a live drawing session unexpectedly.
- Standalone display, portrait and landscape support, theme/background colors.
- The three local icons.
- Workbox navigation fallback and app-shell precache.
- No runtime caching rule for project data; project data must remain in IndexedDB/OPFS.

### Step 5: Verify and commit

Run:

```bash
pnpm test -- src/app/App.test.tsx
pnpm quality
```

Expected: test and quality suite pass; `dist/manifest.webmanifest` exists after build.

Commit: `chore: bootstrap tested iPad PWA shell`

---

## Task 2: Define the durable document and stroke domain

**Files:**

- Create: `src/domain/document/types.ts`
- Create: `src/domain/document/createDocument.ts`
- Create: `src/domain/document/createDocument.test.ts`
- Create: `src/domain/document/documentReducer.ts`
- Create: `src/domain/document/documentReducer.test.ts`

### Step 1: Write the domain types before implementation

Use branded string aliases only at persistence boundaries; keep runtime data serializable:

```ts
export type Point = Readonly<{ x: number; y: number }>;

export type PenSample = Readonly<{
  x: number;
  y: number;
  pressure: number;
  tiltX: number;
  tiltY: number;
  twist: number;
  altitudeAngle: number | null;
  azimuthAngle: number | null;
  time: number;
}>;

export type BrushSnapshot = Readonly<{
  id: 'studio-pencil-v1';
  color: `#${string}`;
  opacity: number;
  size: number;
  pressureSize: number;
  pressureOpacity: number;
  tiltShape: number;
}>;

export type StrokeOperation = Readonly<{
  type: 'stroke.committed';
  operationId: string;
  projectId: string;
  layerId: string;
  sequence: number;
  committedAt: string;
  brush: BrushSnapshot;
  samples: readonly PenSample[];
}>;

export type StrokeVisibilityOperation = Readonly<{
  type: 'stroke.visibility-set';
  operationId: string;
  projectId: string;
  sequence: number;
  committedAt: string;
  targetOperationId: string;
  visible: boolean;
}>;

export type DocumentOperation = StrokeOperation | StrokeVisibilityOperation;

export type DesignDocument = Readonly<{
  schemaVersion: 1;
  projectId: string;
  title: string;
  width: number;
  height: number;
  background: '#F7F3EC';
  activeLayerId: string;
  operationSequence: number;
  strokes: readonly StrokeOperation[];
  hiddenStrokeIds: readonly string[];
}>;
```

### Step 2: Write failing creation and reducer tests

Tests must prove:

- A new document is A4 portrait at 300 DPI: 2480 × 3508.
- The default warm-paper background and a stable initial paint-layer ID are set.
- Committing a stroke appends it immutably and advances `operationSequence` exactly once.
- Duplicate committed-stroke `operationId` replay is idempotent in the reducer. `DesignDocument` does not retain visibility-operation IDs; Task 9's unique journal `operationId` index enforces general `DocumentOperation` append idempotence, including visibility operations.
- A sequence gap throws `DocumentSequenceError` instead of silently corrupting history.
- Empty or single-sample strokes are rejected.
- A visibility operation hides or restores its target stroke without deleting it.
- A visibility operation targeting an unknown stroke fails loudly.

Run `pnpm test -- src/domain/document`. Expected: failures for missing implementation.

### Step 3: Implement pure creation and reduction

`documentReducer(document, operation: DocumentOperation)` must have no clock, random, browser, or storage imports. IDs, timestamps, and sequence numbers are assigned by the caller so journal replay is deterministic. The reducer recognizes duplicate `stroke.committed` IDs from persisted `strokes`; it deliberately does not retain visibility-operation IDs in `DesignDocument`. Task 9's journal unique `operationId` index enforces general `DocumentOperation` append idempotence, including visibility operations. Undo emits `stroke.visibility-set` with `visible: false`; redo emits the inverse operation, preserving append-only history.

### Step 4: Verify and commit

Run `pnpm test -- src/domain/document && pnpm quality`.

Commit: `feat: define replayable drawing document domain`

---

## Task 3: Detect and report the real device capability tier

**Files:**

- Create: `src/platform/capabilities/types.ts`
- Create: `src/platform/capabilities/detectCapabilities.ts`
- Create: `src/platform/capabilities/detectCapabilities.test.ts`

### Step 1: Define the profile

```ts
export type CapabilityProfile = Readonly<{
  pointerEvents: boolean;
  coalescedEvents: boolean;
  predictedEvents: boolean;
  webgl2: boolean;
  offscreenCanvas: boolean;
  opfs: boolean;
  persistentStorage: boolean;
  maxTextureSize: number | null;
  rendererTier: 'webgl2-worker' | 'webgl2-main' | 'canvas2d-compat';
}>;
```

### Step 2: Write dependency-injected tests

Do not mutate globals in the detector. Pass a `CapabilityEnvironment` containing constructors and storage methods. Tests must cover:

- WebGL2 + OffscreenCanvas selects `webgl2-worker`.
- WebGL2 without OffscreenCanvas selects `webgl2-main`.
- Missing WebGL2 selects `canvas2d-compat`.
- Predicted and coalesced events are checked independently.
- A rejected persistence request produces `persistentStorage: false` without blocking launch.
- `MAX_TEXTURE_SIZE` is read only from a successfully created WebGL2 context.

### Step 3: Implement visible compatibility semantics

Return the immutable profile. The UI later reads it to show a compatibility notice. Never inspect user-agent strings.

### Step 4: Verify and commit

Run `pnpm test -- src/platform/capabilities && pnpm quality`.

Commit: `feat: add feature-based iPad capability profile`

---

## Task 4: Normalize coalesced and predicted Pointer Events

**Files:**

- Create: `src/engine/input/types.ts`
- Create: `src/engine/input/normalizePointerEvent.ts`
- Create: `src/engine/input/normalizePointerEvent.test.ts`

### Step 1: Define engine input independent of DOM consumers

```ts
export type InputBatch = Readonly<{
  pointerId: number;
  pointerType: 'pen' | 'touch' | 'mouse' | 'unknown';
  phase: 'down' | 'move' | 'up' | 'cancel';
  confirmed: readonly PenSample[];
  predicted: readonly PenSample[];
}>;
```

### Step 2: Write failing normalization tests

Use small plain-object pointer-event fakes. Prove that:

- `getCoalescedEvents()` values become confirmed samples in chronological order.
- The host event is included once when coalesced values omit it.
- `getPredictedEvents()` values are separated from confirmed samples.
- Pressure is clamped to `[0, 1]`; missing pen pressure while down defaults to `0.5`, and hover/up defaults to `0`.
- Coordinates convert from client space through a provided inverse viewport matrix.
- Tilt and twist values are bounded to web-platform ranges.
- Missing altitude and azimuth become `null`, not fabricated values.
- Touch produces an empty sample set even if the browser reports pressure.

### Step 3: Implement the pure normalizer

The normalizer receives a narrow `PointerEventLike`, surface bounds, and the pure `Matrix3` inverse defined in Task 8. It does not call `preventDefault`, capture pointers, write state, or render.

### Step 4: Verify and commit

Run `pnpm test -- src/engine/input && pnpm quality`.

Commit: `feat: normalize Pencil pointer samples`

---

## Task 5: Implement the Pencil stroke-session state machine

**Files:**

- Create: `src/engine/input/StrokeSession.ts`
- Create: `src/engine/input/StrokeSession.test.ts`

### Step 1: Write state-transition tests

Required states:

```ts
type StrokeSessionState =
  | { kind: 'idle' }
  | { kind: 'drawing'; pointerId: number; confirmed: readonly PenSample[]; predicted: readonly PenSample[] }
  | { kind: 'committing'; pointerId: number; confirmed: readonly PenSample[] };
```

Tests must prove:

- Pen down begins exactly one session.
- Touch and mouse never begin a paint session.
- Moves from a different pointer ID are ignored.
- Every new confirmed batch replaces the prior predicted tail before appending.
- Up returns one immutable confirmed stroke and clears predictions.
- Cancel discards the in-progress stroke and commits nothing.
- Lost pointer capture behaves as cancel unless a matching up was already processed.
- A new pen down immediately after up can begin even while the previous durable write is pending.
- Duplicate up events are idempotent.

### Step 2: Implement callbacks without storage coupling

`StrokeSession` accepts `onPreview(confirmed, predicted)`, `onCommit(samples)`, and `onCancel()` callbacks. `onCommit` may return a promise, but the session must permit immediate recontact and route durability state outside the input state machine.

### Step 3: Verify and commit

Run `pnpm test -- src/engine/input/StrokeSession.test.ts && pnpm quality`.

Commit: `feat: implement resilient Pencil stroke sessions`

---

## Task 6: Build pressure- and tilt-responsive stroke geometry

**Files:**

- Create: `src/engine/brush/buildStrokeMesh.ts`
- Create: `src/engine/brush/buildStrokeMesh.test.ts`

### Step 1: Write geometry tests first

The public API is:

```ts
export type StrokeVertex = Readonly<{ x: number; y: number; alpha: number }>;

export function buildStrokeMesh(
  samples: readonly PenSample[],
  brush: BrushSnapshot,
): Float32Array;
```

Tests must cover:

- Fewer than two samples returns an empty mesh.
- Pressure increases width monotonically within brush min/max bounds.
- Pressure-opacity changes vertex alpha without changing source color.
- Tilt elongates the nib across the tilt axis only when `tiltShape > 0`.
- Identical points and zero-time intervals never produce `NaN` or infinity.
- A 10,000-sample path stays inside the agreed unit-test budget and does not recursively overflow.
- Input arrays and samples are never mutated.

### Step 2: Implement an incremental-friendly triangle strip

Use a stabilizing moving average whose window shrinks at the live tail; calculate normals from neighboring confirmed points; emit two edge vertices per sample plus degenerate vertices where needed. Keep the function deterministic so golden geometry tests remain useful.

### Step 3: Add a benchmark guard

The Vitest benchmark-style assertion should use a generous CI ceiling and record elapsed time. Real latency remains a physical-device gate; this test catches algorithmic regressions only.

### Step 4: Verify and commit

Run `pnpm test -- src/engine/brush && pnpm quality`.

Commit: `feat: generate pressure-aware stroke meshes`

---

## Task 7: Establish the renderer boundary and WebGL2 baseline

**Files:**

- Create: `src/engine/render/Renderer.ts`
- Create: `src/engine/render/shaders.ts`
- Create: `src/engine/render/WebGL2Renderer.ts`
- Create: `src/engine/render/Canvas2DRenderer.ts`
- Create: `src/engine/render/createRenderer.ts`
- Create: `src/engine/render/createRenderer.test.ts`

### Step 1: Define the renderer contract

```ts
export type RenderStroke = Readonly<{
  operationId: string;
  mesh: Float32Array;
  color: readonly [number, number, number, number];
}>;

export interface Renderer {
  readonly kind: 'webgl2' | 'canvas2d-compat';
  resize(pixelWidth: number, pixelHeight: number, devicePixelRatio: number): void;
  setViewport(matrix: Matrix3): void;
  replaceDocument(strokes: readonly RenderStroke[]): void;
  previewStroke(confirmed: RenderStroke | null, predicted: RenderStroke | null): void;
  commitStroke(stroke: RenderStroke): void;
  clearPreview(): void;
  render(now: number): void;
  dispose(): void;
}
```

### Step 2: Write factory tests with fake contexts

Prove:

- A valid WebGL2 context selects `WebGL2Renderer`.
- Shader compile or context creation failure selects the explicit compatibility renderer and returns the failure reason.
- Context loss pauses drawing, emits a recoverable status, and does not lose domain operations.
- Context restore rebuilds GPU state by replaying the document.
- `dispose` releases listeners and GPU resources once.

### Step 3: Implement WebGL2 rendering

Use one vertex buffer for the active preview and retained buffers for committed operations in this slice. The vertex shader transforms document coordinates with a 3×3 viewport matrix. The fragment shader uses premultiplied alpha. Configure `ONE, ONE_MINUS_SRC_ALPHA`; disable depth and culling. Render confirmed preview and predicted preview separately so predicted geometry can be replaced without polluting the committed buffer.

This retained-operation implementation is intentionally bounded to the first slice. Plan 2 replaces committed retained buffers with 256 px tile framebuffers and eviction without changing `Renderer` consumers.

### Step 4: Implement visible Canvas 2D compatibility mode

The fallback must render saved and preview strokes faithfully enough for work recovery. It must expose `kind: 'canvas2d-compat'`; the editor shows “Compatibility rendering — reduced performance” with a details action.

### Step 5: Verify and commit

Run `pnpm test -- src/engine/render && pnpm quality`.

Commit: `feat: add WebGL2 drawing renderer with explicit fallback`

---

## Task 8: Implement touch viewport navigation without Pencil interference

**Files:**

- Create: `src/engine/math/affine.ts`
- Create: `src/engine/math/affine.test.ts`
- Create: `src/engine/viewport/ViewportController.ts`
- Create: `src/engine/viewport/ViewportController.test.ts`

### Step 1: Implement and test browser-independent affine math

Define `Matrix3` as a readonly nine-number tuple and pure functions for identity, translation, scale, rotation, multiplication, point transformation, and inversion. Tests must prove round-trip inversion within `1e-8`, stable centroid transforms, and explicit rejection of singular matrices. This keeps engine modules independent of `DOMMatrix`.

### Step 2: Write gesture tests

The controller consumes only touch contacts. Tests must prove:

- One-finger touch pans when the configured finger action is `navigate`.
- Two-finger touch pans, zooms, and rotates around the gesture centroid.
- Pen events are ignored.
- A palm-sized touch starting within 80 CSS px of an active Pencil contact is suppressed.
- A touch already participating in navigation remains stable when another finger joins or leaves.
- Scale clamps to `0.05–32`; the transform never becomes singular.
- Rotation snapping at 0°, 90°, 180°, and 270° engages within 3° and releases beyond 5°.
- `reset()` fits and centers the document within safe-area-adjusted bounds whenever the literal fit scale is within `0.05–32`; otherwise it uses the nearest supported zoom and centers the document as a best effort.

### Step 3: Implement a matrix-owning controller

Expose `getMatrix()`, `getInverseMatrix()`, `onPointerDown/Move/Up/Cancel`, `reset`, and `subscribe`. Batch visual updates through one `requestAnimationFrame`. Do not store the matrix in React component state.

### Step 4: Verify and commit

Run `pnpm test -- src/engine/viewport && pnpm quality`.

Commit: `feat: add Pencil-safe touch viewport gestures`

---

## Task 9: Persist the append-only journal and recover projects

**Files:**

- Create: `src/platform/persistence/types.ts`
- Create: `src/platform/persistence/ProjectRepository.contract.ts`
- Create: `src/platform/persistence/MemoryProjectRepository.ts`
- Create: `src/platform/persistence/BrowserProjectRepository.ts`
- Create: `src/platform/persistence/BrowserProjectRepository.integration.test.ts`
- Create: `src/platform/persistence/writeQueue.ts`

### Step 1: Define the repository contract

```ts
export type ProjectSummary = Readonly<{
  projectId: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  width: number;
  height: number;
}>;

export interface ProjectRepository {
  listProjects(): Promise<readonly ProjectSummary[]>;
  createProject(document: DesignDocument): Promise<void>;
  loadProject(projectId: string): Promise<DesignDocument>;
  appendOperation(operation: DocumentOperation): Promise<void>;
  writeSnapshot(document: DesignDocument): Promise<void>;
  deleteProject(projectId: string): Promise<void>;
}
```

### Step 2: Write one contract suite and run it against memory and browser adapters

Use `fake-indexeddb/auto` for IndexedDB. Provide a small fake OPFS directory adapter rather than hiding OPFS logic in tests. Required cases:

- Create, list, load, and title ordering by `updatedAt`.
- Append and replay operations in sequence.
- Duplicate `DocumentOperation` append is idempotent, including visibility operations; enforce this with the unique journal `operationId` index.
- Sequence gaps reject the write transaction.
- Load uses the latest valid snapshot, then replays only later journal records.
- A corrupt latest snapshot falls back to the prior generation.
- A simulated interruption before the IndexedDB transaction completes exposes no partial operation.
- Concurrent appends are serialized by project, not globally.
- Persistence errors preserve the in-memory document and expose a retryable error.

### Step 3: Implement IndexedDB schema version 1

Stores:

- `projects`, keyed by `projectId`.
- `operations`, keyed by `[projectId, sequence]`, with a unique `operationId` index. This index is required to enforce general `DocumentOperation` append idempotence, including visibility operations.
- `snapshotIndex`, keyed by `[projectId, generation]`.
- `settings`, keyed by name.

Snapshots are UTF-8 JSON in this first slice and are written atomically to `projects/{projectId}/snapshots/{generation}.json` in OPFS. Keep two confirmed generations. If OPFS is unavailable, store the compressed JSON-compatible snapshot payload in IndexedDB and mark the capability degradation.

### Step 4: Enforce the durability budget

The editor starts a timer at Pencil-up, calls `appendOperation`, and records the duration with `performance.measure`. If it exceeds 250 ms, emit a local diagnostic event but do not disrupt the user. The save indicator stays `saving` until the transaction completes and changes to `error` with “Retry save” on failure.

### Step 5: Verify and commit

Run:

```bash
pnpm test -- src/platform/persistence
pnpm quality
```

Commit: `feat: persist and recover the stroke journal`

---

## Task 10: Wire the editor store and drawing surface end to end

**Files:**

- Create: `src/state/editorStore.ts`
- Create: `src/state/editorStore.test.ts`
- Create: `src/features/canvas/createDrawingController.ts`
- Create: `src/features/canvas/DrawingSurface.tsx`
- Create: `src/features/canvas/DrawingSurface.test.tsx`
- Create: `src/app/ProjectGallery.tsx`
- Create: `src/app/EditorScreen.tsx`
- Modify: `src/app/App.tsx`
- Modify: `src/app/app.css`

### Step 1: Write store tests

The store API must support `getSnapshot`, `subscribe`, `createProject`, `openProject`, `commitStroke`, `retrySave`, and `closeProject`. Tests prove:

- Creating a project persists it before navigation to the editor.
- Opening replays the recovered document into the renderer.
- Committing updates the in-memory document immediately and produces one repository append.
- Save states progress `saving → saved` or `saving → error`.
- Retry reuses the same operation ID and does not duplicate the stroke.
- Closing while saving requests confirmation; it never silently abandons a pending durable write.

### Step 2: Write surface integration tests

Mock the renderer, repository, pointer capture, and viewport. Prove:

- Pen down/move renders confirmed and predicted preview.
- Pen up clears preview, renders one committed stroke, and queues one durable operation.
- Touch input reaches only `ViewportController`.
- `pointercancel` clears preview and persists nothing.
- Surface resize uses `ResizeObserver` and device pixel ratio.
- The canvas has an accessible label and a DOM-equivalent “Undo last stroke” control.
- Compatibility rendering notice appears only for the fallback renderer.

### Step 3: Implement the imperative drawing controller

The React component creates the controller once per open project. Native `pointerrawupdate` is used when present, with `pointermove` fallback. Event listeners are registered with `{ passive: false }` only on the canvas. The controller owns `StrokeSession`, `ViewportController`, the renderer, and the animation frame. React receives only coarse save/status/document changes.

### Step 4: Implement gallery-to-editor navigation

The initial gallery includes:

- Product title.
- “New blank design.”
- Existing projects ordered by recent activity.
- Storage/capability status access.

Opening a project fits the A4 page to the available canvas, places one first paint layer, and focuses the canvas without presenting onboarding modals.

### Step 5: Verify and commit

Run:

```bash
pnpm test -- src/state src/features/canvas src/app
pnpm quality
```

Commit: `feat: draw and durably save the first Pencil stroke`

---

## Task 11: Add the canvas-first edge shelves and radial menu

**Files:**

- Create: `src/features/shelves/shelfState.ts`
- Create: `src/features/shelves/EdgeShelves.tsx`
- Create: `src/features/shelves/EdgeShelves.test.tsx`
- Create: `src/features/radial-menu/RadialMenu.tsx`
- Create: `src/features/radial-menu/RadialMenu.test.tsx`
- Modify: `src/app/EditorScreen.tsx`
- Modify: `src/app/app.css`

### Step 1: Test the interaction model

Edge-shelf tests:

- Four handles are named Brushes, Layers, Views, and Materials.
- Opening one closes the previous shelf.
- Escape, tapping canvas, or dragging the handle outward closes the shelf.
- Pencil drawing near a handle never opens it.
- Left-handed mode mirrors Brushes and Materials while keeping semantic labels.
- Closed shelves consume no more than 20% of the viewport in aggregate.
- Open/close respects reduced motion and remains interruptible.

Radial-menu tests:

- The menu is movable by touch and Pencil when no stroke is active.
- It clamps inside safe-area bounds.
- It offers brush/eraser, color, size, undo, and redo.
- Size changes are available through both radial drag and an accessible range input.
- Undo hides the most recent visible stroke by appending `stroke.visibility-set`; redo appends the inverse. Neither action deletes journal data.
- A hardware gesture may invoke the menu only through a feature-detected adapter; the visible menu always works.

### Step 2: Implement progressive disclosure

Only the Brushes shelf has functional first-slice content: studio pencil selection, color, opacity, and size. Layers shows the single default paint layer read-only. Views and Materials show concise “Available in the next build stage” panels, not fake controls. These temporary panels are removed by their corresponding implementation plans.

### Step 3: Protect canvas area

Use overlay shelves rather than resizing the canvas. Add a development-only layout assertion that calculates the default visible-canvas ratio and warns below `0.8`.

### Step 4: Verify and commit

Run `pnpm test -- src/features/shelves src/features/radial-menu && pnpm quality`.

Commit: `feat: add contextual shelves and Pencil radial controls`

---

## Task 12: Prove offline, recovery, and interaction behavior in a browser

**Files:**

- Create: `playwright.config.ts`
- Create: `e2e/helpers/pen.ts`
- Create: `e2e/first-stroke.spec.ts`
- Create: `e2e/recovery.spec.ts`
- Create: `docs/testing/ipad-pencil-checklist.md`
- Create: `docs/architecture/canvas-foundation.md`
- Create: `.github/workflows/quality.yml`

### Step 1: Add a pen-event helper

Playwright does not validate Apple Pencil hardware. The helper must dispatch pointer events with `pointerType: 'pen'`, pressure, tilt, and stable pointer IDs only to validate browser wiring. The documentation must clearly separate synthetic coverage from real-device acceptance.

### Step 2: Write the first-stroke E2E test

Flow:

1. Open gallery.
2. Create blank design.
3. Draw a synthetic pressure-varying pen stroke.
4. Assert save state becomes “Saved on this iPad.”
5. Assert the debug test adapter reports one committed operation and no predicted samples.
6. Use touch events to pan and assert the document transform changes while stroke count stays one.

Run `pnpm test:e2e -- e2e/first-stroke.spec.ts`. Expected: pass in Chromium and WebKit projects.

### Step 3: Write recovery and offline E2E tests

Recovery flow:

1. Create a project and complete two strokes.
2. Wait for “Saved on this iPad.”
3. Close the page without navigating through app controls.
4. Reopen the app and project.
5. Assert both operation IDs replay once.
6. Add a third stroke, reload immediately after save, and assert three strokes.

Offline flow:

1. Load once online and close.
2. Set the browser context offline.
3. Reopen the installed-app URL.
4. Open the project, draw, save locally, reload, and recover.

### Step 4: Document real-iPad acceptance checks

`docs/testing/ipad-pencil-checklist.md` must include checkboxes and captured-device fields for:

- Current iPad Pro + Pencil Pro, current iPad Air, supported base iPad.
- Safari tab and Home Screen PWA.
- Portrait, landscape, and Split View.
- Slow line, fast flick, light-to-heavy pressure, tilt shading, rapid lift/recontact.
- Palm resting near the active stroke.
- Two-finger navigation during and between strokes.
- Left-handed shelves.
- Background/foreground and forced termination recovery.
- P95 visible-stroke latency from instrumentation: <20 ms current Pro, <32 ms base iPad.
- Journal durability: <250 ms after Pencil-up.
- 30-minute offline session and successful recovery.

This milestone is not accepted until actual device results are recorded. Desktop emulation may merge as engineering completion but cannot satisfy product acceptance.

### Step 5: Add CI and architecture notes

GitHub Actions runs install with frozen lockfile, lint, typecheck, unit/integration tests, production build, and Playwright Chromium. WebKit E2E remains local/macOS until a reliable CI target is configured. Architecture notes document thread boundaries, persistence schema, renderer fallback, and the planned tile/worker migration.

### Step 6: Final verification and commit

Run:

```bash
pnpm quality
pnpm test:e2e
git status --short
```

Expected: all automated checks pass; only intentional tracked changes remain; the built app launches from `dist` and recovers the completed stroke.

Commit: `test: verify offline recoverable Pencil drawing slice`

---

## Milestone Acceptance

Engineering completion requires all of the following:

- A fresh clone installs with `pnpm install --frozen-lockfile`.
- `pnpm quality` passes.
- Playwright first-stroke and recovery flows pass.
- The application is installable and reopens offline after one online load.
- Pen input produces confirmed and predicted preview paths, but only confirmed points persist.
- Touch navigates and never paints.
- Every completed stroke recovers exactly once after reload.
- Save failures are visible and retryable.
- The default canvas occupies at least 80% of the viewport.
- Only one shelf opens at a time; all radial actions have visible accessible equivalents.
- WebGL2 is used when present; compatibility mode is visible when it is not.
- No domain or engine module imports React or browser persistence APIs.

Product acceptance additionally requires the completed real-iPad checklist and measured performance budgets. Failing a device budget blocks the next breadth milestone and triggers profiling of the input/render loop before more features are added.

## Self-Review Notes

- **Coverage:** The plan spans the entire first user loop—create, draw, navigate, save, terminate, reopen—and directly attacks the web app's highest technical risks.
- **No fake completion:** Synthetic pointer tests do not stand in for Pencil testing; real-device gates are explicit.
- **No throwaway renderer:** The `Renderer` boundary lets plan 2 replace retained buffers with tiles and worker rendering without rewriting input, UI, or persistence.
- **No journal ambiguity:** Predicted samples never persist, duplicate operations are idempotent, and sequence gaps fail loudly.
- **No UX bloat:** Four shelf affordances establish the final navigation model, but only first-slice functionality is interactive.
- **Type seams:** Domain operations, renderer payloads, capability profiles, persistence contracts, and UI state have explicit serializable boundaries.
- **Follow-on readiness:** Layers, brushes, content, materials, multi-board projects, and export can extend operations and repositories without entering the Pencil hot path.
