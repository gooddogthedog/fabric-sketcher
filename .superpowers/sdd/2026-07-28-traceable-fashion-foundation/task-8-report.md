# Task 8 report — Integrated Recovery, Visual QA, and Checkpoint A Handoff

Date: 2026-07-29

## Outcome

Task 8 adds the Checkpoint A cross-system recovery coverage, protects the
editor workflow for an unknown pinned Foundation asset, captures responsive
visual evidence, and fixes one demonstrated accessibility/visual gap: the
Brushes close target now matches the Layers close target at 56×56.

No persistence or unknown-asset production gap was demonstrated. The only
production change is the measured close-target correction in
`src/app/app.css`.

The controller's existing Vite process was not stopped or restarted. The final
process restart remains controller-owned.

## Recovery RED / GREEN

### Integrated recovery

The new repository test drives the real `EditorStore` across the real
`BrowserProjectRepository` boundary:

1. Create and open a project.
2. Add Neutral figure — Front.
3. Persist 55% opacity, outline/center landmarks, unlock, an exact placement
   matrix, and relock.
4. Select Denim and commit one Denim stroke.
5. Write a confirmed snapshot and close the repository.
6. Reopen through a new `BrowserProjectRepository` instance.
7. Assert schema v2, pinned Foundation identity/version, exact final Foundation
   state, exact transform, and Denim brush identity.

The first three-file run was RED with 10 failures, but inspection rejected it
as a product RED: an existing `documentReducer` import had been displaced and
the two new UI assertions expected a `DesignDocument` where the real renderer
contract accepts a render-stroke array. The recovery scenario itself passed on
that run. After fixing the test harness, the focused suite was GREEN:

```text
Test Files  3 passed (3)
Tests       88 passed (88)
```

This establishes that Tasks 1–7 already supplied the intended persistence
behavior; Task 8 adds the missing integrated proof without inventing a
production fix.

### Demonstrated visual RED / GREEN

Live desktop measurement found `.brush-shelf__close` at 40×40 while
`.layers-shelf__close` was 56×56. A test-first paired-target assertion produced
the expected RED:

```text
AssertionError: expected 40 to be greater than or equal to 56
Test Files  1 failed (1)
Tests       1 failed | 23 skipped (24)
```

The minimal CSS change set width/min-height to 56px and padding to 12px. GREEN:

```text
Test Files  1 passed (1)
Tests       1 passed | 23 skipped (24)

Test Files  1 passed (1)
Tests       24 passed (24)
```

Live reload then measured the Brushes close target at exactly 56×56.

## Unknown pinned asset

The fixture pins `retired-foundation@9` alongside a recovered Denim stroke.
Coverage proves:

- App opening reaches the editor instead of an error screen.
- The real renderer receives the recovered artwork stroke.
- The Foundation overlay marks the guide missing and renders no broken asset.
- Layers says “Foundation unavailable” and “Your artwork is safe.”
- Opening Brushes closes Layers; Denim remains functional and selectable.
- The drawing canvas remains mounted throughout.

## Integrated test gate

Exact brief command, rerun after the CSS correction:

```text
$ pnpm exec vitest run src/app src/features src/platform/persistence src/state

RUN  v4.1.10

Test Files  12 passed (12)
Tests       147 passed (147)
Duration    1.91s
```

## Browser workflow and measurements

Browser path: connected Chrome Browser session against the already-running
Vite process. The browser tab was reloaded after the CSS edit; Vite itself was
not restarted.

Workflow exercised:

1. Loaded `http://localhost:5173/`; title was `Fabric Sketcher`.
2. Created a fresh design.
3. Opened Brushes, then Layers; Brushes closed and Layers became the sole open
   shelf.
4. Added Neutral figure — Front.
5. Committed opacity at 55% and turned Body levels off.
6. Unlocked; transform boundary/hit target appeared.
7. Used the panel scale control to commit 120%; relocked; boundary/hit target
   disappeared.
8. Opened Brushes, selected Denim, and confirmed the checked native radio.
9. Hid the guide (zero `<use>` nodes), then showed it (two `<use>` nodes).
10. Replaced with Professional dress form — Front. Before/after rendered
    transforms were identical:
    `matrix(0.3322076612903226 0 0 0.3322076612903226 -68.65624999999991 -96.47857862903234)`.
11. Returned to the gallery and reopened the latest design. Recovered opacity
    was `0.55`, transform was exact, two guide groups were visible, and locked
    mode had no transform chrome.
12. Removed the guide; the canvas remained mounted, guide use count became
    zero, and no framework error overlay appeared.
13. Loaded `http://192.168.1.148:5173/`; title/gallery were correct and console
    warnings/errors were empty.

The brief's example LAN address is `.242`; the controller supplied `.148` as
the currently live endpoint, so `.148` was the endpoint verified.

### Desktop — 1448×1086

- Document scroll width: 1448; no horizontal overflow.
- Cool field: `rgb(242, 241, 239)`.
- Warm paper: `rgb(247, 243, 236)`.
- Closed paper: x=379.71, width=688.57, height=973.99.
- Open Layers paper: x=379.71, width=688.57, height=973.99.
- Layers panel: x=1068, width=292, height=640; it overlays without resizing the
  paper.
- Brush handle: 56×144.
- Layers handle: 56×144.
- Layers close: 56×56.
- Brushes close after fix/live reload: 56×56.
- Selected Foundation rule: `rgb(151, 37, 31)` (oxblood).
- Locked transform chrome: absent.
- Console warnings/errors: none.

