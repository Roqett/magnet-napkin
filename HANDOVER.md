# Magnet Napkin — handover

**Working title:** Magnet Napkin  
**Repo:** `magnet-napkin`  
**One line:** Drop a folder of images onto a canvas of a known size, move them around like magnets, leave notes that are clearly notes, and export the layout plus a brief for a vision agent.

This is a napkin sketch that knows its pixels: loose enough to rearrange, exact enough to hand a layout back to a developer — or to an agent with eyes.

---

## 1. Why this exists

Every design task eventually reaches the same moment: you have a folder of assets and you need to see them together at the right proportions before writing any code. Figma is heavier than the job, a whiteboard does not know what 214 pt means, and moving files around in Finder tells you nothing.

Magnet Napkin is the smallest useful tool for that moment:

- drop an asset folder in;
- set the canvas to the real size;
- drag the images around;
- resize with the real aspect ratio locked;
- add text that belongs to the design;
- add notes that explicitly do **not** belong to the design;
- read off exact positions and sizes;
- export a clean PNG, an annotated PNG, a JSON layout and a notes brief.

No accounts. No cloud. No build step. No install.

**The main use is the handoff.** The person laying out the panel is increasingly handing the result to a vision-capable agent: “here is the clean render, here is the exact geometry, and these yellow things are my notes, not part of the image.” Every design choice below serves that moment.

**What it is not:** a design tool, a vector editor, a collaborative whiteboard, a DAM, or a Figma replacement. It is a layout napkin.

---

## 2. What is already proven

A Redline-specific prototype exists at:

```
/Users/ottoparts/Documents/redline copy/PanelBoard/panel-board.html
/Users/ottoparts/Documents/redline copy/PanelBoard/template.html
/Users/ottoparts/Documents/redline copy/PanelBoard/build.py
```

It is a single self-contained HTML file with the Redline cockpit art embedded. It already proves the interaction model:

- tray of real image assets, grouped;
- click to add, drag to move, corner handle to resize with aspect lock;
- rotation handle;
- numeric inspector with X/Y/W/H in board pixels and points;
- grid and a faint tracing underlay;
- z-order, lock, opacity, duplicate/delete;
- keyboard nudging;
- basic plate/lamp text magnets edited in the inspector;
- PNG export at 2x;
- JSON export with positions, sizes, rotation and point values;
- autosave in `localStorage`.

The generic **text box** and **note** tools are new, but the inspector-editing pattern for text is already proven there.

**Read the prototype for the feel. Do not fork its embedded-asset approach.** The generic app must load the user's folder, not carry someone else's art. The prototype is deliberately 4.1 MB because the Redline assets are baked in; the generic app should be a tiny static page.

The Redline art is private/client work. **Do not copy any Redline image, font, or brand asset into the new repo.**

---

## 3. Tech decision: browser, not Rust (for now)

**Recommendation: vanilla HTML + CSS + JavaScript, one static page, no framework, no build step, no backend.**

Why:

- Anyone can use it: open the page, or GitHub Pages link. No install, no signing, no notarisation, no per-platform builds.
- The UI is the hard part, and the browser gives us drag, resize, rotation, inspectors, canvas export and file drop for free.
- It is the fastest thing to iterate on and the easiest thing to give away.
- Assets stay local. No upload, no account, no server cost.
- A single `index.html` (or `index.html` + classic `app.js` + `styles.css`) works by double-click and on GitHub Pages.

### The one browser limitation

Browsers cannot silently watch a folder in the background. That is acceptable for a napkin tool. Handle it in layers:

1. **Drag a folder onto the page** — `DataTransferItem.webkitGetAsEntry()` walks nested folders.
2. **Folder picker fallback** — `<input type="file" webkitdirectory multiple>`.
3. **Chromium nicety** — `showDirectoryPicker()` where available, with the permission handle persisted if practical. Do not require it.
4. **Remember the project** — store the image blobs and the layout in IndexedDB, so reopening the page restores the board without re-dropping.
5. **Portable project file** — `.napkin.json` with canvas, asset metadata and item geometry. Optional “embed images” for a truly portable file; default off to keep it small.

### If native file access becomes essential later

Wrap the same web UI in **Tauri** (Rust shell + system webview). That gives a small native binary, real file dialogs, and optional folder watching, while keeping the UI code. Do not start there.

