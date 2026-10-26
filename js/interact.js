/* Magnet Napkin — direct manipulation.
   Pointer events, not mouse events. The item's own box is the pointer capture
   target, so a fast drag never outruns the element. */
(function (MN) {
  "use strict";

  const core = MN.core;
  const S = MN.state;
  const state = S.state;

  const MIN_SIZE = 1;
  const ASSET_MIME = "application/x-magnet-napkin-asset";

  let drag = null;

  /* One rule, documented in SHORTCUTS.md: an item's centre always stays on
     the canvas, so half of it may hang off the edge but it can never be
     lost. */
  function clampItem(item) {
    const c = state.canvas;
    item.w = core.clamp(item.w, MIN_SIZE, c.width * 4);
    item.h = core.clamp(item.h, MIN_SIZE, c.height * 4);
    item.x = core.clamp(item.x, -item.w / 2, c.width - item.w / 2);
    item.y = core.clamp(item.y, -item.h / 2, c.height - item.h / 2);
  }

  /* ---------- placement ---------- */

  /* The intrinsic size of an asset expressed in canvas units: its pixels
     divided by the canvas scale (how many pixels one unit is worth). */
  function naturalSize(asset) {
    const s = state.canvas.scale || 1;
    return { w: asset.width / s, h: asset.height / s };
  }

  function placeAsset(asset, x, y) {
    const size = naturalSize(asset);
    const item = S.newImageItem(asset, 0, 0);
    item.w = size.w;
    item.h = size.h;
    item.x = x - size.w / 2;
    item.y = y - size.h / 2;
    clampItem(item);
    state.items.push(item);
    S.commit("place image");
    S.select("item", item.id);
    MN.app.setStatus("Placed " + asset.name + " · " +
      core.fmtNum(item.w, 2) + " × " + core.fmtNum(item.h, 2) + " " +
      MN.units.unitOf(state.canvas.unit).label);
    return item;
  }

  function canvasCentre() {
    const c = state.canvas;
    return { x: c.width / 2, y: c.height / 2 };
  }

  /* ---------- text ---------- */

  function placeText(text) {
    const item = S.newTextItem(text == null ? "Text" : text);
    item.x = (state.canvas.width - item.w) / 2;
    item.y = (state.canvas.height - item.h) / 2;
    MN.items.syncTextHeight(item);
    state.items.push(item);
    S.commit("add text");
    S.select("item", item.id);
    MN.app.setStatus("Text added — type in the inspector.");
    setTimeout(function () { MN.inspector.focusField("text"); }, 0);
    return item;
  }

  /* ---------- dragging ---------- */

  function startDrag(e, item, mode) {
    e.preventDefault();
    e.stopPropagation();
    S.select("item", item.id);
    if (item.locked) {
      MN.app.setStatus("Locked — unlock it in the inspector to move it.");
      return;
    }

    const p = MN.stage.toCanvas(e.clientX, e.clientY);
    drag = {
      id: item.id,
      mode: mode,
      p0: p,
      x0: item.x, y0: item.y, w0: item.w, h0: item.h,
      rot0: item.rotation || 0,
      ratio: MN.items.ratioOf(item),
      centre: { x: item.x + item.w / 2, y: item.y + item.h / 2 },
      angle0: Math.atan2(p.y - (item.y + item.h / 2), p.x - (item.x + item.w / 2)),
    };

    const el = MN.items.elementFor(item.id);
    if (el && el.setPointerCapture) {
      try { el.setPointerCapture(e.pointerId); } catch (err) { /* not capturable */ }
    }
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp, { once: true });
    window.addEventListener("pointercancel", onUp, { once: true });
  }

  function onMove(e) {
    if (!drag) return;
    const item = S.findItem(drag.id);
    if (!item) return;

    const p = MN.stage.toCanvas(e.clientX, e.clientY);

    /* Work in the item's own frame, so a rotated item follows the cursor
       instead of sliding sideways. */
    const rad = -(drag.rot0 || 0) * Math.PI / 180;
    const dx = p.x - drag.p0.x;
    const dy = p.y - drag.p0.y;
    const lx = dx * Math.cos(rad) - dy * Math.sin(rad);
    const ly = dx * Math.sin(rad) + dy * Math.cos(rad);

    if (drag.mode === "move") {
      item.x = drag.x0 + lx;
      item.y = drag.y0 + ly;
    } else if (drag.mode === "resize") {
      if (item.kind === "text" && item.autoHeight) {
        /* A text box resizes by its wrap width; the height follows the text. */
        item.w = Math.max(MIN_SIZE, drag.w0 + lx);
        MN.items.syncTextHeight(item);
      } else {
        let nw = drag.w0 + lx;
        let nh = drag.h0 + ly;
        const ratio = drag.ratio;
        if (state.view.aspect && ratio) {
          /* Whichever edge moved further is the one that drives. */
          if (Math.abs(nw - drag.w0) >= Math.abs(nh - drag.h0)) nh = nw / ratio;
          else nw = nh * ratio;
        }
        item.w = nw;
        item.h = nh;
      }
    } else if (drag.mode === "rotate") {
      const a = Math.atan2(p.y - drag.centre.y, p.x - drag.centre.x);
      let deg = drag.rot0 + (a - drag.angle0) * 180 / Math.PI;
      if (e.shiftKey) deg = Math.round(deg / 15) * 15;
      item.rotation = Math.round(deg * 10) / 10;
    }

    clampItem(item);
    MN.items.updateItem(item);
    MN.inspector.updateValues();
  }

  function onUp() {
    if (!drag) return;
    const mode = drag.mode;
    drag = null;
    window.removeEventListener("pointermove", onMove);
    S.commit(mode);
    MN.inspector.render();
  }

  /* ---------- keyboard ---------- */

  function onKeyDown(e) {
    const tag = (e.target && e.target.tagName || "").toLowerCase();
    if (tag === "input" || tag === "textarea" || tag === "select") return;
    if (e.metaKey || e.ctrlKey || e.altKey) return;

    const item = S.selectedItem();
    if (!item) return;

    if (e.key === "Escape") {
      S.deselect();
      return;
    }
    if (e.key === "Delete" || e.key === "Backspace") {
      e.preventDefault();
      S.removeItem(item.id);
      S.commit("delete item");
      return;
    }
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "d") {
      e.preventDefault();
      const copy = S.duplicateItem(item.id);
      if (copy) {
        S.commit("duplicate item");
        S.select("item", copy.id);
      }
      return;
    }
    if (item.locked) return;

    const step = e.shiftKey ? 10 : 1;
    let handled = true;
    if (e.key === "ArrowLeft") item.x -= step;
    else if (e.key === "ArrowRight") item.x += step;
    else if (e.key === "ArrowUp") item.y -= step;
    else if (e.key === "ArrowDown") item.y += step;
    else handled = false;

    if (handled) {
      e.preventDefault();
      clampItem(item);
      MN.items.updateItem(item);
      MN.inspector.updateValues();
      /* Nudges coalesce: holding the arrow key is one undo step. */
      S.commit("nudge", { coalesce: "nudge" });
    }
  }

  /* ---------- wiring ---------- */

  function wireItemsLayer() {
    const layer = core.$("#items");
    if (!layer) return;

    layer.addEventListener("pointerdown", function (e) {
      const el = e.target.closest ? e.target.closest(".magnet") : null;
      if (!el) return;
      const item = S.findItem(el.dataset.id);
      if (!item) return;
      if (e.target.classList.contains("handle")) startDrag(e, item, "resize");
      else if (e.target.classList.contains("rot")) startDrag(e, item, "rotate");
      else startDrag(e, item, "move");
    });

    layer.addEventListener("dblclick", function (e) {
      const el = e.target.closest ? e.target.closest(".magnet") : null;
      if (!el) return;
      const item = S.findItem(el.dataset.id);
      if (item) MN.inspector.focusField("text");
    });
  }

  function wireBoardSelection() {
    const board = core.$("#board");
    if (!board) return;
    board.addEventListener("pointerdown", function (e) {
      if (e.target.closest && e.target.closest(".magnet")) return;
      S.deselect();
    });
  }

  function wireTray() {
    const tray = core.$("#tray-scroll");
    if (!tray) return;

    tray.addEventListener("click", function (e) {
      const row = e.target.closest ? e.target.closest(".tray-item") : null;
      if (!row) return;
      const asset = S.findAsset(row.dataset.id);
      if (!asset) return;
      placeAsset(asset, canvasCentre().x, canvasCentre().y);
    });

    tray.addEventListener("dragstart", function (e) {
      const row = e.target.closest ? e.target.closest(".tray-item") : null;
      if (!row) return;
      e.dataTransfer.setData(ASSET_MIME, row.dataset.id);
      e.dataTransfer.effectAllowed = "copy";
    });
  }

  function wireDropOnCanvas() {
    const board = core.$("#board");
    if (!board) return;

    board.addEventListener("dragover", function (e) {
      const types = e.dataTransfer && e.dataTransfer.types ? Array.from(e.dataTransfer.types) : [];
      if (types.indexOf(ASSET_MIME) < 0) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = "copy";
    });

    board.addEventListener("drop", function (e) {
      const id = e.dataTransfer && e.dataTransfer.getData ? e.dataTransfer.getData(ASSET_MIME) : "";
      if (!id) return;
      e.preventDefault();
      e.stopPropagation();
      const asset = S.findAsset(id);
      if (!asset) return;
      const p = MN.stage.toCanvas(e.clientX, e.clientY);
      placeAsset(asset, p.x, p.y);
    });
  }

  function boot() {
    wireItemsLayer();
    wireBoardSelection();
    wireTray();
    wireDropOnCanvas();
    document.addEventListener("keydown", onKeyDown);
  }

  MN.interact = {
    placeAsset: placeAsset,
    placeText: placeText,
    clampItem: clampItem,
    naturalSize: naturalSize,
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})(window.MN = window.MN || {});
