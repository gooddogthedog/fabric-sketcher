# Task 5 — Fabric Brush Alpha automated acceptance

## Scope

Added the two missing cross-system regressions in
`src/features/canvas/DrawingSurface.test.tsx` only. No product code, styles,
renderer code, or persistence contracts changed.

## Existing acceptance coverage retained

- `ProjectRepository.contract.ts` already appends every `BRUSH_PRESETS` entry,
  writes a snapshot, and reloads it with an exact ordered document equality;
  the browser contract runs through `BrowserProjectRepository`.
- `DrawingSurface.test.tsx` already proves the Pencil-down brush stays immutable
  through a selection change and that the following contact uses the new brush.
- `WebGL2Renderer.texture.test.ts` proves texture uniform metadata is recreated
  and replayed after context restoration. `Canvas2DRenderer.texture.test.ts`
  proves compatibility rendering uses the supplied texture metadata.

## Added regressions

1. The confirmed/predicted preview integration test now asserts that the
   persisted operation contains only confirmed timestamps `[100, 110, 120]`.
   This catches a regression where predicted pointer samples leak into the
   durable operation.
2. Shelf selection, close, and reopen now assert that the mounted drawing
   surface, renderer/controller construction, and viewport reset count remain
   unchanged. This catches a regression where brush shelf state or selection
   enters the drawing-controller layout-effect dependencies and resets pan/zoom.

## TDD and mutation evidence

The implementation behavior already existed, so the new acceptance tests were
characterization tests rather than a feature gap requiring production code.
After writing each assertion, a temporary, uncommitted production mutation
demonstrated its RED failure, then was reverted:

- Appending the last predicted batch to `StrokeSession.finish` failed with
  recovered committed times `[100, 110, 111, 112, 120]` instead of
  `[100, 110, 120]`.
- Adding the React snapshot to `DrawingSurface`'s controller effect
  dependencies caused brush selection to invoke the renderer factory twice;
  the shelf stability test expected one construction.

The real implementation then passed unchanged.

## Verification

```text
pnpm exec vitest run src/features/brushes/BrushShelf.test.tsx \
  src/features/canvas/DrawingSurface.test.tsx \
  src/platform/persistence/BrowserProjectRepository.integration.test.ts \
  src/engine/render/WebGL2Renderer.texture.test.ts \
  src/engine/render/Canvas2DRenderer.texture.test.ts \
  src/engine/render/createRenderer.test.ts
# 6 files, 91 tests passed

pnpm quality
# format, lint, typecheck, 19 test files / 212 tests, and production build passed
```

The full test run emits three pre-existing jsdom notices that
`HTMLCanvasElement.getContext()` is not implemented; they do not fail tests.

## Review-fix round — Canvas2D per-stroke texture metadata

Review found that the original Canvas2D texture test used two copies of the
same Denim snapshot, so it could not catch a renderer that generated every
compatibility tile from a hard-coded texture.

Added a renderer-level regression with equal-color Silk and Denim strokes. It
uses the real `Canvas2DRenderer` and `createTextureTile` path with a captured
test canvas document. The test verifies the exact supplied scales generate
84×84 Silk and 38×38 Denim tiles, that their real tile command plans differ,
and that each stroke keeps its own cached repeat pattern on a second render.

### RED

A temporary, uncommitted mutation hard-coded the Denim texture at the
`createTextureTile` call. The new test failed as intended:

```text
expected [ [84, 84], [38, 38] ]
received [ [38, 38], [38, 38] ]
```

The real `stroke.texture` argument was restored; no production code changed.

### GREEN

```text
pnpm exec vitest run src/engine/render/Canvas2DRenderer.texture.test.ts \
  src/engine/render/createTextureTile.test.ts \
  src/engine/render/createRenderer.test.ts
# 3 files, 24 tests passed

pnpm exec vitest run src/engine/render
# 5 files, 35 tests passed

pnpm quality
# format, lint, typecheck, 19 test files / 213 tests, and production build passed
```