### Mobile — 390×844

- Document scroll width: 390; body overflow-x hidden.
- Paper: x=16…374, y=168.3…674.7.
- Open Layers panel: x=35…327, y=80…832.
- Brush handle: x=-1…55; Layers handle: x=335…391. Both retain a 56px target
  thickness without increasing document width.
- Layers close: 56×56.
- Locked transform chrome: absent.
- Console warnings/errors: none.

### Screenshot evidence

- Desktop:
  `/private/tmp/traceable-fashion-foundation-desktop-1448x1086.png`
  (PNG, 1448×1086).
- Mobile:
  `docs/testing/traceable-fashion-foundation-ipad.png`
  (PNG, 390×844).
- North star:
  `docs/design/concepts/editor-landscape-approved.png`.

Visual comparison found the expected warm-paper/cool-field hierarchy, quiet
muted guide, family resemblance between shelf handles/panels, stable overlay
geometry, oxblood selection, safe responsive bounds, and no locked transform
chrome. Unknown-asset error containment is proven by the integrated component
tests because the UI cannot create an unknown catalog pin through normal
browser controls.

## Real-device limitation

The connected browser surface cannot emit a genuine Apple Pencil contact or
two independent touch contacts. It did not validate Pencil drag, touch
pinch-scale, or a physical Denim stroke. Synthetic pointer input is not a
substitute for the final Apple Pencil acceptance check.

User-required sequence before Checkpoint B:

1. Add and unlock a Foundation on the live LAN URL.
2. Drag it with Apple Pencil.
3. Pinch-scale with two fingers.
4. Relock and confirm transform chrome disappears.
5. Draw one Denim stroke over the guide.
6. Hide/show, replace, return to gallery, reopen, verify exact recovery, then
   remove the guide and confirm artwork remains.

Record the iPad model, iPadOS/Safari version, and pass/fail.

## Complete quality gate

The first `pnpm quality` attempt stopped at `prettier --check` on the four
newly edited text files. Those exact files were formatted and the complete gate
was rerun from the beginning.

Full successful output:

```text
$ pnpm quality
$ pnpm format:check && pnpm lint && pnpm typecheck && pnpm test && pnpm build
$ prettier --check .
Checking formatting...
All matched files use Prettier code style!
$ eslint .
$ tsc -b --pretty false
$ vitest run

RUN  v4.1.10

Not implemented: HTMLCanvasElement's getContext() method: without installing the canvas npm package
Not implemented: HTMLCanvasElement's getContext() method: without installing the canvas npm package
Not implemented: HTMLCanvasElement's getContext() method: without installing the canvas npm package

Test Files  27 passed (27)
Tests       279 passed (279)

$ tsc -b && vite build
vite v8.1.5 building client environment for production...
transforming... ✓ 48 modules transformed.
rendering chunks...
computing gzip size...
dist/registerSW.js                0.13 kB
dist/manifest.webmanifest         0.43 kB
dist/index.html                   0.60 kB │ gzip:  0.35 kB
dist/assets/index-Dv-Ul0NL.css   16.91 kB │ gzip:  3.68 kB
dist/assets/index-cNeiE_UJ.js   273.23 kB │ gzip: 83.58 kB
✓ built in 71ms

PWA v1.3.0
mode      generateSW
precache  13 entries (329.18 KiB)
files generated
  dist/sw.js
  dist/workbox-2fbc6a65.js
```

The three jsdom canvas `getContext()` notices are the previously recorded
non-failing test-environment noise; there are zero test failures.

`git diff --check` completed with exit code 0 and no output.

## Preserved files and scope

Preserved byte-identical checksums:

```text
72a97062f259f78da935b1138b6a5b9f1e8db801  vite.config.ts
6bc05bdf82594dad1316f87869a9c8b80a27972c  docs/testing/fabric-brush-alpha-checklist.md
47842babafe1054bdace3a9f4c8a3771f0caf980  docs/testing/fabric-brush-alpha-ipad.png
```

`vite.config.ts` remains a pre-existing user modification and is intentionally
unstaged. The existing `fabric-brush-alpha-*` files remain untracked,
byte-identical, and unstaged.

Per controller instruction, the plan/progress ledger was not edited.

Scoped Task 8 files:

- `src/app/App.test.tsx`
- `src/app/app.css` (demonstrated owning-boundary fix)
- `src/features/canvas/DrawingSurface.test.tsx`
- `src/platform/persistence/BrowserProjectRepository.integration.test.ts`
- `docs/testing/traceable-fashion-foundation-checklist.md`
- `docs/testing/traceable-fashion-foundation-ipad.png`
- `.superpowers/sdd/2026-07-28-traceable-fashion-foundation/task-8-report.md`

## Self-review and concerns

- Tests assert real repository/editor/renderer behavior; they do not assert
  mock existence. Expected Foundation fields and placed transform are literal
  and independently specified.
- The new recovery test closes and reopens a distinct repository instance and
  cleans up IndexedDB even on failure.
- Unknown-asset tests cover both app entry and DrawingSurface shelf interaction.
- The CSS fix is limited to the owning Brushes close control and has a
  regression assertion paired with the existing Layers target.
- No public product API or Checkpoint B behavior was introduced.
- Remaining concern is only the explicit real-device gate. Hardware input,
  iPadOS Safari safe-area behavior, and physical Pencil/touch arbitration still
  require the user.
- The browser-created test project intentionally remains in local browser
  storage; it contains no user data and is useful for the handoff.
