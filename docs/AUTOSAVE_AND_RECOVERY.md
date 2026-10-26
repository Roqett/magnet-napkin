# Autosave and recovery — a requirement, not a nicety

This note exists because a real board was lost.

On 26 October 2026 the Redline PanelBoard — the prototype this app replaces — lost a 34-magnet layout. Three tabs were open. All three shared one `localStorage` key. Each tab autosaved its own in-memory board over the same key. An empty tab saved last. The populated board was gone, and there was no history to restore.

Napkinetic is already better than that prototype: it autosaves the project and its image blobs to IndexedDB. But it uses a single `CURRENT` key, and that is the same failure waiting to happen. This note is the requirement to close it.

## What the current code does

- `js/project.js` writes the document to the `project` store under `CURRENT`, and blobs to `blobs`.
- Autosave is debounced by ~500 ms and skipped while dragging.
- `js/state.js` keeps 50 undo steps in memory.
- A storage warning is shown when IndexedDB is unavailable (`file://`, quota, private mode).
- There is no persistent snapshot history, no cross-tab coordination, and no recovery UI.

That is enough for one tab on one machine. It is not enough for a tool where the board is the work.

## Required behaviour

### 1. Keep versioned snapshots, not only the current document

Add a `history` object store:

```
{ id, at, label, itemCount, noteCount, doc }
```

- Write one entry when an undo commit is made (pointer-up, add/delete, inspector commit), not on every pointer-move.
- Also write a rolling entry at most once every 60 seconds while editing, so a long drag-heavy session still has a checkpoint.
- Cap at 50 entries or a size budget; drop the oldest first.
- Never let history growth block the `CURRENT` save. If the history write fails on quota, trim history and keep the current document.

### 2. Give the user a recovery path

- Add a **History** / **Recover** action that lists entries by time, item count and note count.
- Restoring must be non-destructive: snapshot the current document into history first, then load the chosen entry.
- On boot, if `CURRENT` is missing but history exists, offer the newest entry; do not silently restore it.
- Keep the last known-good `CURRENT` even if a later save fails.

### 3. Guard against the second tab

- Give each tab a random `tabId`.
- Use `BroadcastChannel("napkinetic")` where available, with a `storage`/`visibilitychange` fallback.
- On every successful save, broadcast `{type:"saved", tabId, at, itemCount}`.
- A tab that receives another tab's save must show a notice: “This board was updated in another tab.” Offer **Reload**; do not silently overwrite.
- A tab that has not been edited must not write a layout. Only a user edit or an explicit New/Open should write items.
- If a tab is about to write and the stored document is newer than the version it loaded, stop and ask. Last-writer-wins is acceptable only when the user chooses it.

### 4. Never let an empty board overwrite a populated one

- A save with zero items/notes must not replace a stored document that has content unless the user explicitly chose **New** or **Clear**.
- Show the reason in the status line, not a silent no-op.

### 5. Separate layout from view state

- Zoom, grid, underlay and panel visibility are view state. A view-only save must preserve the stored layout even if this tab's copy is stale.
- Keep view state in its own key/store, or merge it into the stored document without replacing `items`/`notes`.

### 6. Say what happened

- Status line: `Saved 14:32:05`, `Autosave unavailable — Save a .napkin.json`, `Not saved: another tab is newer`.
- The storage warning already exists; keep it visible and specific.

## Acceptance

A two-tab test must pass:

1. Tab A has a populated board.
2. Tab B opens, restores the same board, and is left empty or stale.
3. Tab B changes zoom, then closes or saves.
4. Tab A's board must still be intact.
5. History must contain the populated state and be restorable.
6. Tab A must have seen a cross-tab notice.

Also test: empty-board save, quota failure, reload after a crash, and `file://` with IndexedDB unavailable.

## Why not just “Save often”

Because the failure is not frequency. It is that two writers share one key and neither knows the other exists. Saving more often makes the loss faster.
