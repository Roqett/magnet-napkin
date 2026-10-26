# Napkinetic — implementation plan

**Status:** plan for review, not started. Spec: [`../01-NAPKINETIC-HANDOVER.md`](../01-NAPKINETIC-HANDOVER.md). Rules: [`../AGENTS.md`](../AGENTS.md).

---

## 1. What we are building, in my own words

One static page. You drag a folder of images onto it. You tell it the canvas is 214 × 719 pt. You drop the images around, resize them with the aspect locked, rotate them, nudge them with the arrow keys, type exact X/Y/W/H into an inspector. You add text that *belongs to the design*. You add notes that **do not** — sticky yellow, dashed border, a `NOTE` badge — because the whole point is to hand the result to a vision agent that must not mistake your commentary for the artwork.

Then you get four things out: `layout.png` (the clean design), `layout-annotated.png` (the same board with the notes visible), `layout.json` (the machine contract), `notes.md` (the brief). The JSON is the source of truth; the other three are derived from it.

**Definition of Done** = handover §9, all sixteen boxes, with evidence. I stop there. No accounts, no cloud, no build step, no npm, no framework, no MCP in this build, no stretch features.

**Non-goals restated:** vector editing, layers panel, multi-select, comments, AI generation, PDF, mobile-first, analytics, backend, collaboration, a shipped MCP server, Tauri.

---

## 2. Decisions — locked 2026-10-26

These are the ones where I had to choose, and where a different choice would change the output. All four were put to the owner and confirmed.

### D1 — What "scale" means (this changes the exported pixel size)

The handover has two "2×" concepts that collide: `canvas.scale` in the JSON, and the 1×/2×/3× export tiers. The Redline prototype stored **board pixels** (428 px wide) *and* multiplied by an export scale of 2, producing 856 px — and the handover explicitly calls that double-counting out as the mistake to avoid.

**My proposal:**

- `canvas.scale` = **pixels per canvas unit**. `214 pt at 2×` means *1 pt = 2 px*, so the board's raster grid is 428 × 1438 px.
- Export tiers are **multipliers on that grid**: tier 1 = 428 × 1438 px, tier 2 = 856 × 2876 px, tier 3 = 1284 × 4314 px.
- Tier 2 is the default, which makes the GT40 clean PNG **856 px wide — byte-for-byte the same dimensions the Redline prototype emits today**. Your existing pipeline sees no change.
- Every export button shows its exact pixel size, so "2×" never has to be guessed at.
- On screen, the board renders at `units × scale × zoom` CSS px, so at 2× the GT40 is 428 px wide on screen and matches the prototype's board exactly.

Alternative if you want "2×" to mean *2 px per pt* and nothing else: then the canvas `scale` field becomes redundant and the export tiers would be 428/856/1284 — the same numbers, but the field disappears and the tier is absolute rather than relative. Tell me if you prefer that; it only changes the UI labels, not the file sizes.

**Confirmed.** `canvas.scale` = pixels per canvas unit. Export tiers multiply it. Tier 2 is the default and yields 856 × 2876 px for the GT40 — the same dimensions the Redline prototype emits today. Every export button shows its exact pixel size.

**Confirmed.**

### D2 — Default canvas

**My proposal:** 1200 × 800 px, scale 1, light-grey checker background, with the empty state explaining "import, set canvas, drag" and offering the unit/scale fields in the toolbar. Handover open question #1 asked for exactly this. No presets in the MVP (the GT40 is one typing exercise away).

**Confirmed.**

### D3 — The clean PNG never contains a note. Ever.

The data model carries a per-note `includeInCleanPNG` flag, which implies a note *could* opt in. §9 says "no note is ever included in the clean PNG". **My proposal:** keep the field in the format (forward compatibility), always write `false`, and never honour it in this build. The clean PNG's trustworthiness is the product's core promise; a footgun that silently adds commentary to the design render is worse than a dead field.

