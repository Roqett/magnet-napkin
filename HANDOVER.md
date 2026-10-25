# Magnet Napkin — handover

**Working title:** Magnet Napkin  
**Repo:** `magnet-napkin`  
**One line:** Drop a folder of images onto a canvas of a known size, then move, resize and rotate them like magnets until the layout is right. Export the arrangement.

This is a napkin sketch that knows its pixels: loose enough to rearrange, exact enough to hand a layout back to a developer.

---

## 1. Why this exists

Every design task eventually reaches the same moment: you have a folder of assets and you need to see them together at the right proportions before writing any code. Figma is heavier than the job, a whiteboard does not know what 214 pt means, and moving files around in Finder tells you nothing.

Magnet Napkin is the smallest useful tool for that moment:

- drop an asset folder in;
- set the canvas to the real size;
- drag the images around;
- resize with the real aspect ratio locked;
- read off exact positions and sizes;
- export a PNG and a JSON layout.

No accounts. No cloud. No build step. No install.

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
- PNG export at 2x;
- JSON export with positions, sizes, rotation and point values;
- autosave in `localStorage`.

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
7. **Undo/redo** — at least 20 steps. Commit a history entry on pointer-up, not on every pointer-move. Cmd/Ctrl+Z and Shift+Cmd/Ctrl+Z.
8. **Save the project** — autosave layout + asset blobs to IndexedDB. Reopening restores. “New” clears. “Save as” downloads `.napkin.json`; “Open” loads one. Include a “relink assets” path when the project file has no embedded images.
9. **Export** — PNG at 1x/2x/3x, transparent or background, and JSON with canvas, assets, items, order and geometry. PNG is drawn from the same item data, not a screenshot.
10. **Quality** — no console errors; works in current Chrome, Safari and Firefox; keyboard usable; no network requests after load; README with a screenshot/GIF, quick start, shortcuts and format doc; MIT license.

**MVP means MVP.** No accounts, no cloud, no collaboration, no comments, no AI, no vector editing, no PDF, no mobile-first layout, no analytics, no backend, no npm, no framework unless it is genuinely unavoidable.

### Stretch, only after the MVP is solid

- Layers panel with reorder/hide/lock.
- Multi-select, align, distribute, group.
- Text and simple shape magnets.
- SVG export.
- PWA/offline install.
- Tauri wrapper with native folder watching.
- Asset replacement by filename (update every instance).
- Multiple boards/pages per project.

---

## 5. UX shape

```
┌──────────────────────────────────────────────────────────────┐
│ Magnet Napkin   Canvas 214 × 719 pt  Scale 2×   Undo Redo    │
│ Import folder   Save   Open   Export PNG   Export JSON       │
├───────────────┬──────────────────────────────┬───────────────┤
│ ASSETS        │                              │ INSPECTOR     │
│ [search]      │          CANVAS              │ X / Y / W / H │
│ folder/       │   (rulers, grid, guides)     │ rotation      │
│  ├ image      │                              │ opacity       │
│  ├ image      │                              │ z-order       │
│  └ image      │                              │ lock          │
│               │                              │               │
└───────────────┴──────────────────────────────┴───────────────┘
```

- Neutral, quiet UI. The canvas is the star; the chrome should not compete with the user's art.
- Light/dark UI is optional; default to a light-grey canvas with a dark UI, or follow the OS.
- Rulers in the chosen unit, origin at top-left, canvas size visible.
- Selected item: outline, corner resize handle, rotation handle, small dimension tag.
- Inspector fields accept typed values and show the unit. This is the precision half of the tool.
- Tray thumbnails should be small and fast; keep the full image for export.
- Empty state should explain the three steps: import, set canvas, drag.

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
      "assetId": "a1",
      "x": 32,
      "y": 50,
      "w": 150,
      "h": 150,
      "rotation": 0,
      "opacity": 1,
      "locked": false
    }
  ]
}
```

- `items` array order is the z-order (last on top). No separate `z` field is needed; keep it simple.
- `x/y/w/h` are canvas units. `rotation` is degrees clockwise around the item centre.
- For text/shape magnets (stretch), add `kind` and optional `text`, `fill`, `radius`.
- Asset `width/height` are the intrinsic pixels; the UI uses them for the aspect ratio.
- `embedded: true` may carry a `data` field with a data URI; default is off.

### File format notes

- `.napkin.json` is a normal JSON file. Validate `format`, clamp numbers, ignore unknown fields.
- If assets are not embedded, show “missing assets” and offer relink by filename; do not silently drop items.
- Autosave the whole project to IndexedDB under one key; debounce ~500 ms; never save during a drag.

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
- [ ] Snapping and guides work, and can be turned off.
- [ ] Reloading restores the project and its images without re-importing.
- [ ] Export PNG (1x/2x/3x) looks identical to the canvas minus UI/grid/guides.
- [ ] Export/import `.napkin.json` round-trips the layout; missing assets are reported, not silently dropped.
- [ ] No console errors in current Chrome, Safari, Firefox; no network requests after load.
- [ ] README, LICENSE, FORMAT.md, SHORTCUTS.md exist.
- [ ] No Redline assets, fonts, or brand material are in the repo.

---

## 10. First session prompt

Use this as the kickoff, and keep the scope narrow:

> Build **Magnet Napkin** from `HANDOVER.md`. Read the whole handover first. Build the MVP only: folder import, canvas size/units, drag/resize/rotate, inspector, z-order/lock/opacity, keyboard nudge, undo/redo, snapping/guides, IndexedDB autosave, PNG export and JSON project import/export. Vanilla HTML/CSS/JS, no framework, no build step, no backend, no accounts, no cloud. One static page that opens from disk and on GitHub Pages. Stop at the Definition of Done and report what is done and what is deliberately deferred. Do not add stretch features.

A useful first response from the new session: restate the MVP and the Definition of Done in its own words, list the files it will create, then build in that order.

---

## 11. Naming and branding

**Magnet Napkin** is a good working name: it says quick, movable, low-stakes, and it is memorable. The repo slug `magnet-napkin` is clean.

- Tagline options: “A napkin for your assets.” · “Drag your assets like magnets.” · “Rough it out. Nail the proportions.”
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

---

## 13. Effort

- **MVP:** roughly one focused day of agent work, or two evenings by hand.
- **Polished public release:** another day for polish, README/GIF, empty states, cross-browser fixes, and a sample project.
- **Tauri wrapper:** a separate half-day, only if native file watching proves necessary.

The point is to keep it a small, sharp tool. If a feature does not help “drop assets, set a canvas, move them, export the layout”, it belongs in stretch, not the MVP.