**Pure Rust GUI is not the simpler option.** With `egui`/`iced` you would rebuild image decoding, drag/resize/rotate, text, file dialogs, export, and packaging, and still ship per-platform binaries. Rust + WASM is still a browser app with extra build steps. For this job, the browser is the lightweight path; Tauri is the escape hatch, not the starting point.

---

## 4. MVP — the whole of it

Ship this and stop:

1. **Open it** — `index.html` from disk or GitHub Pages. No install, no server required for normal use.
2. **Import a folder** — drag/drop a folder or use the picker. Images only (PNG, JPEG, WebP, SVG, GIF). Tray grouped by subfolder, searchable, with thumbnails and dimensions. Ignore non-images.
3. **Canvas** — set width, height, unit (`px`, `pt`, `mm`, `in`) and render scale. Show the size in the chosen unit. Default background is a neutral checker/light grey; optionally a solid colour or an image.
4. **Place** — drag an asset from the tray onto the canvas at the drop point (click-to-centre is a fallback). Place multiple copies of the same asset.
5. **Manipulate** — move, resize with aspect lock on by default, free resize when unlocked, rotate. Numeric inspector for X/Y/W/H in canvas units, rotation, opacity, z-order, lock. Duplicate, delete.
6. **Arrange** — grid, snap (grid + canvas edges/centre + other item edges/centres), visible guides, toggle snapping off. Arrow-key nudge (1 unit; Shift = 10).
7. **Text** — add a text box, type in the inspector, and choose from a short list of safe fonts, a size, weight, colour, alignment and a transparent or solid background. Text is **design content**: it is included in the clean PNG and in the JSON `items` array. Keep it deliberately basic; this is for labels and short headings, not typography.
8. **Notes** — add a note that is explicitly **not** design content. Notes look different on purpose (sticky yellow, dashed border, a small `NOTE` badge), have their own font/colour/background, and live in a separate `notes` array in the JSON. They are **hidden from the clean PNG by default** and shown in the annotated PNG. This is the feature that makes the handoff legible to a vision agent: the annotations cannot be mistaken for the artwork.
9. **Undo/redo** — at least 20 steps. Commit a history entry on pointer-up, not on every pointer-move. Cmd/Ctrl+Z and Shift+Cmd/Ctrl+Z.
10. **Save the project** — autosave layout + asset blobs to IndexedDB. Reopening restores. “New” clears. “Save as” downloads `.napkin.json`; “Open” loads one. Include a “relink assets” path when the project file has no embedded images.
11. **Export** — clean PNG at 1x/2x/3x (notes excluded), annotated PNG at 1x/2x/3x (notes included), and JSON with canvas, assets, items, notes, order and geometry. PNG is drawn from the same item data, not a screenshot.
12. **Agent handoff** — a small handoff panel with four explicit downloads: `layout.png` (clean), `layout-annotated.png` (with notes), `layout.json` (the exact contract) and `notes.md` (human-readable commentary), plus a **Copy handoff** button that puts a compact Markdown brief on the clipboard. The first line of `notes.md` says the clean PNG is the design and the notes are commentary. Browsers block multiple automatic downloads, so make each artifact an explicit button; no server required.
13. **Quality** — no console errors; works in current Chrome, Safari and Firefox; keyboard usable; no network requests after load; README with a screenshot/GIF, quick start, shortcuts and format doc; MIT license.

**MVP means MVP.** No accounts, no cloud, no collaboration, no comments in the Figma sense, no AI generation, no vector editing, no PDF, no mobile-first layout, no analytics, no backend, no npm, no framework unless it is genuinely unavoidable. The notes are static text, not a commenting system.

### Stretch, only after the MVP is solid

- Layers panel with reorder/hide/lock.
- Multi-select, align, distribute, group.
- Simple shape magnets (rectangle, line, callout arrow).
- Note pins/leader lines attached to a specific item.
- SVG export.
- PWA/offline install.
- Tauri wrapper with native folder watching.
- Asset replacement by filename (update every instance).
- Multiple boards/pages per project.
- A read-only local MCP server (see §7) once the export format has settled.

---

## 5. UX shape

```
┌──────────────────────────────────────────────────────────────┐
│ Magnet Napkin  Canvas 214 × 719 pt  2×   Undo Redo          │
│ Import  Save  Open  + Text  + Note  Export PNG  JSON  Handoff│
├───────────────┬──────────────────────────────┬───────────────┤
│ ASSETS        │                              │ INSPECTOR     │
│ [search]      │          CANVAS              │ X / Y / W / H │
│ folder/       │   (rulers, grid, guides)     │ rotation      │
│  ├ image      │                              │ opacity       │
│  ├ image      │                              │ z-order       │
│  └ image      │                              │ lock          │
│               │                              │ font / colour │
└───────────────┴──────────────────────────────┴───────────────┘
```

