# Task 4 — Canvas2D deterministic texture tiles

## Scope

Implemented the Canvas2D compatibility texture path only:

- `src/engine/render/createTextureTile.ts`
- `src/engine/render/createTextureTile.test.ts`
- `src/engine/render/Canvas2DRenderer.ts`
- `src/engine/render/Canvas2DRenderer.texture.test.ts`

No WebGL, shader, UI, store, persistence, domain contract, Vite, lockfile, or
plan files changed.

## TDD evidence

### RED

1. Added the renderer behavior test before the renderer implementation. The
   test names the production break it catches: compatibility rendering not
   creating/reusing a repeat pattern while preserving the existing
   segment-local pressure alpha. It failed against the previous solid-fill
   renderer with `expected [] to have a length of 1 but got 0` for
   `createPattern` calls.
2. Added the tile contract tests for deterministic output, distinct plans for
   graphite/silk/denim/wool/knit, and 16–128 pixel bounds. The focused RED run
   failed with empty plans and `[0, 0, 0, 0]` tile dimensions:

   ```text
   pnpm test -- src/engine/render/createTextureTile.test.ts src/engine/render/Canvas2DRenderer.texture.test.ts
   Test Files 2 failed; Tests 3 failed
   ```

### GREEN

Implemented bounded Canvas2D tiles using deterministic integer loops and a
fixed integer hash—no random source or animation time. Tile primitives apply
the preset angle through tile-local coordinate rotation. The renderer caches up
to 64 `CanvasPattern | null` entries by `textureCacheKey`, uses the repeat
pattern as the fill style, clears the cache on disposal, and catches tile or
pattern failures so the current solid RGB stroke still renders. Existing
segment-local pressure alpha remains unchanged.

The focused green verification passed:

```text
pnpm test -- src/engine/render/createTextureTile.test.ts src/engine/render/Canvas2DRenderer.texture.test.ts
Test Files 16 passed; Tests 193 passed
```

### Self-review TDD correction

The self-review found that knit-loop centers were rotated but their arc sweep
still started at zero. A focused regression test for a 45-degree knit loop
failed with `expected 0 to be close to 0.7853981633974483`. The tile rotation
now carries the angle into the arc start/end values. The focused suite and
quality gate were rerun after this correction:

```text
Test Files 16 passed; Tests 194 passed
pnpm quality                          # format, lint, typecheck, test, build passed
```

### Independent-review TDD correction

The read-only review found that cache-key values were rounded to three decimal
places even though tile rendering used their full values. A regression test
with angles `42` and `42.0001` failed because both inputs produced the same
key. Keys now use the complete finite numeric value, matching the tile input
and preventing that cache collision. The final focused suite and quality gate
passed with 195 tests.

The test run prints three existing jsdom `HTMLCanvasElement.getContext()`
"Not implemented" notices from the broader render test suite; they are not
test failures and the suite exits successfully.

## Mutation review

- Replacing a repeated pattern with per-stroke creation makes the cache test's
  single `createPattern` expectation fail.
- Removing the `null` pattern fallback makes the solid RGB fallback test fail.
- Removing tile bounds makes the exact 16 and 128 dimension test fail.
- Collapsing tile kinds or introducing non-determinism makes the distinct-plan
  and repeated-wool-plan assertions fail.
- Replacing the texture fill with solid RGB makes the renderer pattern fill
  assertions fail.

## Final verification

```text
pnpm test -- src/engine/render        # 16 files, 195 tests passed
pnpm quality                          # format, lint, typecheck, test, build passed
```
