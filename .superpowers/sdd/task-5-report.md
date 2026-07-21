# Task 5 — Pencil stroke session

## Result

Implemented a browser-, storage-, and React-free `StrokeSession` that consumes
normalized `InputBatch` values and explicit lost-capture calls. It owns one Pen
pointer at a time, emits immutable preview snapshots, commits immutable final
samples, and rejects non-Pencil input or non-owning pointers.

## RED / GREEN evidence

Focused RED/GREEN cycles covered: predicted-tail replacement, final immutable
commit on `up`, cancel, lost capture, and rejected async commit handling.
Each cycle was verified with:

```text
pnpm test -- src/engine/input/StrokeSession.test.ts
```

The final focused run passed: 8 files, 72 tests.

The required final quality gate also passed:

```text
pnpm quality
```

This completed Prettier, ESLint, TypeScript, all Vitest tests (8 files / 72
tests), and the Vite production build.

## Files

- `src/engine/input/StrokeSession.ts`
- `src/engine/input/StrokeSession.test.ts`

## Commit-state transition

`StrokeSessionState` retains the specified `committing` variant for the public
state vocabulary, but an `up` performs the operational transition
`drawing → idle` synchronously after taking an immutable final snapshot. Its
`onCommit` Promise is tracked in a private pending set, with both fulfillment
and rejection handlers. This keeps durability bookkeeping out of Pencil input
state, prevents unhandled rejections, and lets a new Pen `down` immediately
transition `idle → drawing` even while the earlier durable write remains
pending.

## Self-review

Verified pointer ownership, duplicate terminal-event idempotence, lost capture
after an already-processed `up`, clearing previews on cancellation, and that a
new confirmed batch replaces rather than appends the previous predicted tail.

## Concerns

None. Persistence failures are intentionally contained by the input layer and
remain the responsibility of the supplied durability callback.

---

## Review-fix addendum

This addendum supersedes the earlier commit-state transition description.

### RED / GREEN evidence

Added and observed failing tests for:

- clearing both preview channels on `up`;
- mutation through original inputs and preview callback arguments;
- observable synchronous commit errors;
- structural thenable rejection handling; and
- callback re-entry while the transient `committing` state is active.

Implemented the minimal changes for each cycle, then verified the focused
suite and typecheck. Final focused output:

```text
$ pnpm test -- src/engine/input/StrokeSession.test.ts

 RUN  v4.1.10 /Users/caleb/web-projects/home/fabric-sketcher/.worktrees/canvas-foundation

 Test Files  8 passed (8)
      Tests  78 passed (78)
```

### State and durability behavior

Every input sample is cloned and frozen before it is stored or passed to a
callback; arrays are frozen too. On `up`, the machine sets a frozen
`committing` state, clears preview with `onPreview([], [])`, dispatches one
commit callback, and synchronously returns to `idle` in a `finally` block.
This blocks re-entrant `down` calls made by either finalization callback while
allowing a same-pointer `down` immediately after `handle(up)` returns.

Returned `PromiseLike` values are normalized through `Promise.resolve`; both
synchronous throws and normalized rejections call optional `onCommitError`.
Pending writes remain private bookkeeping and cannot govern Pencil input.

### Self-review

Rechecked deep runtime immutability of input, preview, state, and committed
sample snapshots; final preview clearing; native and structural thenable
errors; re-entry blocking; same-pointer immediate recontact; duplicate up;
and harmless lost capture after matching up. No generation or capture-token
mechanisms were introduced.

### Final quality output

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

 Test Files  8 passed (8)
      Tests  78 passed (78)

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

✓ built in 117ms

PWA v1.3.0
mode      generateSW
precache  11 entries (224.81 KiB)
files generated
  dist/sw.js
  dist/workbox-2fbc6a65.js
```
