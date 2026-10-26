/* Magnet Napkin — the inspector.
   The precision half of the tool: exact numbers, in canvas units, for the
   canvas and for whatever is selected. */
(function (MN) {
  "use strict";

  const core = MN.core;
  const S = MN.state;
  const state = S.state;

  const bodyEl = core.$("#inspector-body");

  /* ---------- small builders ---------- */

  function section(title) {
    return core.el("div", { class: "sec-head", text: title });
  }

  function row(label, control, unitText) {
    return core.el("div", { class: "field" }, [
      core.el("label", { text: label }),
      control,
      core.el("span", { class: "unit", text: unitText || "" }),
    ]);
  }

  function numberField(id, value, opts) {
    const options = opts || {};
    return core.el("input", {
      id: id,
      type: "number",
      value: options.raw != null ? options.raw : core.fmtNum(value, 3),
      min: options.min != null ? options.min : 0,
      step: options.step != null ? options.step : "any",
      "aria-label": options.label || id,
    });
  }

  /* ---------- canvas section ---------- */

  function buildCanvasSection() {
    const c = state.canvas;
    const frag = document.createDocumentFragment();

    frag.appendChild(section("Canvas"));

    const onScreen = core.el("p", { class: "summary" }, [
      core.el("b", { text: MN.core.fmtNum(c.width * c.scale, 2) + " × " + MN.core.fmtNum(c.height * c.scale, 2) + " px" }),
      document.createTextNode(" on screen · "),
      core.el("b", { text: MN.core.fmtNum(c.width, 2) + " × " + MN.core.fmtNum(c.height, 2) + " " + MN.units.unitOf(c.unit).label }),
      document.createTextNode(" · " + core.fmtNum(c.scale, 4) + " px per unit"),
    ]);
    frag.appendChild(onScreen);

    const gridInput = numberField("i-grid", state.view.gridSize, {
      min: 0.0001, step: "any", label: "Grid step in canvas units",
    });
    gridInput.addEventListener("change", function () {
      const v = Math.max(0.0001, core.num(gridInput.value));
      state.view.gridSize = v;
      MN.stage.applyView();
      MN.app.setStatus("Grid step: " + MN.units.format(v, state.canvas.unit));
    });
    frag.appendChild(row("Grid", gridInput, MN.units.unitOf(c.unit).label));

    const bg = c.background || { type: "checker", value: "#eef0f3" };
    const bgSelect = core.el("select", { id: "i-bg", "aria-label": "Canvas background" }, [
      core.el("option", { value: "checker", text: "Checker" }),
      core.el("option", { value: "color", text: "Solid colour" }),
    ]);
    bgSelect.value = bg.type === "color" ? "color" : "checker";
    bgSelect.addEventListener("change", function () {
      state.canvas.background = bgSelect.value === "color"
        ? { type: "color", value: (state.canvas.background && state.canvas.background.value) || "#eef0f3" }
        : { type: "checker", value: "#eef0f3" };
      S.commit("background");
      render();
    });
    frag.appendChild(row("Background", bgSelect));

    if (bgSelect.value === "color") {
      const colour = core.el("input", {
        id: "i-bg-colour", type: "color",
        value: state.canvas.background.value || "#eef0f3",
        "aria-label": "Canvas colour",
      });
      colour.addEventListener("input", function () {
        state.canvas.background.value = colour.value;
        MN.stage.applyBackground();
      });
      colour.addEventListener("change", function () { S.commit("background colour"); });
      frag.appendChild(row("Colour", colour));
    }

    return frag;
  }

  /* ---------- selection placeholder (filled in by later slices) ---------- */

  function buildHint() {
    return core.el("p", { class: "hint" }, [
      document.createTextNode("Nothing selected. Click an item on the canvas to edit its position, size and rotation."),
    ]);
  }

  /* ---------- render ---------- */

  function render() {
    if (!bodyEl) return;
    const active = document.activeElement;
    const activeId = active && bodyEl.contains(active) ? active.id : null;
    const activeStart = active && active.selectionStart;

    bodyEl.textContent = "";
    bodyEl.appendChild(buildCanvasSection());
    bodyEl.appendChild(section("Selection"));
    bodyEl.appendChild(buildHint());

    if (activeId) {
      const next = core.$("#" + activeId, bodyEl);
      if (next) {
        next.focus();
        if (activeStart != null && next.setSelectionRange) {
          try { next.setSelectionRange(activeStart, activeStart); } catch (e) { /* not a text field */ }
        }
      }
    }
  }

  function boot() {
    render();
    S.on("change", render);
    S.on("selection", render);
  }

  MN.inspector = { render: render };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})(window.MN = window.MN || {});
