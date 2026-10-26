# The agent handoff

This is the point of the tool. The person arranging the panel is increasingly handing the result to a vision-capable agent, and the agent has to be able to tell the design from the reasoning about the design.

The Handoff button produces four files. One click each — browsers block multiple automatic downloads, so nothing is fired behind your back.

## The four files

| File | What it is | Use it for |
|---|---|---|
| `layout.png` | the clean design | the image. The artwork, and only the artwork. |
| `layout-annotated.png` | the same board with the notes on top | showing a human, or a model, where the notes are |
| `layout.json` | the exact contract | the geometry. Canvas, units, assets, items, notes, order. |
| `notes.md` | the brief | the conversation. What was decided and why. |

The PNGs come out at 1×, 2× or 3× the canvas scale. The size is shown in the Handoff panel before you click anything.

## Clean and annotated: why there are two

A note is commentary. If commentary ends up mixed into the design render, every consumer of that render — a developer, a rendering pipeline, a model — has to guess which parts are real. That guess is the expensive part, so the tool removes it.

- **`layout.png` never contains a note.** Not by default, not ever. The `includeInCleanPNG` flag exists in the file format for forward compatibility and is always written as `false`.
- **`layout-annotated.png` always contains the notes**, drawn last, on top, in their sticky colours with their dashed border and their `NOTE` badge.

The badge and the border are there so the distinction survives without colour. A vision model that cannot see yellow still sees a dashed rectangle with a `NOTE` chip in the corner, which does not look like artwork.

Text is different: text is design content. It sits in `items`, it has a z-order, it is in the clean PNG, and it is in the JSON.

## The JSON is the contract

`layout.json` is the source of truth. The PNGs and the Markdown are derived from it, so they cannot drift apart.

Read it like this:

- `canvas` — the size, the unit and the scale. Every number in `items` and `notes` is in that unit.
- `assets` — the files the items refer to, with their intrinsic pixel sizes and their paths.
- `items` — the design content, in z-order, last on top.
- `notes` — the commentary, in its own array. Never inside `items`.

The full field-by-field description is in [FORMAT.md](FORMAT.md).

## The brief

`notes.md` is derived from `notes` and says who is who:

```md
# Handoff — GT40 panel

**layout.png is the design. The notes below are commentary and are not part of it.**

- Canvas: 214 × 719 pt, 2 px per unit
- Design: `layout.png` — the clean render, no notes, no grid, no selection
- Annotated: `layout-annotated.png` — the same board with the notes visible
- Contract: `layout.json` — the exact geometry, in canvas units
- Items: 12 · Notes: 3

## Notes

- (x 150, y 40 pt) [tachometer] This dial is the main tach. Keep 24 pt clearance above the label.
- (x 12, y 690 pt) The log drawer is allowed to grow; the panel is not.
```

The bracketed name is the item a note is about, when it has one. **Copy handoff** puts a compact version of the same thing on the clipboard.

## Giving it to an agent

The useful pattern, in order:

1. **`layout.png`** — "here is the design, and here is exactly what it should look like."
2. **`layout.json`** — "here is every element, in canvas units, with its position, size, rotation, opacity and z-order."
3. **`notes.md`** — "here is what I decided, and what to watch out for."

Send the annotated PNG as well when the agent needs to know *where* the reasoning sits. Do not send it when the agent is rendering, because that is exactly the confusion the two files exist to prevent.

A note's coordinates in `notes.md` are the same coordinates as in `layout.json`, so a note at `x 150, y 40 pt` is the note whose box starts at 150, 40 in the clean PNG.

## Later: a local MCP server

The export format is already the interface. Anything that can read a directory can read a project: `layout.json` next to two PNGs works with any vision-capable model, any chat window and any file-based workflow.

If that turns out to be inconvenient — say, an agent that wants to query the board without the files being copied around — the natural next step is a small **read-only local MCP server** exposing the same data:

```
list_boards()          → the projects in a folder
get_board(id)          → canvas, items, notes
get_notes(id)          → the notes array
get_asset(id)          → metadata, and bytes on request
render_png(id, { annotated }) → a path
```

That is a separate job, on purpose. It adds a process, a configuration and a security surface, and it must not change the format. The format comes first; the wrapper comes after, if it is worth it.
