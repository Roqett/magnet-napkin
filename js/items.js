/* Magnet Napkin — items and notes on the canvas.
   Both are positioned DOM elements with the same handles. Items are design
   content and live in the items layer; notes are commentary and live in the
   notes layer, above everything. They are never merged. */
(function (MN) {
  "use strict";

  const core = MN.core;
  const S = MN.state;
  const state = S.state;

  const itemsLayer = core.$("#items");
  const notesLayer = core.$("#notes");

  /* Note chrome, in canvas units, so the editor and the exported PNG agree.
     The border is in units too: a CSS border would stay one screen pixel at
     any zoom and the note's text would be clipped by a different amount in
     the editor than in the export. */
  const NOTE = {
    pad: 6,
    borderWidth: 1,
    badgeW: 26,
    badgeH: 11,
    badgeFont: 8,
    badgeText: "NOTE",
  };

  const els = new Map();

  function ppu() {
    return MN.stage.pxPerUnit();
  }

  function isSelected(id) {
    return !!(state.selection && state.selection.id === id);
  }

  /* The plain name, for the inspector and the notes brief. */
  function nameFor(item) {
    if (item.kind === "image") {
      const asset = S.findAsset(item.assetId);
      return asset ? asset.name : "Missing image";
    }
    if (item.kind === "text") return item.text || "Text";
    if (item.kind === "note") return "Note";
    return item.kind;
  }

  /* The accessible name. It has to contain the visible text of the element,
     so the whole text of a text box or a note is used, not a summary. */
  function labelFor(item) {
    if (item.kind === "image") {
      const asset = S.findAsset(item.assetId);
      return "Image: " + (asset ? asset.name : "missing file");
    }
    if (item.kind === "text") return "Text: " + (item.text || "empty");
    if (item.kind === "note") return "Note: " + ((item.text || "empty").replace(/\s+/g, " ").trim());
    return item.kind;
  }

  function tagText(item) {
    const unit = MN.units.unitOf(state.canvas.unit).label;
    return core.fmtNum(item.w, 2) + " × " + core.fmtNum(item.h, 2) + " " + unit;
  }

  /* The intrinsic aspect ratio of an image item, used by the aspect lock. */
  function ratioOf(item) {
    if (item.kind !== "image") return 0;
    const asset = S.findAsset(item.assetId);
    if (asset && asset.height) return asset.width / asset.height;
    return item.h ? item.w / item.h : 0;
  }

  /* The width the text of a box may occupy. Notes keep a margin inside
     their border. */
  function textWidthOf(item) {
    return item.kind === "note" ? Math.max(1, item.w - NOTE.pad * 2) : Math.max(0, item.w);
  }

  function layoutOf(item) {
    return MN.textlayout.layoutText({
      text: item.text,
      fontFamily: item.fontFamily,
      fontSize: item.fontSize,
      fontWeight: item.fontWeight,
      width: textWidthOf(item),
      align: item.align || "left",
    });
  }

  function makeEl(item, isNote) {
    const el = core.el("div", {
      class: "magnet" + (isNote ? " note" : item.kind === "text" ? " text-item" : ""),
      dataset: { id: item.id },
      tabindex: "0",
      role: "button",
      "aria-label": labelFor(item),
    });
    if (item.kind === "image") {
      const asset = S.findAsset(item.assetId);
      if (asset && asset.url) {
        el.appendChild(core.el("img", { src: asset.url, alt: "", draggable: "false" }));
      } else {
        /* The file is not here. Say so instead of showing nothing. */
        el.appendChild(core.el("div", { class: "missing-asset", text: asset ? asset.name : "Missing image" }));
      }
    } else {
      el.appendChild(core.el("div", { class: "text-body" }));
    }
    if (isNote) el.appendChild(core.el("div", { class: "badge", text: NOTE.badgeText, "aria-hidden": "true" }));
    el.appendChild(core.el("div", { class: "handle", title: "Resize", "aria-hidden": "true" }));
    el.appendChild(core.el("div", { class: "rot", title: "Rotate — hold Shift for 15° steps", "aria-hidden": "true" }));
    /* The dimension tag repeats what the inspector already says, so it is
       decoration for the eye and not part of the accessible name. */
    el.appendChild(core.el("div", { class: "tag", "aria-hidden": "true" }));

    /* Focusing an object selects it, so the arrow keys nudge whatever the
       keyboard has landed on. */
    el.addEventListener("focus", function () {
      S.select(isNote ? "note" : "item", item.id);
    });
    return el;
  }

  /* Draw the text as the layout helper measured it: one element per line, so
     the browser never re-wraps what the exporter will draw. */
  function renderTextBody(el, item, p) {
    const body = el.querySelector(".text-body");
    if (!body) return null;

    const layout = layoutOf(item);
    const key = [item.text, item.fontFamily, item.fontSize, item.fontWeight, textWidthOf(item), item.align].join("|");
    if (body._key !== key) {
      body._key = key;
      body.textContent = "";
      for (const line of layout.lines) {
        body.appendChild(core.el("div", { class: "tl", text: line.text }));
      }
      body.style.fontFamily = layout.fontStack;
      body.style.fontSize = layout.fontSize * p + "px";
      body.style.lineHeight = layout.lineHeight * p + "px";
      body.style.fontWeight = layout.fontWeight;
      body.style.textAlign = layout.align;
    }

    body.style.background = (item.background && item.background !== "transparent")
      ? item.background
      : "transparent";
    body.style.color = item.color || "#111111";

    return layout;
  }

  /* Keep an auto-height text box exactly as tall as its content. A note has
     a margin inside its border, so the box is that much taller again. */
  function syncTextHeight(item) {
    if (!item || item.kind === "image" || !item.autoHeight) return;
    const layout = layoutOf(item);
    const chrome = item.kind === "note" ? NOTE.pad * 2 + NOTE.borderWidth * 2 : 0;
    const height = layout.height + chrome;
    if (Math.abs(height - item.h) > 0.0001) item.h = height;
  }

  function applyStyle(el, item, isNote) {
    const p = ppu();
    el.style.left = item.x * p + "px";
    el.style.top = item.y * p + "px";
    el.style.width = item.w * p + "px";
    el.style.height = item.h * p + "px";
    el.style.transform = "rotate(" + (item.rotation || 0) + "deg)";
    el.style.opacity = item.opacity == null ? 1 : item.opacity;
    el.classList.toggle("locked", !!item.locked);
    el.classList.toggle("selected", isSelected(item.id));
    const tag = el.querySelector(".tag");
    if (tag) tag.textContent = tagText(item);

    if (isNote) {
      const body = el.querySelector(".text-body");
      if (body) {
        body.style.inset = NOTE.pad * p + "px";
        body.style.background = item.background || "#fff3b0";
        body.style.color = item.color || "#1c1c1c";
      }
      el.style.background = item.background || "#fff3b0";
      el.style.borderColor = item.borderColor || "#b08900";
      el.style.borderWidth = NOTE.borderWidth * p + "px";
      const badge = el.querySelector(".badge");
      if (badge) {
        badge.style.width = NOTE.badgeW * p + "px";
        badge.style.height = NOTE.badgeH * p + "px";
        badge.style.fontSize = NOTE.badgeFont * p + "px";
        badge.style.top = (-NOTE.badgeH - 1) * p + "px";
        badge.style.left = -2 * p + "px";
      }
    }

    if (item.kind === "image") {
      const asset = S.findAsset(item.assetId);
      const url = asset ? asset.url : "";
      const img = el.querySelector("img");
      const placeholder = el.querySelector(".missing-asset");
      if (url && !img) {
        /* The asset turned up after being opened from a project file. */
        if (placeholder) placeholder.remove();
        el.insertBefore(core.el("img", { src: url, alt: "", draggable: "false" }), el.firstChild);
      } else if (!url && img) {
        img.remove();
        el.insertBefore(core.el("div", {
          class: "missing-asset",
          text: asset ? asset.name : "Missing image",
        }), el.firstChild);
      } else if (img && img.getAttribute("src") !== url) {
        img.setAttribute("src", url);
      }
      return;
    }
    renderTextBody(el, item, p);
  }

  /* Keyed render: create what is new, drop what is gone, and keep the DOM
     order in step with the array order, which is the z-order.

     Elements are only moved when their position actually changed. Moving an
     element that has focus would blur it and break keyboard navigation. */
  function renderLayer(collection, layer, isNote) {
    if (!layer) return;
    let index = 0;
    for (const item of collection) {
      let el = els.get(item.id);
      if (!el) {
        el = makeEl(item, isNote);
        els.set(item.id, el);
      }
      applyStyle(el, item, isNote);
      const current = layer.children[index];
      if (current !== el) layer.insertBefore(el, current || null);
      index += 1;
    }
    while (layer.children.length > index) {
      const el = layer.lastElementChild;
      els.delete(el.dataset.id);
      layer.removeChild(el);
    }
  }

  function renderItems() {
    renderLayer(state.items, itemsLayer, false);
    renderLayer(state.notes, notesLayer, true);
  }

  function updateItem(item) {
    const el = els.get(item.id);
    if (el) applyStyle(el, item, S.findNote(item.id) !== null);
  }

  function elementFor(id) {
    return els.get(id) || null;
  }

  function boot() {
    renderItems();
    S.on("change", renderItems);
    S.on("selection", renderItems);
    S.on("view", renderItems);
  }

  MN.items = {
    renderItems: renderItems,
    updateItem: updateItem,
    elementFor: elementFor,
    labelFor: labelFor,
    nameFor: nameFor,
    ratioOf: ratioOf,
    tagText: tagText,
    syncTextHeight: syncTextHeight,
    layoutOf: layoutOf,
    textWidthOf: textWidthOf,
    NOTE: NOTE,
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})(window.MN = window.MN || {});
