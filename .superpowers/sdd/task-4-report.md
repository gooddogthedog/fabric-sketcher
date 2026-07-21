# Task 4 — Normalize coalesced and predicted Pointer Events

## Status

Implemented and verified the pure pointer-event normalizer. It uses only plain
structural types and pure affine helpers—no DOM classes, browser side effects,
rendering, persistence, pointer capture, or `preventDefault` calls.

## Files

- `src/engine/input/types.ts` — narrow plain `PointerEventLike`, public
  `InputBatch`, and `SurfaceBounds` contracts.
- `src/engine/input/normalizePointerEvent.ts` — normalizes confirmed/coalesced
  and predicted input independently into document `PenSample` values.
- `src/engine/input/normalizePointerEvent.test.ts` — tests the input rules with
  small plain-object event fakes.

## RED / GREEN evidence

Each behavior was introduced from a focused test; the listed failure was
observed before the minimal production change and a focused rerun green after.

| Requirement | RED evidence | GREEN evidence |
| --- | --- | --- |
| Coalesced samples retain supplied chronological order | Import failed because `./normalizePointerEvent` did not exist. | `1` input test passed after adding the normalizer and type contract. |
| Add omitted host event once | Received times `[10]`; expected `[10, 20]`. | `2` input tests passed after appending the host only when absent by identity. |
| Separate prediction from confirmed history | Received predicted `[]`; expected `[20]`. | `3` input tests passed after mapping `getPredictedEvents()` only to `predicted`. |
| Clamp pressure | Received `[-0.2, 1.2, 0.5]`; expected `[0, 1, 0.5]`. | `4` input tests passed after `[0, 1]` clamping. |
| Default missing pen down pressure | Received `0`; expected `0.5`. | `5` input tests passed after phase-aware nullish defaulting. |
| Preserve zero and default hover/up pressure | Regression tests passed with the phase-aware nullish implementation: missing hover/up values are `0`; numeric `0` remains `0`. | `7` input tests passed. |
| Map client coordinates via surface-local inverse matrix | Received `{ x: 120, y: 70 }`; expected `{ x: 41, y: 58 }`. | `8` input tests passed after subtracting surface origin then calling `transformPoint`. |
| Bound tilt/twist | Received `100, -100, 400`; expected `90, -90, 359`. | `9` input tests passed. |
| Bound present altitude/azimuth | Received `-1, 10`; expected `0, 2π`. | `10` input tests passed. |
| Keep missing altitude/azimuth null | Regression test passed for `null` and `undefined`, both yielding `null`. | `11` input tests passed. |
| Touch produces no samples | Received `pointerType: "unknown"` plus samples; expected `"touch"` and empty arrays. | `12` input tests passed after early touch normalization. |

Focused command after formatting:

```text
$ pnpm test -- src/engine/input

 RUN  v4.1.10 /Users/caleb/web-projects/home/fabric-sketcher/.worktrees/canvas-foundation

 Test Files  7 passed (7)
      Tests  55 passed (55)
```

## Full quality output

```text
$ pnpm quality
$ pnpm format:check && pnpm lint && pnpm typecheck && pnpm test && pnpm build
$ prettier --check .
Checking formatting...
All matched files use Prettier code style!
$ eslint .
$ tsc -b --pretty false
$ vitest run

 RUN  v4.1.10 /Users/caleb/web-projects/home/fabric-sketcher/.worktrees/canvas-foundation

 Test Files  7 passed (7)
      Tests  55 passed (55)
   Start at  00:29:37
   Duration  2.02s (transform 266ms, setup 1.13s, import 453ms, tests 169ms, environment 8.32s)

$ tsc -b && vite build
vite v8.1.5 building client environment for production...
transforming...✓ 16 modules transformed.
rendering chunks...
computing gzip size...
dist/registerSW.js                0.13 kB
dist/manifest.webmanifest         0.43 kB
dist/index.html                   0.60 kB │ gzip:  0.35 kB
dist/assets/index-BojvReWl.css    2.07 kB │ gzip:  0.88 kB
dist/assets/index-DZQf1IQw.js   190.88 kB │ gzip: 60.17 kB

✓ built in 111ms

PWA v1.3.0
mode      generateSW
precache  11 entries (224.81 KiB)
files generated
  dist/sw.js
  dist/workbox-2fbc6a65.js
```

## Self-review

- Confirmed event order is never sorted or otherwise mutated; host is appended
  only when its object is not supplied.
- Prediction never enters `confirmed`; touch returns before either collection
  can be read or sampled.
- `??` handles pressure/orientation absence, so numeric pressure `0` remains.
- Coordinate normalization subtracts surface client origin before the documented
  row-major, column-vector affine transform.
- Web fields use the required ranges: pressure `[0, 1]`, tilt `[-90, 90]`,
  twist `[0, 359]`, altitude `[0, π/2]`, and azimuth `[0, 2π]`.
- The module imports no browser classes and has no side effects.

## Concerns

None known. `PointerEventLike` is intentionally narrow and can be adapted by
any browser-facing layer without leaking DOM types into the engine.