**Confirmed.**

### D4 — File layout: split classic scripts, not one big `app.js`

`index.html` + `styles.css` + `js/*.js` as classic `<script>` tags (no ES modules — modules break `file://`, and the double-click promise matters). Each file is an IIFE that registers onto one namespace, `window.MN`, so there is no global soup and no build step:

```js
(function (MN) { MN.units = { ... }; })(window.MN = window.MN || {});
```

**Why not one 3000-line `app.js`:** the handover's own layout sketch suggests three files, but a single file would end up ~3000 lines of geometry, text layout, IndexedDB, import and export logic in one scope. Splitting costs nothing here (no bundler) and makes each phase a reviewable diff. **Why not ES modules:** `file://` blocks them.

**Confirmed.**

### D5 — The in-memory state *is* the file format

One state object, `{ canvas, assets, items, notes }`, shaped exactly like `napkinetic/v1`. No translation layer between what the editor holds and what it writes. `layout.json` is that object minus blobs and view state; `.napkin.json` is the same plus optional embedded image data. Undo snapshots are `structuredClone` of `{ canvas, items, notes, selection }` — assets are immutable, so their blobs never enter the history.

---

## 3. Architecture

```
napkinetic/
  index.html
  styles.css
  js/
    core.js        namespace, DOM helpers, clamp/round/uid/debounce, download helpers
    units.js       unit table (px/pt/mm/in), formatting, ruler tick steps
    state.js       the project state object, mutation helpers, selection, history, events
    textlayout.js  shared text measurement + wrapping (the DOM/canvas parity contract)
    assets.js      folder import, filtering, grouping, thumbnails, object-URL lifecycle
    stage.js       board element, zoom/pan, rulers, grid, guides, background, transforms
    items.js       item model + DOM magnet rendering + selection chrome
    notes.js       note model + DOM rendering + NOTE badge
    interact.js    pointer drag/resize/rotate, keyboard nudge, snapping engine
    inspector.js   right panel: canvas settings + selection fields + text/note controls
    project.js     IndexedDB (blobs + project), autosave, .napkin.json save/open/relink
    exporter.js    PNG render (clean/annotated, 1–3×), layout.json, notes.md, clipboard
    app.js         boot, toolbar wiring, empty state
  README.md  LICENSE  AGENTS.md
  01-NAPKINETIC-HANDOVER.md
  docs/
    FORMAT.md  SHORTCUTS.md  AGENT_HANDOFF.md  AGENTS-DSH.md  AGENTS-TEMPLATE.md  PLAN.md
  samples/        original SVG placeholders so a new user can try it in 10 seconds
  serve.sh        `python3 -m http.server` for the browser run that needs IndexedDB
```

### Data flow

```
drop folder ─┐
             ├─→ assets.js → asset registry (blob + object URL + intrinsic size)
new item  ───┘        │
                      ▼
              stage.js (renders board) ◄── interact.js (pointer/keyboard) ──→ inspector.js
                      │                                                    │
                      ▼                                                    ▼
                   state.js  ◄──────────── commit() ───────────────────────┘
                      │
                      ├──→ project.js  → IndexedDB (debounced 500 ms, never during a drag)
                      └──→ exporter.js → layout.png / layout-annotated.png / layout.json / notes.md
```

Everything mutates through `state.js`; every mutation ends in a `commit()` which pushes a history snapshot and schedules an autosave. Pointer-move never commits — only pointer-up does, which is the handover's undo rule.

---

## 4. The four hard parts, and how each is solved

These are where this build can go wrong. Each gets a specific technique, not a hope.

### 4.1 Text: the DOM and the PNG must agree exactly

Handover: *"If the two disagree, the PNG is wrong."* The prototype had no generic text, so this is genuinely new.

**Solution — one measurement, two consumers.** `textlayout.js` exposes:

