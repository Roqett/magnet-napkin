/* Magnet Napkin — project state, selection and history.
   The in-memory state is the file format: { canvas, assets, items, notes }.
   There is no translation layer between what the editor holds and what it
   writes, so layout.json is the editor with the view state removed. */
(function (MN) {
  "use strict";

  const core = MN.core;
  const HISTORY_LIMIT = 50;

  const DEFAULT_CANVAS = {
    width: 1200,
    height: 800,
    unit: "px",
    scale: 1,
    /* A flat light grey, so the editor and the exported PNG agree. The
       checker is an editor aid for an empty board and is available here. */
    background: { type: "color", value: "#eef0f3" },
    /* A faint reference image under the artwork, to trace against. It is an
       editor aid and never reaches the exported PNG. */
    underlay: { assetId: null, opacity: 0.25 },
  };

  const state = {
    canvas: core.clone(DEFAULT_CANVAS),
    assets: [],      // { id, name, path, mime, width, height, blob }
    items: [],       // design content. Array order is the z-order, last on top.
    notes: [],       // commentary. Never merged into items.
    selection: null, // { type: "item" | "note", id }
    projectName: "Magnet Napkin board",
    view: {
      zoom: 1, grid: true, snap: true, aspect: true, gridSize: 10,
      /* When the imported files are @2x artwork, a newly placed asset should
         come in at half its pixel size. 1 means the files are @1x. */
      assetScale: 1,
    },
  };

  /* ---------- events ---------- */

  const listeners = Object.create(null);

  function on(event, fn) {
    (listeners[event] || (listeners[event] = [])).push(fn);
    return function () { off(event, fn); };
  }

  function off(event, fn) {
    const list = listeners[event];
    if (!list) return;
    const i = list.indexOf(fn);
    if (i >= 0) list.splice(i, 1);
  }

  function emit(event, payload) {
    const list = listeners[event];
    if (!list) return;
    for (const fn of list.slice()) {
      try {
        fn(payload);
      } catch (err) {
        console.error("Magnet Napkin: listener for \"" + event + "\" failed", err);
      }
    }
  }

  /* ---------- history ----------
     A commit pushes the state as it stands *after* the change. Undo pops the
     last commit and restores the one before it. Pointer moves never commit;
     only pointer-up does, so a drag is a single undo step. */

  const history = { past: [], future: [] };
  let lastCoalesceKey = null;
  let lastCommitAt = 0;

  function snapshot() {
    return {
      canvas: core.clone(state.canvas),
      items: core.clone(state.items),
      notes: core.clone(state.notes),
      selection: state.selection ? core.clone(state.selection) : null,
    };
  }

  function restore(snap) {
    state.canvas = core.clone(snap.canvas);
    state.items = core.clone(snap.items);
    state.notes = core.clone(snap.notes);
    state.selection = snap.selection ? core.clone(snap.selection) : null;
  }

  /* A commit pushes the state as it stands *after* the change. Undo pops the
     last commit and restores the one before it. Pointer moves never commit;
     only pointer-up does, so a drag is a single undo step.

     `coalesce` folds a run of same-key commits (holding an arrow key) into
     one history entry. */
  function commit(label, options) {
    const opts = options || {};
    const now = Date.now();

    if (opts.coalesce && opts.coalesce === lastCoalesceKey && now - lastCommitAt < 700) {
      lastCommitAt = now;
      history.past[history.past.length - 1] = snapshot();
      emit("change", { label: label || "edit" });
      return;
    }

    lastCoalesceKey = opts.coalesce || null;
    lastCommitAt = now;
    history.past.push(snapshot());
    if (history.past.length > HISTORY_LIMIT) history.past.shift();
    history.future.length = 0;
    emit("change", { label: label || "edit" });
  }

  /* The last entry of `past` is always the current state. Undo moves the
     current state to `future` and restores the one before it, so undo can
     reach the state the board started in. */
  function undo() {
    if (history.past.length <= 1) return false;
    history.future.push(history.past.pop());
    restore(history.past[history.past.length - 1]);
    emit("change", { label: "undo" });
    return true;
  }

  function redo() {
    if (!history.future.length) return false;
    const next = history.future.pop();
    history.past.push(next);
    restore(next);
    emit("change", { label: "redo" });
    return true;
  }

  function canUndo() { return history.past.length > 1; }
  function canRedo() { return history.future.length > 0; }

  function resetHistory() {
    history.past = [snapshot()];
    history.future.length = 0;
  }

  /* ---------- selection ---------- */

  function select(type, id) {
    const next = id ? { type: type, id: id } : null;
    const same = (!next && !state.selection) ||
      (next && state.selection && next.type === state.selection.type && next.id === state.selection.id);
    if (same) return;
    state.selection = next;
    emit("selection", next);
  }

  function deselect() { select(null, null); }

  function selectedItem() {
    if (!state.selection || state.selection.type !== "item") return null;
    return state.items.find(function (it) { return it.id === state.selection.id; }) || null;
  }

  function selectedNote() {
    if (!state.selection || state.selection.type !== "note") return null;
    return state.notes.find(function (n) { return n.id === state.selection.id; }) || null;
  }

  /* ---------- item and note helpers ---------- */

  function findItem(id) {
    return state.items.find(function (it) { return it.id === id; }) || null;
  }

  function findNote(id) {
    return state.notes.find(function (n) { return n.id === id; }) || null;
  }

  function findAsset(id) {
    return state.assets.find(function (a) { return a.id === id; }) || null;
  }

  function newTextItem(text) {
    return {
      id: core.uid("i"),
      kind: "text",
      text: text == null ? "Text" : text,
      x: 0, y: 0, w: 120, h: 20,
      rotation: 0, opacity: 1, locked: false,
      fontFamily: "system-ui",
      fontSize: 12,
      fontWeight: 400,
      color: "#111111",
      background: "transparent",
      align: "left",
      autoHeight: true,
    };
  }

  function newNote(text) {
    return {
      id: core.uid("n"),
      kind: "note",
      text: text == null ? "Note" : text,
      x: 0, y: 0, w: 140, h: 48,
      rotation: 0, opacity: 1, locked: false,
      fontFamily: "system-ui",
      fontSize: 11,
      fontWeight: 400,
      color: "#1c1c1c",
      background: "#fff3b0",
      border: "dashed",
      borderColor: "#b08900",
      align: "left",
      autoHeight: true,
      includeInCleanPNG: false,
      targetId: null,
    };
  }

  function newImageItem(asset, x, y) {
    const ratio = asset && asset.height ? asset.width / asset.height : 1;
    const w = asset ? asset.width : 100;
    const h = asset ? asset.height : 100;
    return {
      id: core.uid("i"),
      kind: "image",
      assetId: asset ? asset.id : null,
      x: x || 0, y: y || 0,
      w: w, h: ratio ? h : h,
      rotation: 0, opacity: 1, locked: false,
    };
  }

  function removeItem(id) {
    const i = state.items.findIndex(function (it) { return it.id === id; });
    if (i < 0) return false;
    state.items.splice(i, 1);
    if (state.selection && state.selection.type === "item" && state.selection.id === id) deselect();
    return true;
  }

  function removeNote(id) {
    const i = state.notes.findIndex(function (n) { return n.id === id; });
    if (i < 0) return false;
    state.notes.splice(i, 1);
    if (state.selection && state.selection.type === "note" && state.selection.id === id) deselect();
    return true;
  }

  function duplicateItem(id) {
    const it = findItem(id);
    if (!it) return null;
    const copy = core.clone(it);
    copy.id = core.uid("i");
    copy.x = it.x + 12;
    copy.y = it.y + 12;
    const i = state.items.indexOf(it);
    state.items.splice(i + 1, 0, copy);
    return copy;
  }

  function duplicateNote(id) {
    const n = findNote(id);
    if (!n) return null;
    const copy = core.clone(n);
    copy.id = core.uid("n");
    copy.x = n.x + 12;
    copy.y = n.y + 12;
    const i = state.notes.indexOf(n);
    state.notes.splice(i + 1, 0, copy);
    return copy;
  }

  /* Items and notes each keep their own z-order inside their own array. */
  function collectionOf(id) {
    const i = state.items.findIndex(function (it) { return it.id === id; });
    if (i >= 0) return { list: state.items, index: i };
    const n = state.notes.findIndex(function (nt) { return nt.id === id; });
    if (n >= 0) return { list: state.notes, index: n };
    return null;
  }

  function bringToFront(id) {
    const c = collectionOf(id);
    if (!c || c.index === c.list.length - 1) return false;
    c.list.push(c.list.splice(c.index, 1)[0]);
    return true;
  }

  function sendToBack(id) {
    const c = collectionOf(id);
    if (!c || c.index === 0) return false;
    c.list.unshift(c.list.splice(c.index, 1)[0]);
    return true;
  }

  function removeObject(id) {
    if (removeItem(id)) return true;
    return removeNote(id);
  }

  function duplicateObject(id) {
    const copy = duplicateItem(id);
    if (copy) return { copy: copy, type: "item" };
    const note = duplicateNote(id);
    if (note) return { copy: note, type: "note" };
    return null;
  }

  MN.state = {
    state: state,
    history: history,
    DEFAULT_CANVAS: DEFAULT_CANVAS,
    on: on, off: off, emit: emit,
    commit: commit, undo: undo, redo: redo, canUndo: canUndo, canRedo: canRedo,
    resetHistory: resetHistory, snapshot: snapshot, restore: restore,
    select: select, deselect: deselect, selectedItem: selectedItem, selectedNote: selectedNote,
    findItem: findItem, findNote: findNote, findAsset: findAsset,
    newTextItem: newTextItem, newNote: newNote, newImageItem: newImageItem,
    removeItem: removeItem, removeNote: removeNote, removeObject: removeObject,
    duplicateItem: duplicateItem, duplicateNote: duplicateNote, duplicateObject: duplicateObject,
    bringToFront: bringToFront, sendToBack: sendToBack,
    collectionOf: collectionOf,
  };
})(window.MN = window.MN || {});