- Neutral, quiet UI. The canvas is the star; the chrome should not compete with the user's art.
- Light/dark UI is optional; default to a light-grey canvas with a dark UI, or follow the OS.
- Rulers in the chosen unit, origin at top-left, canvas size visible.
- Selected item: outline, corner resize handle, rotation handle, small dimension tag.
- Inspector fields accept typed values and show the unit. This is the precision half of the tool.
- **+ Text** and **+ Note** live in the top toolbar and also in the inspector. Text is design content; a note is deliberately not.
- The inspector for text/notes shows a short font list, size, weight, colour, alignment, background and (for notes) a `NOTE` badge. Keep the list short: `system-ui`, `Georgia`, `Menlo`, `Avenir Next Condensed`, `Helvetica Neue`.
- Export has two PNG choices: **clean** (notes hidden) and **annotated** (notes visible). Default the public/export button to clean; keep the annotated one one click away.
- Tray thumbnails should be small and fast; keep the full image for export.
- Empty state should explain the three steps: import, set canvas, drag — and mention that Text and Note are in the toolbar.

---

## 6. Data model

Store geometry in **canvas units**, not screen pixels. Render at `scale` (e.g. 2×). This is the most important lesson from the Redline prototype, which stored 2× board pixels and had to divide by two everywhere.

```json
{
  "format": "magnet-napkin/v1",
  "name": "GT40 panel",
  "canvas": {
    "width": 214,
    "height": 719,
    "unit": "pt",
    "scale": 2,
    "background": { "type": "color", "value": "#12141a" }
  },
  "assets": [
    {
      "id": "a1",
      "name": "tachometer.png",
      "path": "gauges/tachometer.png",
      "mime": "image/png",
      "width": 600,
      "height": 600,
      "embedded": false
    }
  ],
  "items": [
    {
      "id": "i1",
      "kind": "image",
      "assetId": "a1",
      "x": 32,
      "y": 50,
      "w": 150,
      "h": 150,
      "rotation": 0,
      "opacity": 1,
      "locked": false
    },
    {
      "id": "i2",
      "kind": "text",
      "text": "CHUTE",
      "x": 32,
      "y": 220,
      "w": 60,
      "h": 14,
      "rotation": 0,
      "opacity": 1,
      "locked": false,
      "fontFamily": "Avenir Next Condensed",
      "fontSize": 11,
      "fontWeight": 700,
      "color": "#ededed",
      "background": "transparent",
      "align": "center",
      "autoHeight": true
    }
  ],
  "notes": [
    {
      "id": "n1",
      "text": "This dial is the main tach. Keep 24 pt clearance above the label.",
      "x": 150,
      "y": 40,
      "w": 120,
      "h": 48,
      "targetId": "i1",
      "fontFamily": "system-ui",
      "fontSize": 10,
      "fontWeight": 400,
      "color": "#1c1c1c",
      "background": "#fff3b0",
      "border": "dashed",
      "includeInCleanPNG": false
    }
  ]
}
```

- `items` array order is the z-order (last on top). No separate `z` field is needed; keep it simple.
- `x/y/w/h` are canvas units. `rotation` is degrees clockwise around the item centre.
- `kind` is `image` by default. `text` is design content. Add `shape` later if a simple rectangle/line earns its place.
- `notes` is a **separate array**, never merged into `items`. That separation is the contract with the vision agent.
- Text fields: `fontFamily`, `fontSize`, `fontWeight`, `color`, `background` (`transparent` or a colour), `align` (`left`/`center`/`right`), `autoHeight`. When `autoHeight` is true, `w` is the wrap width and `h` is derived.
- Note fields: the same font/colour fields, plus `background` (default `#fff3b0`), `border` (default `dashed`), `includeInCleanPNG` (default `false`) and optional `targetId`.
- Asset `width/height` are the intrinsic pixels; the UI uses them for the aspect ratio.
- `embedded: true` may carry a `data` field with a data URI; default is off.
- Font names are plain strings. The editor and the PNG exporter use the same family/size/weight; keep a shared text-layout helper so the screen and the export agree. Document a fallback (`system-ui`, `sans-serif`) for machines without the chosen font.

### File format notes

