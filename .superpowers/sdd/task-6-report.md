# Task 6 Report: Pressure- and tilt-responsive stroke geometry

## Implementation

- Added a pure, browser-free `buildStrokeMesh(samples, brush)` function that returns a deterministic `Float32Array` triangle strip.
- Exported `STROKE_VERTEX_STRIDE = 3`; each vertex is explicitly stored in `(x, y, alpha)` order, with two edge vertices per sample.
- Defined pressure size response as a monotonic diameter from `size * (1 - pressureSize)` through `size`, after clamping pressure and the response control to `[0, 1]`.
- Defined pressure opacity response analogously from `opacity * (1 - pressureOpacity)` through `opacity` without incorporating or mutating the brush color.
- Added symmetric tilt-axis extent from normalized `(tiltX, tiltY)` only when `tiltShape > 0`; zero and non-finite/missing-at-runtime tilt components fall back stably to zero.
- Stabilized positions with constant-time prefix-window averages. The maximum five-sample window contracts near both ends, leaving the live tail at the newest raw position instead of lagging it.
- Calculated robust tangents with linear forward/backward nearest-distinct passes. Duplicate positions and zero time intervals therefore require no division by time, recursion, or per-sample scans.
- Preserved every input array, sample, and brush object without mutation.

## Files

- Added `src/engine/brush/buildStrokeMesh.ts`.
- Added `src/engine/brush/buildStrokeMesh.test.ts`.
- Added this report at `.superpowers/sdd/task-6-report.md`.

## RED evidence

Each required behavior was introduced test-first and observed failing before its minimal implementation:

1. Empty input: Vitest could not resolve the new `./buildStrokeMesh` module.
2. Pressure width: received five `NaN` widths instead of `[2, 2, 6, 10, 10]` from the initial empty implementation.
3. Pressure alpha: received `0.8` at all samples instead of the expected `0.4`, `0.6`, `0.8` response.
4. Tilt shape: enabled tilt still produced middle x edges `[10, 10]` instead of `[12.5, 7.5]`.
5. Duplicate-position normal: the leading x edge was `0` instead of approximately `-3.5355`, proving the initial immediate-neighbor fallback did not find the next distinct point.
6. Tail-aware stabilization and immutability: the interior center remained at raw y `0` instead of the expected five-sample average `4.6`; frozen inputs were supplied throughout the failing run.
7. Explicit stride and 10k guard: the benchmark executed in `9.58ms`, then failed because the documented/exported stride was `undefined` instead of `3`.

Representative RED command:

```sh
pnpm test -- src/engine/brush/buildStrokeMesh.test.ts
```

## GREEN evidence

After each minimal implementation step, the same test command returned to green before the next behavior was added. The final direct focused run was:

```sh
pnpm exec vitest run src/engine/brush/buildStrokeMesh.test.ts --reporter=verbose
```

Result:

```text
Test Files  1 passed (1)
Tests       7 passed (7)
buildStrokeMesh 10k: 3.48ms
```

The brief-requested focused command also passed:

```sh
pnpm test -- src/engine/brush
```

Result:

```text
Test Files  9 passed (9)
Tests       85 passed (85)
```

The repository script forwards an argument separator to Vitest, so this requested form ran the full current suite; the direct focused command above independently isolated the seven brush tests.

## Performance result

- Path size: 10,000 samples / 20,000 vertices / 60,000 floats.
- Focused elapsed time recorded by the benchmark-style test: `3.48ms`.
- CI ceiling: `1,000ms`, intentionally generous enough to catch orders-of-magnitude algorithmic regressions without treating machine variance as a failure.
- The implementation is iterative and linear in sample count; the test also exercises the no-recursion-overflow requirement.
- Real Pencil latency remains a physical-device acceptance gate, not a unit-test claim.

## Full quality result

Command (run once before commit):

```sh
pnpm quality
```

Result: exit code 0. Prettier, ESLint, TypeScript project checking, all 85 Vitest tests, TypeScript production compilation, Vite build, and PWA service-worker generation passed. The production build completed in `117ms`.

## Self-review

- Re-read every Task 6 requirement against the final code and seven behavior tests.
- Confirmed fewer than two samples return a zero-length `Float32Array`.
- Confirmed pressure size and alpha are monotonic for finite normalized input and bounded by the clamped brush response controls.
- Confirmed tilt changes only the symmetric nib-vector component along the detected tilt axis and is completely gated by `tiltShape`.
- Confirmed the newest sample uses a radius-zero averaging window while only the last two prior points can change as samples are appended.
- Confirmed duplicate-run neighbor discovery is two linear passes rather than nested scanning and that time is not used in tangent division.
- Confirmed the mesh is allocated once at its exact output length and all loops are iterative.
- Confirmed frozen input arrays, frozen samples, and a frozen brush complete without writes; JSON snapshots remain identical.
- Confirmed the function imports only domain types and uses no browser APIs.
- Confirmed `git diff --check` reported no whitespace errors before the report was written.

## Concerns

- A `PenSample[]` represents one continuous stroke and contains no segment-break marker, so no degenerate connector vertices are needed or emitted. If the renderer later batches multiple strips into one GPU draw, that batching layer must insert degenerate connectors between meshes.
- The unit benchmark detects algorithmic regressions only. Pressure/tilt feel, GPU rendering, and Apple Pencil latency still require the planned physical-device gate.
