/* Magnet Napkin — boot and wiring.
   Capabilities are flipped on as each slice lands, so a button that does not
   work yet is visibly disabled rather than quietly broken. */
(function (MN) {
  "use strict";

  const core = MN.core;
  const S = MN.state;
  const state = S.state;

  /* Which slices have landed. Each flag is turned on by the phase that
     implements it. */
  const CAPS = {
    zoom: true,
    zoomfit: true,
    import: true,
    aspect: true,
    snap: true,
    text: true,
    note: true,
    note: false,
    newProject: false,
    save: false,
    open: false,
    exportPng: false,
    handoff: false,
  };

  const ACT_CAP = {
    zoomout: "zoom",
    zoomin: "zoom",
    fit: "zoomfit",
    import: "import",
    addtext: "text",
    addnote: "note",
    new: "newProject",
    save: "save",
    open: "open",
    exportpng: "exportPng",
    handoff: "handoff",
  };

  const statusEl = core.$("#status");

  function setStatus(message) {
    if (statusEl) statusEl.textContent = message;
  }

  /* ---------- canvas controls ---------- */

  function applyCapabilities() {
    core.$$("[data-act]").forEach(function (btn) {
      const cap = ACT_CAP[btn.dataset.act];
      btn.disabled = !!(cap && !CAPS[cap]);
    });
    core.$$("[data-cap]").forEach(function (input) {
      const cap = input.dataset.cap;
      input.disabled = !!(cap && !CAPS[cap]);
    });
  }

  function renderCanvasControls() {
    core.$("#c-width").value = state.canvas.width;
    core.$("#c-height").value = state.canvas.height;
    core.$("#c-unit").value = state.canvas.unit;
    core.$("#c-scale").value = core.fmtNum(state.canvas.scale, 4);
  }

  /* The board is drawn in pixels: canvas units x scale x zoom.
     stage.js owns that; this is only the empty-state bookkeeping. */
  function updateEmptyState() {
    const empty = core.$("#empty-state");
    if (!empty) return;
    empty.hidden = state.items.length > 0 || state.notes.length > 0;
  }

  function wireCanvasControls() {
    const widthInput = core.$("#c-width");
    const heightInput = core.$("#c-height");
    const unitSelect = core.$("#c-unit");
    const scaleInput = core.$("#c-scale");

    function setCanvas(patch, label) {
      Object.assign(state.canvas, patch);
      S.commit(label);
      renderCanvasControls();
      updateEmptyState();
    }

    widthInput.addEventListener("change", function () {
      const w = Math.max(0.01, core.num(widthInput.value));
      setCanvas({ width: w }, "canvas width");
    });

    heightInput.addEventListener("change", function () {
      const h = Math.max(0.01, core.num(heightInput.value));
      setCanvas({ height: h }, "canvas height");
    });

    unitSelect.addEventListener("change", function () {
      const next = unitSelect.value;
      const previous = state.canvas.unit;
      const patch = { unit: next };
      /* If the scale or the grid step was still the old unit's default, adopt
         the new unit's default. Anything else is a deliberate choice and is
         left alone. */
      if (state.canvas.scale === MN.units.UNITS[previous].defaultScale) {
        patch.scale = MN.units.UNITS[next].defaultScale;
      }
      if (state.view.gridSize === MN.units.UNITS[previous].defaultGrid) {
        state.view.gridSize = MN.units.UNITS[next].defaultGrid;
      }
      setCanvas(patch, "canvas unit");
    });

    scaleInput.addEventListener("change", function () {
      const s = Math.max(0.0001, core.num(scaleInput.value));
      setCanvas({ scale: s }, "canvas scale");
    });
  }

  /* ---------- view controls ---------- */

  function viewCentre() {
    const viewport = core.$("#viewport");
    const rect = viewport.getBoundingClientRect();
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  }

  function wireViewControls() {
    core.$('[data-act="import"]').addEventListener("click", function () {
      MN.assets.openFolderPicker();
    });
    core.$('[data-act="addtext"]').addEventListener("click", function () {
      MN.interact.placeText();
    });
    core.$('[data-act="addnote"]').addEventListener("click", function () {
      MN.interact.placeNote();
    });
    core.$('[data-act="zoomin"]').addEventListener("click", function () {
      MN.stage.zoomIn(viewCentre());
    });
    core.$('[data-act="zoomout"]').addEventListener("click", function () {
      MN.stage.zoomOut(viewCentre());
    });
    core.$('[data-act="fit"]').addEventListener("click", function () {
      MN.stage.fit();
    });

    core.$("#gridToggle").addEventListener("change", function (e) {
      state.view.grid = e.target.checked;
      MN.stage.applyView();
    });
    core.$("#snapToggle").addEventListener("change", function (e) {
      state.view.snap = e.target.checked;
    });
    core.$("#aspectToggle").addEventListener("change", function (e) {
      state.view.aspect = e.target.checked;
    });
  }

  /* ---------- history wiring (available from the start) ---------- */

  function wireHistory() {
    core.$('[data-act="undo"]').addEventListener("click", function () {
      if (S.undo()) setStatus("Undone");
    });
    core.$('[data-act="redo"]').addEventListener("click", function () {
      if (S.redo()) setStatus("Redone");
    });

    document.addEventListener("keydown", function (e) {
      const tag = (e.target && e.target.tagName || "").toLowerCase();
      if (tag === "input" || tag === "textarea" || tag === "select") return;
      const mod = e.metaKey || e.ctrlKey;
      if (!mod || e.key.toLowerCase() !== "z") return;
      e.preventDefault();
      if (e.shiftKey) {
        if (S.redo()) setStatus("Redone");
      } else if (S.undo()) {
        setStatus("Undone");
      }
    });
  }

  /* ---------- boot ---------- */

  function boot() {
    applyCapabilities();
    renderCanvasControls();
    updateEmptyState();
    wireCanvasControls();
    wireViewControls();
    wireHistory();
    S.resetHistory();
    S.on("change", function () {
      updateEmptyState();
    });
    setStatus("Ready — import a folder of images, then set the canvas.");
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }

  MN.app = { setStatus: setStatus, CAPS: CAPS, applyCapabilities: applyCapabilities };
})(window.MN = window.MN || {});
