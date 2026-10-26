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

    const nameInput = core.el("input", {
      id: "i-name", type: "text", value: state.projectName || "",
      "aria-label": "Project name",
    });
    nameInput.addEventListener("change", function () {
      state.projectName = nameInput.value || "Magnet Napkin board";
      S.commit("rename project");
    });
    frag.appendChild(row("Name", nameInput));

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
      MN.project.touchView();
      MN.app.setStatus("Grid step: " + MN.units.format(v, state.canvas.unit));
    });
    frag.appendChild(row("Grid", gridInput, unitLabel()));

    const ratioInput = numberField("i-asset-scale", state.view.assetScale, {
      min: 0.25, step: "any", label: "Ratio of the imported image files",
    });
    ratioInput.addEventListener("change", function () {
      const v = Math.max(0.25, core.num(ratioInput.value));
      state.view.assetScale = v;
      MN.project.touchView();
      MN.app.setStatus("Newly placed assets will come in at " +
        core.fmtNum(v, 2) + "× their pixel size.");
    });
    frag.appendChild(row("Asset ratio", ratioInput, "×"));

    const bg = c.background || { type: "checker", value: "#eef0f3" };
    const bgSelect = core.el("select", { id: "i-bg", "aria-label": "Canvas background" }, [
      core.el("option", { value: "checker", text: "Checker" }),
      core.el("option", { value: "color", text: "Solid colour" }),
      core.el("option", { value: "image", text: "Image" }),
    ]);
    bgSelect.value = ["color", "image"].indexOf(bg.type) >= 0 ? bg.type : "checker";
    bgSelect.addEventListener("change", function () {
      const value = state.canvas.background && state.canvas.background.value;
      if (bgSelect.value === "color") {
        state.canvas.background = { type: "color", value: value && value.charAt(0) === "#" ? value : "#eef0f3" };
      } else if (bgSelect.value === "image") {
        state.canvas.background = { type: "image", value: value || (state.assets[0] ? state.assets[0].id : "") };
      } else {
        state.canvas.background = { type: "checker", value: "#eef0f3" };
      }
      S.commit("background");
      render();
    });
    frag.appendChild(row("Background", bgSelect));

    if (bgSelect.value === "image") {
      const assetSelect = core.el("select", { id: "i-bg-image", "aria-label": "Background image" },
        state.assets.map(function (asset) {
          return core.el("option", { value: asset.id, text: asset.name });
        }));
      if (!state.assets.length) {
        assetSelect.appendChild(core.el("option", { value: "", text: "No images imported yet" }));
      }
      assetSelect.value = bg.value || "";
      assetSelect.addEventListener("change", function () {
        state.canvas.background = { type: "image", value: assetSelect.value };
        MN.stage.applyBackground();
        S.commit("background image");
      });
      frag.appendChild(row("Image", assetSelect));
    }

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

    /* An underlay: a faint reference image under the artwork, to trace
       against. Never drawn into the exported PNG. */
    const underlay = c.underlay || { assetId: null, opacity: 0.25 };
    const underlaySelect = core.el("select", { id: "i-underlay", "aria-label": "Underlay image" },
      [core.el("option", { value: "", text: "No underlay" })].concat(
        state.assets.map(function (asset) {
          return core.el("option", { value: asset.id, text: asset.name });
        })));
    underlaySelect.value = underlay.assetId || "";
    underlaySelect.addEventListener("change", function () {
      state.canvas.underlay = state.canvas.underlay || { assetId: null, opacity: 0.25 };
      state.canvas.underlay.assetId = underlaySelect.value || null;
      MN.stage.applyUnderlay();
      /* The underlay is view state: it is saved on its own and never
         rewrites the layout. */
      MN.project.touchView();
    });
    frag.appendChild(row("Underlay", underlaySelect));

    if (underlay.assetId) {
      const opacity = core.el("input", {
        id: "i-underlay-opacity", type: "range", min: "0.05", max: "1", step: "0.05",
        value: underlay.opacity == null ? 0.25 : underlay.opacity,
        "aria-label": "Underlay opacity",
      });
      const opacityValue = core.el("span", {
        class: "unit",
        text: Math.round((underlay.opacity == null ? 0.25 : underlay.opacity) * 100) + "%",
      });
      opacity.addEventListener("input", function () {
        state.canvas.underlay.opacity = core.num(opacity.value);
        opacityValue.textContent = Math.round(state.canvas.underlay.opacity * 100) + "%";
        MN.stage.applyUnderlay();
      });
      opacity.addEventListener("change", function () { MN.project.touchView(); });
      frag.appendChild(core.el("div", { class: "field" }, [
        core.el("label", { text: "Strength" }), opacity, opacityValue,
      ]));
    }

    return frag;
  }

  /* ---------- item section ---------- */

  /* The pixel equivalent of a canvas-unit value. The canvas has one scale, so
     the two are always proportional: the second number is derived from the
     first, never stored and never out of step. */
  function pixelEquivalent(value) {
    if (state.canvas.scale === 1 && state.canvas.unit === "px") return "px";
    return core.fmtNum(value * state.canvas.scale, 2) + " px";
  }

  function updateEquivalents() {
    core.$$("#inspector-body .unit.px").forEach(function (el) {
      const input = el.parentNode.querySelector("input");
      if (!input) return;
      el.textContent = pixelEquivalent(core.num(input.value));
    });
  }

  function buildItemSection(item) {
    const frag = document.createDocumentFragment();
    const unit = unitLabel();

    frag.appendChild(section("Selected"));
    frag.appendChild(core.el("p", { class: "selected-name", text: MN.items.nameFor(item) }));

    function applyGeometry(label) {
      MN.interact.clampItem(item);
      MN.items.updateItem(item);
      updateValues();
      updateEquivalents();
    }

    /* A geometry field: the value in canvas units, with the board pixels
       beside it, the way the Redline board always showed it. */
    function geometryField(label, id, value, apply, min) {
      const input = numberField(id, value, {
        min: min,
        label: label + " in " + unitLabel(),
      });
      const equivalent = core.el("span", { class: "unit px", text: pixelEquivalent(value) });
      input.addEventListener("input", function () {
        apply(core.num(input.value));
        applyGeometry();
      });
      input.addEventListener("change", function () {
        apply(core.num(input.value));
        applyGeometry();
        S.commit("edit " + id);
      });
      frag.appendChild(core.el("div", { class: "field" }, [
        core.el("label", { text: label }), input, equivalent,
      ]));
      return input;
    }

    geometryField("X", "i-x", item.x, function (v) { item.x = v; });
    geometryField("Y", "i-y", item.y, function (v) { item.y = v; });
    geometryField("W", "i-w", item.w, function (v) {
      item.w = v;
      const ratio = MN.items.ratioOf(item);
      if (state.view.aspect && ratio) item.h = item.w / ratio;
    }, 0.01);
    geometryField("H", "i-h", item.h, function (v) {
      item.h = v;
      const ratio = MN.items.ratioOf(item);
      if (state.view.aspect && ratio) item.w = item.h * ratio;
    }, 0.01);

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
        const result = S.duplicateObject(item.id);
        if (result) { S.commit("duplicate"); S.select(result.type, result.copy.id); }
      }),
      button("Delete", function () {
        S.removeObject(item.id);
        S.commit("delete");
      }),
    ]));

    return frag;
  }

  /* ---------- text and note section ---------- */

  function buildTextSection(item, isNote) {
    const frag = document.createDocumentFragment();
    frag.appendChild(section(isNote ? "Note" : "Text"));

    if (isNote) {
      frag.appendChild(core.el("p", { class: "note-warning" }, [
        document.createTextNode("A note is commentary. It is drawn on the annotated PNG and never on the clean one."),
      ]));
    }

    const textArea = core.el("textarea", {
      id: "i-text",
      rows: "3",
      "aria-label": isNote ? "Note text" : "Text content",
    });
    textArea.value = item.text == null ? "" : item.text;
    const applyText = function () {
      item.text = textArea.value;
      MN.items.syncTextHeight(item);
      MN.items.updateItem(item);
      MN.inspector.updateValues();
    };
    textArea.addEventListener("input", applyText);
    textArea.addEventListener("change", function () {
      applyText();
      S.commit("edit text");
    });
    frag.appendChild(core.el("div", { class: "field wide" }, [
      core.el("label", { text: isNote ? "Comment" : "Content" }), textArea,
    ]));

    const font = core.el("select", { id: "i-font", "aria-label": "Font family" },
      MN.textlayout.FONT_NAMES.map(function (name) {
        return core.el("option", { value: name, text: name });
      }));
    font.value = item.fontFamily;
    font.addEventListener("change", function () {
      item.fontFamily = font.value;
      MN.items.syncTextHeight(item);
      MN.items.updateItem(item);
      S.commit("edit font");
    });
    frag.appendChild(row("Font", font));

    const size = numberField("i-size", item.fontSize, { min: 0.5, step: "any", label: "Font size" });
    const applySize = function () {
      item.fontSize = Math.max(0.5, core.num(size.value));
      MN.items.syncTextHeight(item);
      MN.items.updateItem(item);
    };
    size.addEventListener("input", applySize);
    size.addEventListener("change", function () {
      applySize();
      S.commit("edit font size");
    });
    frag.appendChild(row("Size", size, unitLabel()));

    const weight = core.el("select", { id: "i-weight", "aria-label": "Font weight" }, [
      core.el("option", { value: "300", text: "Light" }),
      core.el("option", { value: "400", text: "Regular" }),
      core.el("option", { value: "600", text: "Semibold" }),
      core.el("option", { value: "700", text: "Bold" }),
    ]);
    weight.value = String(item.fontWeight || 400);
    weight.addEventListener("change", function () {
      item.fontWeight = core.num(weight.value);
      MN.items.syncTextHeight(item);
      MN.items.updateItem(item);
      S.commit("edit font weight");
    });
    frag.appendChild(row("Weight", weight));

    const colour = core.el("input", {
      id: "i-color", type: "color", value: item.color || "#111111", "aria-label": "Text colour",
    });
    colour.addEventListener("input", function () {
      item.color = colour.value;
      MN.items.updateItem(item);
    });
    colour.addEventListener("change", function () {
      item.color = colour.value;
      MN.items.updateItem(item);
      S.commit("edit text colour");
    });
    frag.appendChild(row("Colour", colour));

    if (isNote) {
      /* A note is always on paper: it never has a transparent backdrop. */
      const bgColour = core.el("input", {
        id: "i-textbg", type: "color", value: item.background || "#fff3b0", "aria-label": "Note paper colour",
      });
      bgColour.addEventListener("input", function () {
        item.background = bgColour.value;
        MN.items.updateItem(item);
      });
      bgColour.addEventListener("change", function () {
        item.background = bgColour.value;
        MN.items.updateItem(item);
        S.commit("edit note colour");
      });
      frag.appendChild(row("Paper", bgColour));
    } else {
      const hasBackground = item.background && item.background !== "transparent";
      const bgMode = core.el("select", { id: "i-bgmode", "aria-label": "Text background" }, [
        core.el("option", { value: "transparent", text: "None" }),
        core.el("option", { value: "colour", text: "Colour" }),
      ]);
      bgMode.value = hasBackground ? "colour" : "transparent";
      bgMode.addEventListener("change", function () {
        item.background = bgMode.value === "colour" ? (item.color || "#e8eaee") : "transparent";
        if (bgMode.value === "colour" && item.color === item.background) item.background = "#e8eaee";
        MN.items.updateItem(item);
        S.commit("edit text background");
        render();
      });
      frag.appendChild(row("Backdrop", bgMode));

      if (hasBackground) {
        const bgColour = core.el("input", {
          id: "i-textbg", type: "color", value: item.background, "aria-label": "Text background colour",
        });
        bgColour.addEventListener("input", function () {
          item.background = bgColour.value;
          MN.items.updateItem(item);
        });
        bgColour.addEventListener("change", function () { S.commit("edit text background"); });
        frag.appendChild(row("Colour", bgColour));
      }
    }
    const align = core.el("select", { id: "i-align", "aria-label": "Text alignment" }, [
      core.el("option", { value: "left", text: "Left" }),
      core.el("option", { value: "center", text: "Centre" }),
      core.el("option", { value: "right", text: "Right" }),
    ]);
    align.value = item.align || "left";
    align.addEventListener("change", function () {
      item.align = align.value;
      MN.items.updateItem(item);
      S.commit("edit alignment");
    });
    frag.appendChild(row("Align", align));

    const auto = core.el("input", { id: "i-auto", type: "checkbox", "aria-label": "Auto height" });
    auto.checked = item.autoHeight !== false;
    auto.addEventListener("change", function () {
      item.autoHeight = auto.checked;
      if (item.autoHeight) MN.items.syncTextHeight(item);
      MN.items.updateItem(item);
      S.commit("edit auto height");
    });
    frag.appendChild(core.el("div", { class: "field" }, [
      core.el("label", { text: "Auto height" }), auto, core.el("span", { class: "unit" }),
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
    const note = S.selectedNote();
    if (item) {
      bodyEl.appendChild(buildItemSection(item));
      if (item.kind === "text") bodyEl.appendChild(buildTextSection(item, false));
    } else if (note) {
      bodyEl.appendChild(buildItemSection(note));
      bodyEl.appendChild(buildTextSection(note, true));
    } else {
      bodyEl.appendChild(buildHint());
    }

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
    const obj = S.selectedItem() || S.selectedNote();
    if (!obj) return;
    const set = function (id, value) {
      const el = core.$("#" + id, bodyEl);
      if (el && document.activeElement !== el) el.value = core.fmtNum(value, 3);
    };
    set("i-x", obj.x);
    set("i-y", obj.y);
    set("i-w", obj.w);
    set("i-h", obj.h);
    set("i-rot", obj.rotation || 0);
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