- `.napkin.json` is a normal JSON file. Validate `format`, clamp numbers, ignore unknown fields.
- If assets are not embedded, show “missing assets” and offer relink by filename; do not silently drop items.
- Autosave the whole project to IndexedDB under one key; debounce ~500 ms; never save during a drag.
- `notes` never becomes `items`. Even if a note is positioned over the artwork, it is still commentary and must be exported as such.
- `notes.md` is **derived** from `notes`; it is for humans and vision agents, not a source of truth. The JSON wins.
- The clean PNG defaults to `includeInCleanPNG: false` for every note. The annotated PNG always includes notes. Never make the annotated PNG the default download.

---

## 7. Implementation notes

### Folder import

- Prefer drag/drop with `webkitGetAsEntry()`; recurse directories; collect `File` objects.
- Fallback to `<input type="file" webkitdirectory multiple>`.
- Use `showDirectoryPicker()` only when present; do not block on it.
- Keep the relative path as the asset `path`; group the tray by the first path component.
- Filter by MIME/extension; sort by path; dedupe by path.
- Create thumbnail URLs with `URL.createObjectURL`; revoke on project reset. For large images, consider `createImageBitmap` with a small resize for the tray.
- Store the full `Blob` in IndexedDB (not a data URI) for memory and speed.

### Dragging and resizing

- Pointer events, not mouse events. Set pointer capture on the item.
- Convert client coordinates to canvas coordinates with the canvas rect and scale.
- Drag from the tray: use the drop point, not the canvas centre.
- Resize anchors at the top-left; the opposite corner is the handle. If aspect is locked, derive one dimension from the other.
- Rotation handle above the item; Shift snaps to 15°.
- Clamp to the canvas, but allow a small off-canvas margin if it helps (decide once and document it).
- `requestAnimationFrame` for pointer-move updates if it ever feels heavy; start simple.

### Selection and z-order

- Single selection for MVP; multi-select is stretch.
- Bring-to-front/send-to-back buttons; array order is the source of truth.
- Lock prevents move/resize/rotate but still allows selecting and inspecting.

### Text and notes

- Keep one shared text-layout function. It takes `{ text, fontFamily, fontSize, fontWeight, width, align }` and returns wrapped lines and a height; the DOM uses it for display and the canvas uses it for export. If the two disagree, the PNG is wrong.
- Wrap with `ctx.measureText` on a hidden canvas (or the export canvas). Line height = `fontSize * 1.2`. Respect explicit `\n`.
- **Text is an item.** It participates in z-order, locking, opacity, rotation, duplicate/delete and undo like an image. It is included in the clean PNG.
- **Notes are a separate collection.** They render above items in the editor and the annotated PNG, but they are never in `items`. They have their own z-order via the `notes` array.
- Default text: `system-ui`, 12 canvas units, weight 400, colour `#111` on a light canvas or `#fff` on a dark one. The picker offers `system-ui`, `Georgia`, `Menlo`, `Avenir Next Condensed`, `Helvetica Neue`; a custom family is a stretch.
- Default note: background `#fff3b0`, text `#1c1c1c`, dashed border `#b08900`, 10–12 units, a small `NOTE` badge. It must look like a sticky note, not like a design element.
- Text boxes auto-height: the corner handle changes the wrap width; the height follows the content. This is simpler and avoids clipped text. (Fixed height is stretch.)
- Editing: `+ Text` creates a box and focuses the inspector text field; double-clicking a text/note does the same. Inline contenteditable is stretch, not MVP.
- The note badge and dashed border are drawn in the editor and the annotated PNG. They are not drawn in the clean PNG because the note is not there at all.
- A note may carry an optional `targetId`; MVP does not draw a leader line, but the JSON records the association for the agent.

### Undo/redo

- Snapshot the items array + canvas settings on each committed change (pointer-up, delete, paste, align). A shallow copy is enough if items are plain objects.
- Limit to ~50 entries. Do not snapshot on every pointer-move.
- Undo/redo should also restore selection where practical.

### Snapping and guides

- Snap to 4-unit grid (configurable), canvas edges/centre, and other item edges/centres.
- Show a thin guide line when snapping; hide on release.
- Hold Alt/Option to bypass snapping temporarily.
- Do not over-engineer; a few guides are enough.

### Export PNG

