# Traceable Fashion Foundation — Checkpoint A

Verified: 2026-07-29

## Integrated recovery

- [x] A fresh project can add Neutral figure — Front and persist independent
      opacity, landmark, lock, and transform changes.
- [x] A Denim stroke and the final Foundation state survive a confirmed
      snapshot, repository close, and reopen through a new
      `BrowserProjectRepository` instance.
- [x] Recovery asserts schema version 2, pinned asset ID/version, 55% opacity,
      locked state, outline and center landmarks, the exact placed transform,
      and Denim brush identity.
- [x] An unknown pinned asset remains valid document data. The editor mounts
      the recovered artwork renderer, marks the unavailable guide as missing,
      presents “Foundation unavailable / Your artwork is safe,” and keeps
      Brushes functional.
- [x] Removing an unavailable or available guide leaves the artwork/canvas
      surface intact.

The recovery test was introduced against the accepted Tasks 1–7 behavior and
passed once its test harness matched the renderer's real render-stroke-array
contract. No persistence production fix was demonstrated. Visual QA did expose
a separate 40×40 Brushes close target; the paired shelf-target test failed at
40px before the CSS was corrected to 56×56 and passed.

## Browser workflow

Browser: connected Chrome session against the already-running Vite process.
The process was not stopped or restarted.

- [x] `http://localhost:5173/` identified as Fabric Sketcher and rendered the
      gallery without a framework overlay.
- [x] A fresh design was created.
- [x] Opening Layers closed Brushes; both shelves remained mutually exclusive.
- [x] Neutral figure — Front was added.
- [x] Opacity was committed at 55%; Body levels was hidden while outline and
      center remained visible.
- [x] Unlock exposed the transform boundary; panel scale was committed at 120%;
      relocking removed all transform chrome.
- [x] Denim remained selectable and visibly checked while Foundation controls
      were present.
- [x] Hide removed all guide `<use>` elements; Show restored two visible
      landmark groups.
- [x] Replacing the guide with Professional dress form — Front retained the
      exact rendered matrix:
      `matrix(0.3322076612903226 0 0 0.3322076612903226 -68.65624999999991 -96.47857862903234)`.
- [x] Returning to the gallery and reopening recovered the dress form, 55%
      opacity, 120% scale, landmark visibility, lock state, and exact matrix.
- [x] Removing the guide left the drawing canvas mounted with no error overlay.
- [x] The live LAN endpoint
      `http://192.168.1.148:5173/` rendered the Fabric Sketcher gallery with no
      console warnings or errors.
- [ ] Apple Pencil drag, touch pinch-scale, and the final physical Denim stroke
      require the user on real iPad hardware. Browser automation cannot emit a
      genuine Apple Pencil or multi-touch contact; synthetic input is not a
      substitute for this acceptance gate.

## Visual comparison

Source of truth:
[`editor-landscape-approved.png`](../design/concepts/editor-landscape-approved.png)

Committed mobile capture:
[`traceable-fashion-foundation-ipad.png`](traceable-fashion-foundation-ipad.png)

Desktop capture:
`/private/tmp/traceable-fashion-foundation-desktop-1448x1086.png`

| Criterion               | Evidence                                                                                                                                                        |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Warm paper / cool field | Paper `rgb(247, 243, 236)`; field `rgb(242, 241, 239)`, matching the restrained approved palette.                                                               |
| Quiet Foundation        | Guide rendered at 55% opacity in muted linework beneath the artwork canvas layer.                                                                               |
| Shelf family            | Both handles measured 56×144; Layers and corrected Brushes close targets measured 56×56; panels share warm surfaces, fine rules, radius, and restrained shadow. |
| Overlay behavior        | Desktop paper remained exactly 688.57×973.99 at x=379.71 before and after opening the 292px Layers panel.                                                       |
| Oxblood selection       | Active Foundation rule measured `rgb(151, 37, 31)`; range fills and checked controls used the same family color.                                                |
| Responsive safety       | At 1448×1086, scroll width was 1448. At 390×844, scroll width was 390 and the open panel remained within x=35…327 and y=80…832.                                 |
| Locked presentation     | Both desktop and mobile inspections found no transform boundary or hit-target chrome while locked.                                                              |
| Unknown asset safety    | App and DrawingSurface integration tests prove the canvas/artwork renderer stays mounted and error UI remains confined to the Layers shelf.                     |

The implementation remains intentionally quieter and more task-focused than the
north-star image: future radial tools, extra shelves, and garment rendering are
outside Checkpoint A.

## Real-device handoff

On the LAN URL, open the newest design and try this short hardware sequence:

1. Open Layers, add Neutral figure — Front, then tap **Unlock foundation**.
2. Drag the guide with Apple Pencil; pinch with two fingers to scale; tap
   **Lock foundation** and confirm no transform chrome remains.
3. Open Brushes, choose Denim, and draw one stroke over the guide.
4. Hide/show the guide, replace it with Professional dress form — Front, then
   return to the gallery and reopen.
5. Confirm the guide placement and artwork are exact, remove the guide, and
   confirm the Denim artwork remains.

Record device model, iPadOS/Safari version, and pass/fail before planning
Checkpoint B.

## Verification record

- Focused close-target RED:
  `expected 40 to be greater than or equal to 56`.
- Focused close-target GREEN: 1 passed; full DrawingSurface suite 24 passed.
- Focused recovery/unknown-asset suite: 3 files, 88 tests passed.
- Integrated slice:
  `pnpm exec vitest run src/app src/features src/platform/persistence src/state`
  — 12 files, 147 tests passed before the target-size correction.
- Browser console: zero warnings or errors at localhost desktop/mobile and the
  LAN gallery.
- Final `pnpm quality`, `git diff --check`, and scoped status are recorded in
  the Task 8 report.