```js
layoutText({ text, fontFamily, fontSize, fontWeight, width, align }) → {
  lines: [{ text, width }],   // in canvas units
  lineHeight,                 // fontSize * 1.2, in units
  height,                     // lines.length * lineHeight, in units
}
```

Wrapping is measured **in unit space**: the measurement context carries an inverse scale transform (`ctx.setTransform(1/k,0,0,1/k,0,0)`), so the same `fontSize` in units measures identically at every zoom level and every export tier. Both consumers then draw the *same line array*:

- DOM: one `<div>` per line, `font-size: fontSize × scale × zoom`, `line-height: lineHeight × scale × zoom`, `letter-spacing: 0`.
- Canvas: `ctx.font = "${weight} ${fontSize × scale × tier}px ${family}"`, one `fillText` per line at `y = index × lineHeight × scale × tier`.

Neither side re-wraps. Line breaks and box height cannot disagree, because there is only one answer. Explicit `\n` is honoured as a hard break. `await document.fonts.ready` before the first export.

**Residual risk (documented, not hidden):** glyph rasterisation differs by a pixel between the DOM text engine and the canvas text engine in the same browser. Line breaks and geometry match exactly; sub-pixel glyph placement may differ by <1 px. Accepted.

### 4.2 Units and scale

- Geometry is stored in canvas units, always. Never screen pixels. (The prototype's sin.)
- `canvas.scale` = px per unit (D1). Unit presets: px → 1, pt → 2 (Redline convention), mm → 3.7795 (96 dpi), in → 96; the field is free-editable to any positive number.
- On-screen size = `units × scale × zoom`. Rulers tick in units, with a tick step chosen from the unit and zoom (a "nice number" ladder: 1/2/5/10/25/50/100…).
- The inspector shows the typed value in the canvas unit and the equivalent in px beside it.
- `rotation` is degrees clockwise about the item centre. `x/y/w/h` are the **unrotated** box; rotation happens about the centre, so the JSON is unambiguous for a consuming agent.

### 4.3 IndexedDB does not exist on `file://` in Chrome

This is the "open it from disk" promise versus the autosave promise, and they conflict in one browser:

| | `file://` (double-click) | `http://localhost` |
|---|---|---|
| Chrome | **IndexedDB blocked** (opaque origin → SecurityError) | works |
| Safari | works | works |
| Firefox | works (unique-origin per file) | works |

**Solution:** feature-detect at boot with a guarded `indexedDB.open`. If it is unavailable, the app runs fully — import, place, edit, export, Save/Open project files all work — and shows one honest banner: *"Autosave needs a local server — run `./serve.sh` (or `python3 -m http.server`) and open http://localhost:8080, or use File ▸ Save project."* `serve.sh` is two lines and is documented in the README. No silent data loss, no false promise.

**Second `file://` risk:** `canvas.toBlob()` after drawing images can hit a SecurityError with opaque origins in some browser versions. Mitigated by drawing from `blob:` object URLs (same-origin with the document) and by a guarded export path that catches the error and says *"Export needs the local server"* instead of failing silently. Both risks get an explicit browser check in Phase 10, not a hope.

### 4.4 Folder import across three browsers

Three different APIs, one layered path:

1. `DataTransferItem.webkitGetAsEntry()` — Chrome and Safari. Recurses directories; yields relative paths.
2. `DataTransferItem.getAsFileSystemHandle()` — Firefox (and modern Chrome). Fallback path when `webkitGetAsEntry` is absent.
3. `<input type="file" webkitdirectory multiple>` — universal fallback, also the "Import folder" toolbar button.
4. `showDirectoryPicker()` — Chromium-only nicety, feature-detected, never required, never blocking.

Rules: keep the relative path as the asset path; group the tray by the first path component; filter to PNG/JPEG/WebP/SVG/GIF by MIME *and* extension; sort by path; dedupe by path; ignore everything else silently but report the count of skipped files. Thumbnails come from `URL.createObjectURL` on the blob (full image — a few hundred assets is fine); the blob is stored in IndexedDB, not a data URI. Object URLs are revoked on New/reset.

---

## 5. Phase plan

Fourteen commits, each one coherent change, each gated before the next begins. `node --check` runs on every `.js` file at every gate; the page is opened from disk and the console must be clean.

| # | Commit | Delivers | Gate before moving on |
|---|---|---|---|
| 0 | `chore: scaffold the static app shell` | `index.html`, `styles.css`, `js/core.js`, `js/state.js`, `js/app.js`, namespace pattern, three-column layout, empty state | Opens from disk, console clean, no network requests |
| 1 | `feat: canvas with units, rulers, grid and zoom` | Canvas settings (W/H/unit/scale/background), top+left rulers in units, zoom in/out/fit, pan, grid | 214 × 719 pt at 2× shows rulers in pt; the board is 428 px wide on screen |
| 2 | `feat: folder import and searchable asset tray` | Drop/import folder, three browser paths, grouping, thumbnails with intrinsic dimensions, search, `samples/` placeholders | Mixed folder → searchable tray with dims; non-images ignored; samples import |
| 3 | `feat: place, move, resize and rotate items` | DOM magnets, pointer events with capture, drag from tray at the drop point, click-to-centre fallback, aspect lock, rotation handle with Shift = 15°, selection outline + dimension tag, inspector X/Y/W/H | Drag in, move, resize locked/unlocked, rotate, type exact values; multiple copies of one asset |
| 4 | `feat: design text boxes with a shared text layout` | `+ Text`, font list (`system-ui`, Georgia, Menlo, Avenir Next Condensed, Helvetica Neue), size/weight/colour/align/background, auto-height, `textlayout.js`, double-click to edit | Text renders in the editor with the shared layout; auto-height follows the content |
| 5 | `feat: notes as a separate non-design layer` | `+ Note`, sticky styling, dashed border, `NOTE` badge, own z-order, separate `notes` array | A note is unmistakably a note; it is never in `items` |
| 6 | `feat: arrange items with z-order, lock, opacity, duplicate and delete` | Bring to front / send to back, lock, opacity, duplicate, delete | All five work on images and text |
| 7 | `feat: snapshot undo and redo` | 50-entry snapshot history, commit on pointer-up, ⌘Z / ⇧⌘Z, selection restored | 20+ steps work; a drag is one step, not 400 |
| 8 | `feat: snapping with visible guides` | Grid + canvas edges/centre + other items' edges/centres, guide lines, Alt bypass, toggle | Guides appear and vanish; snapping off is honoured |
| 9 | `feat: autosave to IndexedDB and round-trip project files` | IDB blobs + project, 500 ms debounce, `.napkin.json` save/open, embed-images option, relink by filename, missing-asset report, New, `file://` banner | Reload restores the board and its images; JSON round-trips; missing assets reported, not dropped |
| 10 | `feat: export clean and annotated PNGs` | Offscreen canvas at `width × scale × tier`, background, items in array order with translate/rotate/translate/drawImage, text via the shared layout, notes only in annotated, 1×/2×/3× with pixel sizes shown | Clean export matches the canvas minus UI/grid/guides/notes; annotated includes notes with badge and dashed border |
| 11 | `feat: agent handoff with notes.md and a copyable brief` | Handoff panel: four explicit downloads + Copy handoff; `notes.md` derived from `notes` | `notes.md` lists notes with positions in canvas units and says the clean PNG is the design; clipboard brief is compact |
| 12 | `a11y: keyboard selection, focus management and labelling` | Tab cycles items, visible focus rings, labelled controls, `aria-live` status, full mouse-free path | The common path — import, place, nudge, edit text, add note, undo, export — works from the keyboard alone |
| 13 | `docs: format, shortcuts, agent handoff guide and README polish` | `FORMAT.md`, `SHORTCUTS.md`, `AGENT_HANDOFF.md`, README screenshot/GIF/quick start/privacy, public-repo polish pass (MIT, promo capture as the README image, no Redline source assets), cross-browser fixes | Full §9 checklist, each box with evidence; Chrome, Safari and Firefox smoke-tested |

**After Phase 13, two extra validation passes:**

1. **Rebuild the GT40 board from the real Redline asset folder** (imported locally, never committed), export at 2×, and compare against `docs/demo/redline-gt40.jpg`. This is the real acceptance test for "this app was designed to help me with Redline", and it stress-tests folder import, aspect ratios and the note layer on real artwork.
2. **Public-repo pass** — README screenshot/GIF, MIT licence, quick start, privacy statement, and a `git ls-files` audit proving no Redline source asset, font or brand file is in the tree. Only `docs/demo/redline-gt40.jpg` is permitted, as a capture.

### Per-phase working rhythm

1. Read the phase's slice of the handover. Implement.
2. `node --check` every touched `.js` file.
3. Open `index.html` from disk in the browser tool. Console must be clean. Screenshot.
4. Exercise the phase's gate in the browser.
5. Commit — one coherent change, Conventional Commits.
6. Then the next phase. No starting the next phase while the current one is visibly broken.

---

## 6. Verification matrix

How each Definition-of-Done box is proven, rather than asserted:

| §9 item | Evidence |
|---|---|
| Folder in → searchable tray | Browser run with a mixed folder; tray shows groups, thumbnails, intrinsic dimensions; search filters |
| 214 × 719 pt at 2×, rulers in pt | Screenshot; ruler labels read in pt; board measures 428 CSS px |
| Drag, move, resize locked, rotate, exact X/Y/W/H | Browser interaction + inspector values read back |
| z-order, lock, opacity, duplicate, delete, undo/redo | Each action performed and observed; undo restores prior state |
| Text with font/size/weight/colour/align/background, in the clean PNG | Export at 2×, inspect the PNG; text present, no notes |
| Note unmistakable, hidden from clean, present in annotated | Side-by-side of both PNGs; badge and dashed border visible |
| Snapping and guides, switchable | Drag near a canvas edge → guide appears; toggle off → no guide |
| Reload restores project and images | Reload the page → board and assets return without re-import |
| Clean PNG identical to the canvas minus UI/grid/guides/notes | Tier-1 export vs a board screenshot at the same pixel size |
| Annotated PNG includes notes with badge and border | Visual check on the exported file |
| `.napkin.json` round-trips; missing assets reported | Export → clear → import → identical state; then import a file with a missing asset → warning list, items preserved |
| `notes.md` lists notes with positions/units | Read the file |
| No note in `items`; no note in the clean PNG | Assert on the exported JSON and on the PNG |
| No console errors; no network after load | Browser console empty; DevTools network shows zero requests after load |
| README, LICENSE, FORMAT.md, SHORTCUTS.md, AGENT_HANDOFF.md exist | File listing |
| No Redline assets, fonts or brand material in the repo | `git ls-files` inspection; no `Assets.xcassets`, no Redline artwork — only `docs/demo/redline-gt40.jpg`, which is a permitted capture |

---

## 7. How the subagents get used

**oMLX Qwen (`Dirk (boilerplate)`)** — the local 27B. It gets the mechanical, high-volume, low-judgment work, with small self-contained briefs (it cannot hold a huge context, so each brief must stand alone):

- Phase 0: the `index.html` skeleton and the `styles.css` chrome (grid layout, panels, control styling) from a written spec.
- Phase 2: the `samples/` placeholder SVGs.
- Phase 13: the `FORMAT.md` / `SHORTCUTS.md` skeletons (filled from the code, not from memory).

**What it does not get:** geometry, the text-layout parity contract, the export renderer, IndexedDB, the import walk, undo/redo. Those are the parts where a subtle error makes the PNG wrong or the project unopenable, and they are the parts where the model's context limit shows. Those I write and review myself.

**`planner` / `code-reviewer` / `security-reviewer`** — `code-reviewer` after each of Phases 3, 5, 9 and 10 (geometry, notes separation, persistence, export). `security-reviewer` before the repo is announced, covering file import, SVG loading, text rendering and export. `planner` has already effectively been this document.

---

## 8. Risks

| Risk | Mitigation |
|---|---|
| DOM text and PNG text disagree | Single shared measurement in unit space; both consumers draw the same line array (§4.1) |
| `file://` in Chrome has no IndexedDB | Feature-detect, run fully without autosave, banner + `serve.sh` (§4.3) |
| `toBlob` SecurityError on `file://` | Guarded export path, blob-URL sources, explicit error message |
| Firefox has no `webkitGetAsEntry` | `getAsFileSystemHandle` + universal `webkitdirectory` fallback (§4.4) |
| Export pixel size does not match what Redline needs | D1 put up front for your sign-off; tier 2 = 856 px wide = today's prototype output |
| Export tier vs canvas scale confuse users | Every export button shows its exact pixel dimensions |
| `Avenir Next Condensed` is macOS-only | Documented fallback chain; the shared layout keeps wrapping identical once the font resolves the same way in both consumers |
| Scope creep into stretch features | The §9 checklist is the gate; stretch items stay listed and unbuilt |

---

## 9. Deliberately not in this build

Stretch list from handover §4, untouched: layers panel, multi-select / align / distribute / group, shape magnets, note pins with leader lines, SVG export, PWA install, Tauri wrapper, asset replacement by filename, multiple boards, MCP server.

Two additions I would also leave out: a `.zip` handoff bundle (four separate downloads is fine and needs no dependency), and inline `contenteditable` text editing (inspector-only is enough for labels and headings).

---

## 10. How we work from here

Decisions are locked (D1–D5, confirmed 2026-10-26). The plan is approved to execute.

**Status: all fourteen phases are built, committed and verified.** See §11 for what
was proved and what is still open.

1. Phases run in order, each committed separately, each gated before the next begins.
2. I report at the end of each phase in one short block: what was built, what the gate showed, what is deliberately deferred.
3. At Phase 13 the final report walks §9 line by line with evidence, then the two validation passes (GT40 rebuild, public-repo pass).

**Still open — answer whenever, I will not block on it:**

- Anything in the Redline workflow the handover missed — a magnet type, a plate style, an underlay, a snapping behaviour — that the generic version should carry.
- Whether `Avenir Next Condensed` should be dropped from the font list. It is macOS-only; the list reads better with a cross-platform fallback in the same slot.

---

## 11. What was built, and what it is

### The phases, and what each one proved

| # | Commit | Gate that was met |
|---|---|---|
| 0 | `feat: scaffold the static app shell with canvas controls and undo history` | opens, console clean, no network requests after load |
| 1 | `feat: canvas stage with unit rulers, zoom, grid, background and pan` | 214 × 719 pt at 2× shows rulers in pt and a 428 px board |
| 2 | `feat: folder import across four browser paths with a searchable asset tray` | a mixed folder lands in a searchable, grouped tray; non-images skipped |
| 3 | `feat: place, select, move, resize and rotate items with a live inspector` | drag, resize locked and free, rotate, exact X/Y/W/H in the inspector |
| 4 | `feat: design text boxes with a shared DOM and PNG text layout` | the measured lines and the drawn lines are the same array |
| 5 | `feat: notes as a separate non-design layer with badge, dashed border and paper` | a note is never in `items`; it has a badge and a dashed border |
| 6 | (folded into 3 and 5) | z-order, lock, opacity, duplicate and delete, on items *and* notes |
| 7 | (folded into 3) | fifty undo steps; undo reaches the empty board, redo puts it back |
| 8 | `feat: snapping to grid, canvas and other objects with visible guides` | guides appear on a snap and vanish on release; Alt bypasses |
| 9 | `feat: autosave to IndexedDB and round-trip .napkin.json project files` | a reload restores the board and its images; the JSON round-trips exactly |
| 10 | `feat: export clean and annotated PNGs drawn from the item data` | the clean PNG differs from the editor by 0.5% of pixels, all of it glyph anti-aliasing |
| 11 | `feat: agent handoff with notes.md, layout.json and a copyable brief` | four files download; `notes.md` says which file is the design |
| 12 | `a11y: keyboard selection, focus handling, labels and contrast` | Lighthouse accessibility 1.0; the board works from the keyboard alone |
| 13 | `docs: format, shortcuts, agent handoff guide and README with a screenshot` | README, `FORMAT.md`, `SHORTCUTS.md`, `AGENT_HANDOFF.md` |

### The four things that were harder than they looked

**The text parity.** The editor draws text in the DOM and the exporter draws it on a canvas, and the two engines disagree about where the baseline belongs. The fix was to stop guessing: `textlayout.js` measures once, and the exporter asks the browser where it puts the baseline (a hidden probe with a zero-height inline block) instead of assuming. The measured line breaks are the same array in both places, so the two cannot disagree about the text. The residual difference is 0.4 px of glyph centroid — the rasterisation floor between the two engines.

**The promise chain in the exporter.** The first version drew every item from the same promise without chaining, so an opaque image was painted *after* the text and covered it. The pixel diff caught it: 7.8% of the pixels differed. Now the items are drawn strictly in order.

**IndexedDB on `file://`.** Chrome refuses IndexedDB on a page opened from disk, which is the "double-click it" promise. The app feature-detects it, runs fully without autosave, and says so in a banner rather than pretending. `./serve.sh` gives a real origin.

**The undo off-by-one.** The history kept the current state as its last entry, so the first undo did nothing and the initial state could never be reached. Found by a test that undid everything and checked the board was empty.

### The look

The interface is dark by default — the owner asked for it, and the Redline
prototype they work in is dark too. The chrome is glass: the toolbar, the
asset tray and the inspector are translucent panels floating over a soft
wallpaper, blurred with `backdrop-filter`, with a hairline and a specular
edge along the top. The board is the only opaque thing on screen, so nothing
in the interface competes with the artwork.

The light palette is still in the stylesheet under `[data-theme="light"]`, one
attribute away from being used. `prefers-reduced-transparency` turns the
glass off and leaves plain panels.

### The board had to survive more than one tab

The owner lost a real 34-magnet Redline layout to three tabs sharing one
`localStorage` key, with the empty tab saving last. The requirement that came
out of it is in `docs/AUTOSAVE_AND_RECOVERY.md`, and it changed the storage
layer:

- **Versioned snapshots.** A `history` store keeps the last 50 versions of the
  board, one per commit plus a checkpoint every minute, capped by size as
  well as count. The **History** button lists them and restores any one.
- **A second tab cannot overwrite you.** Each tab has an identity and
  announces its saves over `BroadcastChannel`, with a `localStorage` ping and
  a `visibilitychange` check as fallbacks. A tab that hears another tab save
  says so and offers to reload or to keep writing. A tab whose stored board
  is newer than the one it loaded stops and asks.
- **An empty board never replaces a full one.** The save is refused and the
  status line says why, unless the user asked for it with **New**.
- **View state is separate.** The zoom, the grid, the snap, the asset ratio
  and the underlay live in their own store, so moving the zoom can never
  rewrite the layout.
- **A second database for the new stores.** Raising the version of a database
  blocks every other tab still holding it open, and a blocked upgrade leaves
  those tabs unable to read or write at all. The history and the view state
  went into their own database so no migration can ever strand an open tab.

`tests/persistence.html` is the two-tab acceptance test from that document. It
passes in Chrome 152 and Firefox 156.

### What is verified, and how

| Claim | Evidence |
|---|---|
| the clean PNG is the canvas minus UI, grid, guides and notes | the editor was screenshotted and compared to the export pixel by pixel: 604 of 120,000 pixels differ (0.5%), all of them glyph edges, with a 0.4 px sub-pixel centroid difference |
| a note never reaches the clean PNG | the notes were painted magenta — impossible in the artwork: 0 magenta pixels in the clean PNG, 122,513 in the annotated one |
| the notes are not design content | `layout.json` keeps `items` and `notes` apart; no note has `kind: "note"` inside `items` |
| the export size is right | the GT40 panel at 214 × 719 pt, scale 2: tier 1 = 428 × 1438, tier 2 = 856 × 2876, tier 3 = 1284 × 4314 |
| the JSON round-trips | the document is compared before and after a load: identical |
| missing assets are reported, not dropped | a project with an unknown asset opens with the item kept, a placeholder shown and a relink dialog listing it |
| the app works in more than one browser | the same suite passes in Chrome 152 and Firefox 156 (`tests/`) |
| the app is accessible | Lighthouse: accessibility 1.0, best practices 1.0, SEO 1.0 |

One Lighthouse warning remains, and it is deliberate. `label-content-name-mismatch`
complains that the visible text of a text box or a note is not literally inside
its accessible name. The visible text is broken across lines by the shared
layout, and the accessible name is the sentence as it was written. Removing the
warning means putting the whole text in one element and letting the browser
wrap it — which gives up the guarantee that the screen and the exported PNG
break the lines in the same places. The score is 1.0 either way; the export
parity is the promise worth keeping.
| nothing leaves the machine | the network log after load holds only local files and `blob:` URLs |
| no Redline material is in the repo | `git ls-files`: the only Redline file is `docs/demo/redline-gt40.jpg`, the permitted capture. 43 files, 620 KB in total |

### The GT40 rebuild

The real acceptance test: the actual `@2x` Redline assets were imported, the
panel was rebuilt at 214 × 719 pt with the tachometer, the auxiliary gauge, the
toggles, the plates and the wordmark, and the four handoff files were produced.
The clean PNG is the panel; the annotated PNG is the panel with the three
notes on it.

Two things came out of it:

1. The `@2x` assets arrived twice the size they wanted to be. The tool now has
   an **Asset ratio** setting in the inspector: set it to `2` and a newly placed
   asset comes in at half its pixel size, which is exactly what `@2x` artwork
   needs. This is the one addition the rebuild asked for.
2. The layout in the rebuild is an approximation — the real coordinates live in
   the Redline project, not in this repository.

### Still open

- **Safari** is reviewed but not automated: `safaridriver` needs "Allow Remote
  Automation" turned on in Safari's Develop menu, which is a click only the
  owner can make. The same suite runs unchanged once it is on.
- The two open questions in §10.
- The handover's stretch list is untouched, as promised.

### The bug the owner found, and what it taught

The owner placed an image on the sheet and then could not select it with the
mouse: every click on the artwork was landing on the empty **notes layer**,
which is a transparent `<div>` covering the whole board. It sat above the
items layer and swallowed the pointer, so a click deselected instead of
selecting, and the resize handle could not be reached.

The layers are now containers, not surfaces:

```css
#bg, #grid, #guides, #items, #notes { pointer-events: none; }
.magnet { pointer-events: auto; }
```

Two lessons, both now in the smoke test:

1. **Synthetic events hide hit-testing bugs.** Every earlier test dispatched
   events straight at an element, which bypasses whatever is painted on top.
   The suite now asks the browser what is actually under the pointer with
   `elementFromPoint`, and presses that element.
2. **A real click is the test.** `browser.click` on the canvas now selects the
   placed image, the resize handle is under the pointer, and dragging it
   resizes by exactly the pointer delta and keeps the selection.

Also fixed while I was in there: a double click in the tray placed two copies
of the same asset, and the canvas background could not be set to an image —
the format and the exporter both supported it, but the inspector did not
offer it.