- Create an offscreen `<canvas>` at `canvas.width * scale` × `canvas.height * scale`.
- Draw background (transparent, colour, or image).
- Draw items in array order with `translate` → `rotate` → `translate` → `drawImage`.
- Await image decode; use `imageSmoothingQuality = "high"`.
- `canvas.toBlob` and a download link. Offer 1x/2x/3x.
- PNG export must not include UI, grid, guides, or selection outlines.
- Two export modes: **clean** (skip every note) and **annotated** (draw notes last, including the `NOTE` badge and dashed border). The clean PNG is the default; the annotated PNG is a separate, explicit download.
- Text is drawn with the same font/size/weight/line-height as the editor. Call `document.fonts.ready` before the first export.

### Agent handoff

This is the point of the tool, so make it explicit rather than leaving the user to assemble files.

- **`layout.png`** — clean; the design. No notes, no grid, no UI.
- **`layout-annotated.png`** — the same board with notes visible; for a human review or a vision model that needs the reasoning in place.
- **`layout.json`** — the exact contract: canvas, units, scale, assets, items, notes, order, geometry.
- **`notes.md`** — human-readable commentary, derived from `notes`:

```md
# Handoff — GT40 panel

Canvas: 214 × 719 pt, 2× scale
Design: layout.png — the notes below are NOT part of this image.
Annotated: layout-annotated.png
Contract: layout.json

## Notes
- (x 150, y 40) [tachometer] This dial is the main tach. Keep 24 pt clearance above the label.
- (x 12, y 690) The log drawer is allowed to grow; the panel is not.
```

- A **Handoff** panel with four explicit download buttons and a **Copy handoff** button. Browsers block multiple automatic downloads; do not try to fire four files from one click. The Copy button puts a compact version of the Markdown on the clipboard: canvas size, the clean/annotated distinction and the note list.
- The JSON is the machine contract; the PNG is for the eyes; the Markdown is for the conversation. Keep all three in sync from one source.
- The handoff must never rely on colour alone to distinguish notes: the badge and dashed border carry the meaning too.
- This export shape is already MCP-shaped: an MCP would expose the same `canvas / items / notes` data, not a different model.

### MCP, later

An MCP is a natural fit, but it is not the MVP. The file format is the real interface; once it is stable, a tiny **read-only local MCP** can serve a project folder with tools like:

- `list_boards()`
- `get_board(id)` → canvas, items, notes
- `get_notes(id)` → the notes array
- `get_asset(id)` → metadata (and bytes on request)
- `render_png(id, { annotated })` → path

Why wait: an MCP adds a process, configuration and a security surface, while a `layout.json` + two PNGs already works with any vision-capable agent, any chat window and any file-based workflow. Build the export format first; wrap it later if the live-query convenience is worth it. If it is built, make it read-only and local-only.

### Performance and safety

- DOM-positioned `<img>` elements are fine for a few hundred assets. Do not build a WebGL engine.
- Sanitize text magnets; never `innerHTML` untrusted filenames or text.
- SVG assets loaded via `<img>` do not execute scripts; still avoid inline SVG injection.
- No network calls, no telemetry, no third-party scripts. Keep the “local-only” promise visible in the README.

---

## 8. Suggested repo layout

```
magnet-napkin/
  index.html
  styles.css
  app.js                 # classic script; no modules required
  README.md
  LICENSE                # MIT
  HANDOVER.md            # this file
  docs/
    FORMAT.md            # .napkin.json
    SHORTCUTS.md
    AGENT_HANDOFF.md     # notes.md, clean vs annotated, MCP later
  samples/               # optional, original/CC0 art only
```

- No build step. `index.html` opens directly and works on GitHub Pages from the repo root.
- Classic `<script src="app.js">` works over `file://`; ES modules do not. If you need modules, add a tiny `serve.sh` and document it, but prefer classic scripts for the “double-click” promise.
- `.gitignore`: `.DS_Store`, `node_modules/` (if it ever appears), `dist/`.
- README: one screenshot, one GIF, “drop a folder” in the first sentence, quick start, shortcuts, format, privacy, license.

---

## 9. Definition of done

The MVP is done when all of these are true:

