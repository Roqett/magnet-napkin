# The `.napkin.json` format

A project file is a normal JSON file. It holds the canvas, the assets it refers to, the items on the board and the notes. It is what **Save** downloads and what **Open** reads.

```json
{
  "format": "magnet-napkin/v1",
  "name": "GT40 panel",
  "canvas": {
    "width": 214,
    "height": 719,
    "unit": "pt",
    "scale": 2,
    "background": { "type": "color", "value": "#eef0f3" },
    "underlay": { "assetId": null, "opacity": 0.25 }
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
      "x": 32, "y": 50, "w": 150, "h": 150,
      "rotation": 0,
      "opacity": 1,
      "locked": false
    },
    {
      "id": "i2",
      "kind": "text",
      "text": "CHUTE",
      "x": 32, "y": 220, "w": 60, "h": 14,
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
      "x": 150, "y": 40, "w": 120, "h": 48,
      "rotation": 0,
      "opacity": 1,
      "locked": false,
      "fontFamily": "system-ui",
      "fontSize": 11,
      "fontWeight": 400,
      "color": "#1c1c1c",
      "background": "#fff3b0",
      "border": "dashed",
      "borderColor": "#b08900",
      "align": "left",
      "autoHeight": true,
      "targetId": "i1",
      "includeInCleanPNG": false
    }
  ]
}
```

## The rules

**The format string.** `format` must be `magnet-napkin/v1`. A file with any other value is refused with a clear message rather than half-loaded.

**Geometry is in canvas units.** Never in screen pixels. `x`, `y`, `w` and `h` are in the unit named by `canvas.unit`, so a reader never has to guess the resolution.

**The scale is pixels per unit.** `canvas.scale` is how many pixels one canvas unit is worth. A 214 pt panel at `scale: 2` is a 428 px grid. The export tiers multiply it: tier 1 is 428 px wide, tier 2 is 856 px, tier 3 is 1284 px.

**`items` is the design content.** Array order is the z-order, last on top. There is no separate `z` field.

**`notes` is a separate array and is never merged into `items`.** This is the contract with whatever consumes the file. A note is commentary; it is never artwork. The two arrays stay apart on disk, in the editor and in the export.

**A note never reaches the clean PNG.** `includeInCleanPNG` exists in the format for forward compatibility and is always written as `false`. The clean PNG contains design content only, always.

**`rotation` is degrees clockwise about the item's centre.** `x/y/w/h` are the unrotated box.

**`assets[].width` and `assets[].height` are the intrinsic pixels** of the file. They are used for the aspect ratio and for sizing a newly placed asset.

**`assets[].embedded`** is `true` when the file carries the image itself, in `assets[].data` as a data URI. Saving with images is optional; without them the file stays small and the assets are relinked by name.

**`canvas.background`** is what the board is painted on: `checker`, `color` or `image`. An `image` background names an asset in `assets` by id and is drawn behind everything.

**`canvas.underlay`** is a faint reference image *under* the artwork, for tracing a layout against the real thing: an asset id and an opacity between 0.05 and 1. Like the grid and the guides, it is an editor aid — **it is never drawn into the exported PNG**. `assetId: null` means no underlay.

**View state lives apart from the layout.** The file carries the underlay, but
in the browser the zoom, the grid, the snap, the asset ratio and the underlay
are saved separately from the board. That is deliberate: a view change must
never rewrite the layout, because a tab that is behind might otherwise
overwrite a board it has never seen. See
[AUTOSAVE_AND_RECOVERY.md](AUTOSAVE_AND_RECOVERY.md).

**Unknown fields are ignored.** Numbers out of range are clamped, unknown kinds fall back to `image`, and a missing field takes its default. A file from a newer version still opens.

**`targetId`** on a note is optional. It names the item a note is about, and it shows up in `notes.md` as `[name]`. Nothing is drawn on the canvas for it in this version.

## Text

Text items carry their own font settings, and the same settings drive the screen and the exported PNG:

| Field | Meaning |
|---|---|
| `fontFamily` | one of `system-ui`, `Georgia`, `Menlo`, `Arial Narrow`, `Helvetica Neue` |
| `fontSize` | in canvas units |
| `fontWeight` | 100 to 900 |
| `color` | any CSS colour |
| `background` | `transparent` or a colour |
| `align` | `left`, `center` or `right` |
| `autoHeight` | when true, `h` follows the content and `w` is the wrap width |

The picker only offers faces that exist on macOS, Windows and Linux — `system-ui`, `Georgia`, `Menlo`, `Arial Narrow`, `Helvetica Neue` — so a board made on one machine looks the same on another. A font that is not on the machine falls back to the next family in its stack, and the exported PNG uses the same fallback because it is the same browser.

## Notes

Notes have the same font fields as text, plus:

| Field | Meaning |
|---|---|
| `background` | the paper colour, `#fff3b0` by default |
| `border` | `dashed` by default |
| `borderColor` | `#b08900` by default |
| `targetId` | the item the note is about, if any |

## Project files and handoff files

Both are the same document.

- **Save** (in the toolbar) writes a `.napkin.json` — the project, with a choice of whether to embed the images.
- **Handoff** writes `layout.json` — the same document, without the image bytes, next to the two PNGs and `notes.md`.

So `layout.json` is the contract, and the `.napkin.json` is the contract plus, optionally, the pictures.
