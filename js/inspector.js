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

  function button(label, onClick, className) {
    const b = core.el("button", { type: "button", text: label });
    if (className) b.className = className;
    b.addEventListener("click", onClick);
    return b;
  }

  function buttonRow(children) {
    const row = core.el("div", { class: "row" });
    for (const child of children) row.appendChild(child);
    return row;
  }

  function unitLabel() {
    return MN.units.unitOf(state.canvas.unit).label;
  }

  /* ---------- canvas section ---------- */

  function buildCanvasSection() {
    const c = state.canvas;
    const frag = document.createDocumentFragment();

    frag.appendChild(section("Canvas"));

    frag.appendChild(core.el("p", { class: "summary" }, [
      core.el("b", { text: core.fmtNum(c.width * c.scale, 2) + " × " + core.fmtNum(c.height * c.scale, 2) + " px" }),
      document.createTextNode(" on screen · "),
      core.el("b", { text: core.fmtNum(c.width, 2) + " × " + core.fmtNum(c.height, 2) + " " + unitLabel() }),
      document.createTextNode(" · " + core.fmtNum(c.scale, 4) + " px per unit"),
    ]));

    const gridInput = numberField("i-grid", state.view.gridSize, {
      min: 0.0001, step: "any", label: "Grid step in canvas units",
    });
    gridInput.addEventListener("change", function () {
      const v = Math.max(0.0001, core.num(gridInput.value));
      state.view.gridSize = v;
      MN.stage.applyView();
      MN.app.setStatus("Grid step: " + MN.units.format(v, state.canvas.unit));
    });
    frag.appendChild(row("Grid", gridInput, unitLabel()));

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

  /* ---------- item section ---------- */

  function buildItemSection(item) {
    const frag = document.createDocumentFragment();
    const unit = unitLabel();

    frag.appendChild(section("Selected"));
    frag.appendChild(core.el("p", { class: "selected-name", text: MN.items.labelFor(item) }));

    const xInput = numberField("i-x", item.x, { label: "X position" });
    const yInput = numberField("i-y", item.y, { label: "Y position" });
    const wInput = numberField("i-w", item.w, { min: 0.01, label: "Width" });
    const hInput = numberField("i-h", item.h, { min: 0.01, label: "Height" });

    function applyGeometry(label) {
      MN.interact.clampItem(item);
      MN.items.updateItem(item);
      updateValues();
    }

    function bind(id, apply) {
      const input = core.$("#" + id);
      if (!input) return;
      input.addEventListener("input", function () {
        apply(core.num(input.value));
        applyGeometry();
      });
      input.addEventListener("change", function () { S.commit("edit " + id); });
    }

    bind("i-x", function (v) { item.x = v; });
    bind("i-y", function (v) { item.y = v; });
    bind("i-w", function (v) {
      item.w = v;
      const ratio = MN.items.ratioOf(item);
      if (state.view.aspect && ratio) item.h = item.w / ratio;
    });
    bind("i-h", function (v) {
      item.h = v;
      const ratio = MN.items.ratioOf(item);
      if (state.view.aspect && ratio) item.w = item.h * ratio;
    });

    frag.appendChild(row("X", xInput, unit));
    frag.appendChild(row("Y", yInput, unit));
    frag.appendChild(row("W", wInput, unit));
    frag.appendChild(row("H", hInput, unit));

    const rotInput = numberField("i-rot", item.rotation || 0, { step: "any", label: "Rotation in degrees" });
    rotInput.addEventListener("input", function () {
      item.rotation = core.num(rotInput.value);
      MN.items.updateItem(item);
    });
    rotInput.addEventListener("change", function () { S.commit("edit rotation"); });
    frag.appendChild(row("Rotate", rotInput, "°"));

    const opacity = core.el("input", {
      id: "i-op", type: "range", min: "0", max: "1", step: "0.01",
      value: item.opacity == null ? 1 : item.opacity, "aria-label": "Opacity",
    });
    const opacityValue = core.el("span", { class: "unit", text: Math.round((item.opacity == null ? 1 : item.opacity) * 100) + "%" });
    opacity.addEventListener("input", function () {
      item.opacity = core.num(opacity.value);
      opacityValue.textContent = Math.round(item.opacity * 100) + "%";
      MN.items.updateItem(item);
    });
    opacity.addEventListener("change", function () { S.commit("edit opacity"); });
    frag.appendChild(core.el("div", { class: "field" }, [
      core.el("label", { text: "Opacity" }), opacity, opacityValue,
    ]));

    const lock = core.el("input", { id: "i-lock", type: "checkbox", "aria-label": "Lock item" });
    lock.checked = !!item.locked;
    lock.addEventListener("change", function () {
      item.locked = lock.checked;
      MN.items.updateItem(item);
      S.commit("lock item");
    });
    frag.appendChild(core.el("div", { class: "field" }, [
      core.el("label", { text: "Lock" }), lock, core.el("span", { class: "unit" }),
    ]));

    frag.appendChild(buttonRow([
      button("Bring front", function () { S.bringToFront(item.id); S.commit("bring to front"); }),
      button("Send back", function () { S.sendToBack(item.id); S.commit("send to back"); }),
    ]));
    frag.appendChild(buttonRow([
      button("Duplicate", function () {
        const copy = S.duplicateItem(item.id);
        if (copy) { S.commit("duplicate item"); S.select("item", copy.id); }
      }),
      button("Delete", function () {
        S.removeItem(item.id);
        S.commit("delete item");
      }),
    ]));

    return frag;
  }

  /* ---------- selection placeholder ---------- */

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

    const item = S.selectedItem();
    if (item) bodyEl.appendChild(buildItemSection(item));
    else bodyEl.appendChild(buildHint());

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

  /* Update the numbers in place, without rebuilding the panel. Used while a
     drag is in flight. */
  function updateValues() {
    if (!bodyEl) return;
    const item = S.selectedItem();
    if (!item) return;
    const set = function (id, value) {
      const el = core.$("#" + id, bodyEl);
      if (el && document.activeElement !== el) el.value = core.fmtNum(value, 3);
    };
    set("i-x", item.x);
    set("i-y", item.y);
    set("i-w", item.w);
    set("i-h", item.h);
    set("i-rot", item.rotation || 0);
  }

  function focusField(name) {
    const el = core.$("#i-" + name, bodyEl);
    if (!el) return false;
    el.focus();
    if (el.select) el.select();
    return true;
  }

  function boot() {
    render();
    S.on("change", render);
    S.on("selection", render);
  }

  MN.inspector = { render: render, updateValues: updateValues, focusField: focusField };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})(window.MN = window.MN || {});