- [ ] A new user can open the page, drag a folder of mixed images in, and see a searchable tray.
- [ ] They can set a 214 × 719 pt canvas at 2× and see rulers in pt.
- [ ] They can drag an asset onto the canvas, move it, resize it with aspect lock, rotate it, and type exact X/Y/W/H.
- [ ] They can send an item to the back/front, lock it, change opacity, duplicate it, delete it, and undo/redo.
- [ ] They can add a text box, pick a font/size/weight/colour/alignment/background, and the text is included in the clean PNG.
- [ ] They can add a note, it looks unmistakably like a note, it is hidden from the clean PNG, and it appears in the annotated PNG.
- [ ] Snapping and guides work, and can be turned off.
- [ ] Reloading restores the project and its images without re-importing.
- [ ] Export clean PNG (1x/2x/3x) looks identical to the canvas minus UI/grid/guides/notes.
- [ ] Export annotated PNG includes the notes with their badge and dashed border.
- [ ] Export/import `.napkin.json` round-trips images, text and notes; missing assets are reported, not silently dropped.
- [ ] `notes.md` lists the notes with positions/units and says the clean PNG is the design.
- [ ] No note is ever merged into `items`, and no note is ever included in the clean PNG.
- [ ] No console errors in current Chrome, Safari, Firefox; no network requests after load.
- [ ] README, LICENSE, FORMAT.md, SHORTCUTS.md, AGENT_HANDOFF.md exist.
- [ ] No Redline assets, fonts, or brand material are in the repo.

---

## 10. First session prompt

Use this as the kickoff, and keep the scope narrow:

> Build **Magnet Napkin** from `HANDOVER.md`. Read the whole handover first. Build the MVP only: folder import, canvas size/units, drag/resize/rotate, inspector, z-order/lock/opacity, keyboard nudge, undo/redo, snapping/guides, **basic text boxes**, **notes that are separate from the design**, IndexedDB autosave, clean and annotated PNG export, JSON project import/export, and the **notes.md handoff**. Vanilla HTML/CSS/JS, no framework, no build step, no backend, no accounts, no cloud. One static page that opens from disk and on GitHub Pages. Stop at the Definition of Done and report what is done and what is deliberately deferred. Do not build an MCP in this session. Do not add stretch features.

A useful first response from the new session: restate the MVP and the Definition of Done in its own words, list the files it will create, then build in that order.

---

## 11. Naming and branding

**Magnet Napkin** is a good working name: it says quick, movable, low-stakes, and it is memorable. The repo slug `magnet-napkin` is clean.

- Tagline options: “A napkin for your assets.” · “Drag your assets like magnets.” · “Rough it out. Nail the proportions.” · “A layout napkin your agent can read.”
- Icon idea: a folded paper corner with a small horseshoe magnet, one colour, simple SVG.
- Alternatives if the name is taken: `Magnet Board`, `Napkin Board`, `Dropboard`, `Fridge`, `Pinboard`.
- Check GitHub/domain availability before committing to the name. Do not buy anything yet.

---

## 12. Open questions

1. Default canvas: a generic 1200 × 800 px, or a unitless “fit the art” canvas?
2. Should the project file embed images by default? (Recommendation: off; offer “embed” on export.)
3. Is multi-select in the MVP, or the first stretch feature? (Recommendation: stretch; single selection is enough for a napkin.)
4. Is SVG import in the MVP? (Recommendation: yes, via `<img>`; no inline SVG editing.)
5. Should the UI be light, dark, or follow the OS? (Recommendation: follow the OS, neutral canvas.)
6. Is a Tauri wrapper wanted later for native folder watching, or is browser-only the goal? (Recommendation: browser first; decide after use.)
7. Note styling: sticky yellow + dashed + `NOTE` badge, or something quieter? (Recommendation: sticky yellow; the whole point is that a vision agent must not confuse a note with the design.)
8. Clean vs annotated PNG: which is the default download? (Recommendation: clean; annotated is a separate, explicit export. The handoff includes both.)
9. Text editing: inspector-only, or inline contenteditable? (Recommendation: inspector-only for the MVP; inline is stretch.)
10. Font list: the five safe families named above, or a free-text family field too? (Recommendation: the short list in the MVP; free text later.)
11. Handoff packaging: four separate files, or one `.zip`? (Recommendation: separate files in the MVP, no zip dependency; a zip bundle is stretch.)
12. MCP: read-only local server later, or never? (Recommendation: later, after the format is stable; the JSON + PNGs are the interface.)

---

## 13. Effort

- **MVP:** roughly one focused day of agent work, or two evenings by hand. Text, notes and the handoff add a couple of hours; they are simple, but the canvas text layout has to match the DOM exactly.
- **Polished public release:** another day for polish, README/GIF, empty states, cross-browser fixes, and a sample project.
- **Tauri wrapper:** a separate half-day, only if native file watching proves necessary.
- **MCP wrapper:** a separate small job after the export format has been used in anger.

The point is to keep it a small, sharp tool. If a feature does not help “drop assets, set a canvas, move them, leave a note, export the layout and the brief”, it belongs in stretch, not the MVP.
