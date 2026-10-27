# The twenty-minute pressure test

One sitting, on a timer, against the real thing. It exists because the
automated suite is 62 checks that all run in synthetic pointer events, in two
browsers, on a small board. That proves the logic. It does not prove that a
designer on a MacBook Air with 300 photographs can use it.

Twenty minutes, on the clock. When the clock runs out, stop — the blocks you
did not reach are known gaps, not passes.

**Before the clock starts**

- **The browser you use**, and **Safari**. Both, or block 3 is skipped.
- **A real folder of assets.** This is the point of the exercise: a few hundred
  files, several at 4000 px or more, a mix of PNG, JPEG, WebP, SVG and GIF, and
  one file that is not an image (a `.txt`) to see it get skipped.
- **A throwaway board.** Do not run this on the layout you care about.
- Pen and paper, or a note app. Not the app.

One rule for the whole run: **test it as a stranger, not as its author.** If
something needs you to know how it works, that is a finding. Do not fix
anything mid-run. Do not rescue it.

---

## Block 1 — First contact · 3 min

A new window, nothing cached.

1. Open `https://roqett.github.io/napkinetic/`. **Do not touch anything for five
   seconds.** Is the welcome text whole? Is it obvious what to do first?
2. **Import folder…** with the big folder on it. Start a timer.
3. Drag one of the large images onto the canvas.

**Should:** open fitted to the whole board; the import completes and the tray
fills; dragging a 4000 px asset is smooth enough to place it precisely.

**Note:** import time in seconds, and whether dragging large assets stuttered.

---

## Block 2 — The real job · 5 min

1. Set the canvas to a real size: **214 × 719 pt**, scale **2**.
2. Place about eight assets. Use an alignment guide and equal spacing at least
   twice.
3. Add two notes and one text box.
4. **Handoff**, then **PNG** at 3×.

**Should:** the guides snap and the distance labels read sensibly; the clean
PNG has no notes; the annotated one does; `layout.json` numbers match the
inspector; the 3× PNG is roughly 1284 × 4314 px; no console errors.

**Note:** anything you had to work out rather than being told.

---

## Block 3 — The other browser · 4 min

This is the one I would bet money on finding something.

1. Open the same address in **Safari**.
2. **Expect an empty board. That is correct, not a bug** — different browser,
   different storage. Now press **History**: it should be empty too.
3. **Open** the `.napkin.json` you saved in block 2. Everything, including
   images, should come back.
4. Change something in Safari, **Save**, then open that file in Chrome.

**Should:** the file moves between browsers intact; the glass panels render;
the symbol library appears; dropping a folder works (Safari takes a different
code path — `webkitGetAsEntry`); no console errors.

**Note:** anything that renders differently, and whether folder drop worked.

---

## Block 4 — What a stranger does · 4 min

Deliberately clumsy. Each of these should be survivable.

1. Reload **while dragging** an item.
2. Two tabs open. Move something in each. Watch for the conflict banner — it
   should stop one of them rather than let the last save win.
3. Press **New** with a board on screen, confirm, then **History** → restore it.
4. Import a `.json` through the image importer, and an image through **Open**.
5. Drop a folder with a `.txt` and a `.heic` in it.
6. Make a 12000 × 12000 image and import it.

**Should:** nothing crashes; nothing is lost silently; each refusal says what
it refused and why (the huge image says "too large to lay out").

---

## Block 5 — Fingers crossed · 2 min

1. Move something in Safari and quit it (⌘Q) **immediately**, mid-save.
2. Reopen. You should get the new position or the previous one. **Never a blank
   board.**
3. If you have an iPad or a phone to hand, just load it and try to place one
   thing. Touch has never been tested.

---

## What counts as a pass

No data loss. No crash. No console error. Nothing that needed explaining to
yourself.

## When something fails

Do not fix it. Write down: **what you did, what you expected, what happened,
browser and version**, and a screenshot. That is a complete bug report; the
rest is guesswork.

## Known and expected — do not report these

| Behaviour | Why |
|---|---|
| Empty board in a second browser | Storage is per browser. This is the app's most confusing correct behaviour. |
| No autosave when opened by double-clicking `index.html` | Chrome blocks IndexedDB on `file://`. Use `./serve.sh` or the hosted site. |
| Notes missing from the clean PNG | The whole point of two exports. |
| A low zoom percentage on first load | It fits the board to your window. |
| The board is a stale version in a third tab | The second-tab guard is meant to stop, not merge. |

## Results

| Block | Pass / Fail | What happened |
|---|---|---|
| 1 — First contact | | |
| 2 — The real job | | |
| 3 — The other browser | | |
| 4 — What a stranger does | | |
| 5 — Fingers crossed | | |

Anything that failed goes to
[the issues](https://github.com/Roqett/napkinetic/issues), or into a
`PRESSURE_TEST_RESULTS.md` next to this file if you would rather keep it local.
