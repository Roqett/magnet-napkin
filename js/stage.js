/* Napkinetic — the stage.
   Owns the board's on-screen size, the rulers, the grid, the background and
   the view transform. Everything here is in screen pixels; the geometry in
   state is always in canvas units. */
(function (MN) {
  "use strict";

  const core = MN.core;
  const S = MN.state;
  const state = S.state;

  const boardEl = core.$("#board");
  const gridEl = core.$("#grid");
  const bgEl = core.$("#bg");
  const underlayEl = core.$("#underlay");
  const rulerTop = core.$("#ruler-top");
  const rulerLeft = core.$("#ruler-left");
  const cornerEl = core.$("#ruler-corner");
  const viewportEl = core.$("#viewport");
  const zoomLabel = core.$("#zoomlabel");

  const MIN_ZOOM = 0.1;
  const MAX_ZOOM = 8;

  /* Pixels per canvas unit on screen: the canvas scale times the view zoom. */
  function pxPerUnit() {
    return state.canvas.scale * state.view.zoom;
  }

  /* Client coordinates to canvas units. */
  function toCanvas(clientX, clientY) {
    const rect = boardEl.getBoundingClientRect();
    const ppu = pxPerUnit();
    return {
      x: (clientX - rect.left) / ppu,
      y: (clientY - rect.top) / ppu,
    };
  }

  /* Canvas units to client coordinates. */
  function toClient(x, y) {
    const rect = boardEl.getBoundingClientRect();
    const ppu = pxPerUnit();
    return {
      x: rect.left + x * ppu,
      y: rect.top + y * ppu,
    };
  }

  /* ---------- zoom ---------- */

  function setZoom(zoom, anchor) {
    const next = core.clamp(zoom, MIN_ZOOM, MAX_ZOOM);
    if (next === state.view.zoom) return;
    const previous = state.view.zoom;
    if (anchor) {
      /* Keep the point under the cursor still. */
      const rect = boardEl.getBoundingClientRect();
      const before = {
        x: (anchor.x - rect.left) / (state.canvas.scale * previous),
        y: (anchor.y - rect.top) / (state.canvas.scale * previous),
      };
      state.view.zoom = next;
      const rect2 = boardEl.getBoundingClientRect();
      const ppu = state.canvas.scale * next;
      viewportEl.scrollLeft += (rect2.left + before.x * ppu) - anchor.x;
      viewportEl.scrollTop += (rect2.top + before.y * ppu) - anchor.y;
    } else {
      state.view.zoom = next;
    }
    /* The zoom is view state: it is saved on its own, never as part of the
       layout. */
    if (MN.project && MN.project.touchView) MN.project.touchView();
    applyView();
  }

  function zoomBy(factor, anchor) {
    setZoom(state.view.zoom * factor, anchor);
  }

  function zoomIn(anchor) { zoomBy(1.25, anchor); }
  function zoomOut(anchor) { zoomBy(0.8, anchor); }

  function fit() {
    const c = state.canvas;
    const availW = viewportEl.clientWidth - 48;
    const availH = viewportEl.clientHeight - 72;
    if (availW <= 0 || availH <= 0) return;
    const zoom = Math.min(availW / (c.width * c.scale), availH / (c.height * c.scale));
    state.view.zoom = core.clamp(zoom, MIN_ZOOM, MAX_ZOOM);
    applyView();
  }

  /* ---------- background ---------- */

  function applyBackground() {
    const bg = state.canvas.background || { type: "checker", value: "#eef0f3" };
    /* Clear the inline background first: the shorthand resets background-image
       as well, so order matters here. */
    bgEl.style.background = "";
    bgEl.className = "";

    if (bg.type === "color") {
      bgEl.style.background = bg.value || "#eef0f3";
      return;
    }
    if (bg.type === "image") {
      const asset = S.findAsset(bg.value);
      if (asset && asset.url) {
        bgEl.style.backgroundImage = "url(\"" + asset.url + "\")";
        bgEl.style.backgroundSize = "100% 100%";
        bgEl.style.backgroundRepeat = "no-repeat";
        return;
      }
    }
    bgEl.className = "checker";
  }

  /* A faint tracing of a reference image, under the artwork. It helps you
     place things against the real thing. Like the grid and the guides, it is
     an editor aid: it is never drawn into the exported PNG. */
  function applyUnderlay() {
    const underlay = state.canvas.underlay || { assetId: null, opacity: 0.25 };
    const asset = underlay.assetId ? S.findAsset(underlay.assetId) : null;
    if (!asset || !asset.url) {
      underlayEl.style.backgroundImage = "";
      underlayEl.style.opacity = "0";
      return;
    }
    underlayEl.style.backgroundImage = "url(\"" + asset.url + "\")";
    underlayEl.style.backgroundSize = "100% 100%";
    underlayEl.style.backgroundRepeat = "no-repeat";
    underlayEl.style.opacity = String(underlay.opacity == null ? 0.25 : underlay.opacity);
  }

  /* ---------- rulers ---------- */

  function clear(node) {
    while (node.firstChild) node.removeChild(node.firstChild);
  }

  function rulerTicks(ppu, span) {
    /* One "nice" step in canvas units, so the labels stay readable. */
    const step = MN.units.tickStep(state.canvas.unit, ppu);
    const minor = step / 5;
    const minorPx = minor * ppu;
    const useMinor = minorPx >= 7;
    const ticks = [];
    for (let v = 0; v <= span + step * 0.001; v += useMinor ? minor : step) {
      ticks.push({ value: v, major: Math.abs(v / step - Math.round(v / step)) < 1e-6 });
    }
    return { ticks: ticks, step: step };
  }

  function renderTopRuler(ppu) {
    clear(rulerTop);
    const widthPx = state.canvas.width * ppu;
    rulerTop.style.width = widthPx + "px";
    const info = rulerTicks(ppu, state.canvas.width);
    for (const tick of info.ticks) {
      const x = tick.value * ppu;
      if (x > widthPx + 1) break;
      const line = core.el("div", { class: tick.major ? "tick major" : "tick" });
      line.style.left = x + "px";
      rulerTop.appendChild(line);
      if (tick.major) {
        const label = core.el("div", { class: "tick-label", text: MN.core.fmtNum(tick.value, 2) });
        label.style.left = x + "px";
        rulerTop.appendChild(label);
      }
    }
  }

  function renderLeftRuler(ppu) {
    clear(rulerLeft);
    const heightPx = state.canvas.height * ppu;
    rulerLeft.style.height = heightPx + "px";
    const info = rulerTicks(ppu, state.canvas.height);
    for (const tick of info.ticks) {
      const y = tick.value * ppu;
      if (y > heightPx + 1) break;
      const line = core.el("div", { class: tick.major ? "tick major" : "tick" });
      line.style.top = y + "px";
      rulerLeft.appendChild(line);
      if (tick.major) {
        const label = core.el("div", { class: "tick-label", text: MN.core.fmtNum(tick.value, 2) });
        label.style.top = y + "px";
        rulerLeft.appendChild(label);
      }
    }
  }

  function renderRulers(ppu) {
    renderTopRuler(ppu);
    renderLeftRuler(ppu);
    cornerEl.textContent = MN.units.unitOf(state.canvas.unit).label;
    cornerEl.className = "unit-label";
  }

  /* ---------- pan ---------- */

  function wirePan() {
    let panning = null;
    let spaceHeld = false;

    document.addEventListener("keydown", function (e) {
      if (e.code === "Space" && !spaceHeld) {
        const tag = (e.target && e.target.tagName || "").toLowerCase();
        if (tag === "input" || tag === "textarea" || tag === "select") return;
        spaceHeld = true;
        viewportEl.classList.add("pannable");
      }
    });
    document.addEventListener("keyup", function (e) {
      if (e.code === "Space") {
        spaceHeld = false;
        viewportEl.classList.remove("pannable");
      }
    });

    viewportEl.addEventListener("pointerdown", function (e) {
      const wantPan = e.button === 1 || (e.button === 0 && spaceHeld);
      if (!wantPan) return;
      e.preventDefault();
      panning = { x: e.clientX, y: e.clientY, left: viewportEl.scrollLeft, top: viewportEl.scrollTop };
      viewportEl.setPointerCapture(e.pointerId);
      viewportEl.classList.add("panning");
    });

    viewportEl.addEventListener("pointermove", function (e) {
      if (!panning) return;
      viewportEl.scrollLeft = panning.left - (e.clientX - panning.x);
      viewportEl.scrollTop = panning.top - (e.clientY - panning.y);
    });

    const endPan = function (e) {
      if (!panning) return;
      panning = null;
      viewportEl.classList.remove("panning");
      if (e && e.pointerId != null && viewportEl.hasPointerCapture && viewportEl.hasPointerCapture(e.pointerId)) {
        viewportEl.releasePointerCapture(e.pointerId);
      }
    };
    viewportEl.addEventListener("pointerup", endPan);
    viewportEl.addEventListener("pointercancel", endPan);
  }

  /* ---------- the one entry point ---------- */

  function applyView() {
    const c = state.canvas;
    const ppu = pxPerUnit();
    boardEl.style.width = c.width * ppu + "px";
    boardEl.style.height = c.height * ppu + "px";

    const gridPx = state.view.gridSize * ppu;
    gridEl.style.backgroundSize = gridPx + "px " + gridPx + "px";
    gridEl.style.display = state.view.grid ? "block" : "none";

    renderRulers(ppu);
    applyBackground();
    applyUnderlay();

    if (zoomLabel) zoomLabel.textContent = Math.round(state.view.zoom * 100) + "%";

    S.emit("view", { pxPerUnit: ppu });
  }

  function boot() {
    wirePan();
    applyView();
    S.on("change", function () { applyView(); });
  }

  MN.stage = {
    pxPerUnit: pxPerUnit,
    toCanvas: toCanvas,
    toClient: toClient,
    setZoom: setZoom,
    zoomIn: zoomIn,
    zoomOut: zoomOut,
    fit: fit,
    applyView: applyView,
    applyBackground: applyBackground,
    applyUnderlay: applyUnderlay,
    boardEl: boardEl,
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})(window.MN = window.MN || {});
