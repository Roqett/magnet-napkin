# The smoke test

A plain HTML page that loads the app in an iframe and checks the things that
are easy to break: the text layout agreeing with the DOM, the notes staying
out of the items and out of the clean PNG, undo and redo, snapping, the
document format and the absence of console errors.

It needs no build step, no npm and no test framework. It runs in any browser.

## Running it

```sh
python3 tests/serve.py          # serves the repository on http://127.0.0.1:8124
```

Then open <http://127.0.0.1:8124/tests/smoke.html>. The results appear in the
page and are posted to `tests/result.txt`.

For a headless browser:

```sh
# Chrome or Chromium
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  --headless --screenshot=tests/result.png \
  "http://127.0.0.1:8124/tests/smoke.html"

# Firefox
"/Applications/Firefox.app/Contents/MacOS/firefox" --headless \
  --screenshot=tests/result.png \
  "http://127.0.0.1:8124/tests/smoke.html"

cat tests/result.txt
```

The page holds its own load event open for a few seconds, so a headless
browser does not exit before the results are posted.

## What it checks

| Check | Why |
|---|---|
| the namespace and every module load | a missing script fails silently later |
| the text layout matches the DOM | the screen and the PNG must not disagree |
| the items render | the keyed render must not lose anything |
| a note is never an item | the separation is the contract |
| undo and redo | the history must reach the state before the first change |
| snapping to the canvas centre | the snap engine |
| the clean PNG has no notes | the whole point of two exports |
| the annotated PNG has the notes | and the point of the badge |
| the PNG size follows the scale | the export tier maths |
| `notes.md` says which file is the design | the brief must not mislead |
| the document format | `napkinetic/v1` and the separate arrays |
| IndexedDB is available | autosave needs it |
| no console errors | the gate for every phase |

Last run: all pass in Chrome 152 and Firefox 156, macOS.
