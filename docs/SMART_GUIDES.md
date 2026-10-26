# Smart guides — the missing half: equal spacing

**Status:** alignment guides already exist in `js/snap.js`. This note specifies the
part that is missing: **equal-spacing guides**, the Figma-style behaviour where the
gap to the nearest neighbour on each side snaps equal and the distance is printed on
the guide. It is small, local, and does not change the data model.

The working reference implementation is the Redline `PanelBoard` canvas
(`/Users/ottoparts/Documents/redline copy/PanelBoard/template.html`), functions
`alignmentSnap()`, `spacingSnap()` and the `move` branch of `onMove()`. It was tested
with the cases in §5.

---

## 1. What it does

While an item is being dragged:

1. **Alignment** (already built): edges and centres line up with the canvas edges,
   the canvas centre, and every other item's edges and centres. One guide line per
   axis. Snaps at 6 screen px.
2. **Equal spacing** (this note): consider the nearest neighbour on each side. If the
   two gaps differ by less than a small tolerance, move the item by half the
   difference so both gaps are equal, and draw a measured span in each gap with the
   distance printed.
3. Both kinds of guide appear only while dragging and are cleared on pointer-up.
   Nothing is added to the document, the autosave or the export.

The result the owner asked for: *"they flash appear and then disappear when they're
not needed, and then it snaps to that."*

---

## 2. Rules

**Axis-independent.** X and Y are solved separately. A drag can align on X and
equal-space on Y at the same time.

**Priority per axis.** Alignment → equal spacing → grid. If alignment finds a target
within 6 screen px, use it and do not consider spacing on that axis. If it does not,
try equal spacing. If that finds nothing either, fall back to the grid when
`state.view.snap` is on.

**Neighbours.** For the X axis, a neighbour "counts" when it overlaps the dragged
item vertically by more than 2 canvas units, and lies wholly to one side of it.
- left  = the nearest item whose right edge is at or left of the dragged item's left
- right = the nearest item whose left edge is at or right of the dragged item's right
- Same idea for Y with above/below.

**Tolerance.** The gaps have to be within `2 × 6 = 12` screen pixels of each other
before it snaps. That stops it jumping when the gaps are obviously different. The
snap amount is exactly `(rightGap − leftGap) / 2`.

**Gaps must be positive.** If the boxes overlap, or the "neighbours" are actually
inside the dragged box, skip. A zero gap (touching) is valid.

**Two is the limit.** This handles one gap pair per axis: the item between its
immediate left and right neighbours. A true distribute across three or more objects
is out of scope; it is ambiguous in 2D and rare in a napkin. Do not let scope creep
in here.

**Alt/Option bypasses it**, like the rest of snapping. The existing `e.altKey` guard
in `interact.js` should keep covering it — make sure spacing is skipped too.

**Notes count as neighbours.** `snap.js` already includes `state.notes` in
`others()`. Keep that so a layout behaviour is consistent; notes are not exported but
they are still on the board.

**Rotated items** use their unrotated box, exactly as the current alignment code
does. Do not add rotated-bounds maths for this.

---

## 3. Where it goes

`js/snap.js` is already the right home.

```
spacingSnap(obj, x, y, excludeId)
  → { x: {dx, left, right, gap} | null,
      y: {dy, above, below, gap} | null }
```

- `dx/dy` is the delta to add to the position to equalise the gaps.
- `left/right/above/below` are the neighbour objects, so the caller can draw spans
  from the final geometry (do not bake screen coordinates into the snap result).
- `gap` is the equalised gap, in **canvas units**.

In `snapMove(obj, x, y)`:

- keep `nearest()` for X; if it returns `null`, call `spacingSnap` and use its `dx`;
- repeat for Y (after X is settled, so column detection uses the final x);
- return the spans alongside the existing `guides`, e.g.
  `guides.push({ kind: "span", axis: "x", from, to, value, labelAt })`.

In `renderGuides(guides)`:

- render `kind: "line"` exactly as today (`#guides .guide.v` / `.h`);
- render `kind: "span"` as a 1px line between two points plus a small label chip with
  the value. Use the same gold as the alignment guide.
- label text: the gap in `state.canvas.unit`, rounded to a sensible precision
  (`Math.round` for px/pt; one decimal for mm/in). Keep the unit in the label only if
  the canvas unit is not px.

`interact.js` already receives `snapped.guides` and calls `renderGuides` on every
move and `clearGuides` on pointer-up (`js/interact.js` around lines 161–206). It
needs no structural change beyond what `snapMove` returns.

The existing `#guides` layer in `index.html` is already `pointer-events: none` and
sits above the items; spans and labels can share it.

---

## 4. What not to do

- Do not add a new toggle. `Snap` already gates guide rendering (`state.view.snap`,
  default `true`), and guides are the visible half of snapping.
- Do not persist guides, or include them in the clean or annotated PNG. They are
  chrome, like the grid.
- Do not merge the gap label into the item's text or the notes array.
- Do not snap to the dragged item's own previous position; it is excluded by `id`.
- Do not make the label a DOM node that can capture the pointer.

---

## 5. Acceptance tests

These are the cases used to validate the reference implementation. Use a fixed
canvas of 428 × 1438 (214 × 719 pt at 2×) and plain rectangles.

| # | Setup | Drag to | Expect |
|---|---|---|---|
| 1 | A `(0,0,40,20)`, B `(200,0,40,20)`, C 40×20 | x = 108 | C.x = 100; gaps 60 and 60; two span labels "60" |
| 2 | A `(140,300,150,50)`, B `(140,700,150,50)`, C 150×50 | y = 508 | C.y = 500; gaps 150 and 150; two labels "150" |
| 3 | Same as 1, Alt held | x = 108 | no snap, no guides |
| 4 | A left of C only | any | no spans (needs both neighbours) |
| 5 | Same as 1, release | — | `#guides` is empty and hidden |
| 6 | A `(0,0,40,20)`, C dragged so C.x = 197, B's left edge at 200 | — | alignment wins: one line at 200, no spans |
| 7 | C overlaps B | — | no negative gaps, no spans |
| 8 | Zoom 50% and 200% | same cases | snap distance stays ~6 screen px, not 6 units |

Test 6 matters most: the priority rule is what stops the two systems fighting.

---

## 6. Reference implementation notes

In the PanelBoard version the whole thing is three small functions:

- `alignmentSnap(item, nx, ny)` → best `{delta, value}` per axis, threshold `6 / zoom`
- `spacingSnap(item, nx, ny)` → `{x, y}` gap candidates, tolerance `10 / zoom` for the
  comparison, `(gr - gl) / 2` for the delta
- the `move` branch draws an alignment line for a matched axis, or spans plus labels
  for a matched gap pair, then clamps and re-reads the final position.

The only subtlety worth copying: compute the span geometry **after** the snap and
clamp from the item's final `x/y`, not from the candidate position. Otherwise the
label and the item disagree by a pixel or two at the canvas edge.

---

## 7. Why this is the right size

The tool is a napkin: drop art, set the real proportions, move it, write the numbers
down. Alignment and equal spacing are the two things a hand layout needs and a
spreadsheet cannot give. Everything beyond that — distribute across many objects,
rotation snapping, constraint systems — belongs to a different tool.

The owner's line to hold onto: *"most landing pages are pretty much just text and some
funky graphics, and most of it you're actually coding — sometimes you want to put the
proportions that you want rather than leaving it up to the taste of the agent."*
Equal spacing is what makes a row of placeholder boxes read as a decision rather than
an accident.
