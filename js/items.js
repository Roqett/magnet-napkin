/* Magnet Napkin — items on the canvas.
   Each item is a positioned DOM element. Geometry lives in canvas units in
   state; the DOM is just a view of it, recomputed whenever the view zoom or
   the item changes. */
(function (MN) {
  "use strict";

  const core = MN.core;
  const S = MN.state;
  const state = S.state;

  const layer = core.$("#items");
  const els = new Map();

  function ppu() {
    return MN.stage.pxPerUnit();
  }

  function isSelected(id) {
    return !!(state.selection && state.selection.type === "item" && state.selection.id === id);
  }

  function labelFor(item) {
    if (item.kind === "image") {
      const asset = S.findAsset(item.assetId);
      return asset ? asset.name : "Missing image";
    }
    if (item.kind === "text") return item.text || "Text";
    return item.kind;
  }

  function tagText(item) {
    const unit = MN.units.unitOf(state.canvas.unit).label;
    return core.fmtNum(item.w, 2) + " × " + core.fmtNum(item.h, 2) + " " + unit;
  }

  /* The intrinsic aspect ratio of an image item, used by the aspect lock. */
  function ratioOf(item) {
    if (item.kind === "text") return 0;
    const asset = S.findAsset(item.assetId);
    if (asset && asset.height) return asset.width / asset.height;
    return item.h ? item.w / item.h : 0;
  }

  function makeEl(item) {
    const el = core.el("div", {
      class: "magnet" + (item.kind === "text" ? " text-item" : ""),
      dataset: { id: item.id },
      tabindex: "0",
      role: "button",
      "aria-label": labelFor(item),
    });
    if (item.kind === "image") {
      const asset = S.findAsset(item.assetId);
      el.appendChild(core.el("img", { src: asset ? asset.url : "", alt: "", draggable: "false" }));
    } else if (item.kind === "text") {
      el.appendChild(core.el("div", { class: "text-body" }));
    }
    el.appendChild(core.el("div", { class: "handle", title: "Resize" }));
    el.appendChild(core.el("div", { class: "rot", title: "Rotate — hold Shift for 15° steps" }));
    el.appendChild(core.el("div", { class: "tag" }));
    return el;
  }

  /* Draw the text as the layout helper measured it: one element per line, so
     the browser never re-wraps what the exporter will draw. */
  function renderTextBody(el, item, p) {
    const body = el.querySelector(".text-body");
    if (!body) return null;

    const layout = MN.textlayout.layoutText({
      text: item.text,
      fontFamily: item.fontFamily,
      fontSize: item.fontSize,
      fontWeight: item.fontWeight,
      width: item.w,
      align: item.align,
    });

    const key = [item.text, item.fontFamily, item.fontSize, item.fontWeight, item.w, item.align].join("|");
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

  /* Keep an auto-height text box exactly as tall as its content. */
  function syncTextHeight(item) {
    if (!item || item.kind !== "text" || !item.autoHeight) return;
    const layout = MN.textlayout.layoutText({
      text: item.text,
      fontFamily: item.fontFamily,
      fontSize: item.fontSize,
      fontWeight: item.fontWeight,
      width: item.w,
      align: item.align,
    });
    if (Math.abs(layout.height - item.h) > 0.0001) item.h = layout.height;
  }

  function applyStyle(el, item) {
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
    if (item.kind === "text") {
      renderTextBody(el, item, p);
      return;
    }
    const img = el.querySelector("img");
    if (img) {
      const asset = S.findAsset(item.assetId);
      const url = asset ? asset.url : "";
      if (img.getAttribute("src") !== url) img.setAttribute("src", url);
    }
  }

  /* Keyed render: create what is new, drop what is gone, and keep the DOM
     order in step with the array order, which is the z-order. */
  function renderItems() {
    if (!layer) return;
    const seen = new Set();
    for (const item of state.items) {
      seen.add(item.id);
      let el = els.get(item.id);
      if (!el) {
        el = makeEl(item);
        els.set(item.id, el);
      }
      applyStyle(el, item);
      layer.appendChild(el);
    }
    for (const pair of els) {
      if (!seen.has(pair[0])) {
        pair[1].remove();
        els.delete(pair[0]);
      }
    }
  }

  function updateItem(item) {
    const el = els.get(item.id);
    if (el) applyStyle(el, item);
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
    ratioOf: ratioOf,
    tagText: tagText,
    syncTextHeight: syncTextHeight,
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})(window.MN = window.MN || {});
