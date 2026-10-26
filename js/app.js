/* Napkinetic — boot and wiring.
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
    newProject: true,
    save: true,
    open: true,
    exportPng: true,
    handoff: true,
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
    /* The toolbar and the canvas panel show the same numbers. Whichever one
       you change, the other follows — but never fight the field you are
       typing in. */
    const active = document.activeElement;
    const set = function (el, value) {
      if (el && el !== active) el.value = value;
    };
    set(core.$("#c-width"), state.canvas.width);
    set(core.$("#c-height"), state.canvas.height);
    set(core.$("#c-unit"), state.canvas.unit);
    set(core.$("#c-scale"), core.fmtNum(state.canvas.scale, 4));
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
    core.$('[data-act="exportpng"]').addEventListener("click", function () {
      const tier = core.num(core.$("#export-tier").value) || 1;
      MN.exporter.exportPng({ tier: tier, annotated: false }).then(function (result) {
        setStatus("Exported " + result.name + " · " + result.width + " × " + result.height + " px");
      }).catch(function (err) {
        window.alert("The PNG could not be exported: " + (err && err.message ? err.message : "unknown error"));
      });
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
      MN.project.touchView();
    });
    core.$("#snapToggle").addEventListener("change", function (e) {
      state.view.snap = e.target.checked;
    });
    core.$("#aspectToggle").addEventListener("change", function (e) {
      state.view.aspect = e.target.checked;
    });
  }

  /* ---------- project actions ---------- */

  function wireProjectActions() {
    core.$('[data-act="new"]').addEventListener("click", function () {
      if (state.items.length || state.notes.length) {
        const ok = window.confirm("Clear the board? The imported images stay in the tray, and the board you have now is kept in the history.");
        if (!ok) return;
      }
      state.items.length = 0;
      state.notes.length = 0;
      state.selection = null;
      S.commit("new board");
      /* The user asked for an empty board, so the empty board is allowed to
         replace the stored one. The old board is in the history. */
      MN.project.persist({ explicit: true, allowEmpty: true, label: "new board" })
        .catch(function () { /* the storage warning says it */ });
      setStatus("Board cleared. The images are still in the tray.");
    });

    core.$('[data-act="save"]').addEventListener("click", function () {
      const dialog = core.$("#save-dialog");
      if (dialog && typeof dialog.showModal === "function") dialog.showModal();
      else MN.project.saveFile(false);
    });

    core.$('[data-act="open"]').addEventListener("click", function () {
      core.$("#json-input").click();
    });

    const jsonInput = core.$("#json-input");
    jsonInput.addEventListener("change", function (e) {
      const file = e.target.files && e.target.files[0];
      e.target.value = "";
      if (!file) return;
      MN.project.openFile(file).then(function (result) {
        setStatus("Opened " + file.name + " · " + state.items.length + " item" +
          (state.items.length === 1 ? "" : "s") + ", " + state.notes.length + " note" +
          (state.notes.length === 1 ? "" : "s") + ".");
        if (!result || !result.missing.length) setStatus("Opened " + file.name + ".");
      }).catch(function (err) {
        window.alert(err && err.message ? err.message : "That project could not be opened.");
      });
    });

    const saveDialog = core.$("#save-dialog");
    core.$("#save-small").addEventListener("click", function () {
      saveDialog.close();
      MN.project.saveFile(false);
    });
    core.$("#save-embedded").addEventListener("click", function () {
      saveDialog.close();
      MN.project.saveFile(true);
    });
    core.$("#close-save").addEventListener("click", function () { saveDialog.close(); });

    const missingDialog = core.$("#missing-dialog");
    core.$("#relink").addEventListener("click", function () {
      missingDialog.close();
      MN.assets.openFolderPicker();
    });
    core.$("#dismiss-missing").addEventListener("click", function () { missingDialog.close(); });
  }

  function wireShortcuts() {
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

  /* ---------- the handoff ---------- */

  function wireHandoff() {
    const dialog = core.$("#handoff-dialog");

    function updateSize() {
      const tier = core.num(core.$("#export-tier").value) || 1;
      const size = MN.exporter.canvasSizeFor(tier);
      const label = core.$("#handoff-size");
      if (label) {
        label.textContent = "PNGs at " + tier + "×: " + size.width + " × " + size.height + " px. " +
          state.items.length + " item" + (state.items.length === 1 ? "" : "s") + ", " +
          state.notes.length + " note" + (state.notes.length === 1 ? "" : "s") + ".";
      }
    }

    core.$('[data-act="handoff"]').addEventListener("click", function () {
      updateSize();
      if (dialog && typeof dialog.showModal === "function") dialog.showModal();
    });
    core.$("#close-handoff").addEventListener("click", function () { dialog.close(); });
    core.$("#export-tier").addEventListener("change", updateSize);

    core.$$("[data-export]").forEach(function (button) {
      button.addEventListener("click", function () {
        const tier = core.num(core.$("#export-tier").value) || 1;
        const kind = button.dataset.export;
        const work = kind === "clean" ? MN.handoff.downloadCleanPng(tier)
          : kind === "annotated" ? MN.handoff.downloadAnnotatedPng(tier)
          : kind === "json" ? Promise.resolve(MN.handoff.downloadJson())
          : Promise.resolve(MN.handoff.downloadNotes());
        Promise.resolve(work).then(function (result) {
          setStatus("Downloaded " + (result && result.name ? result.name : kind) +
            (result && result.width ? " · " + result.width + " × " + result.height + " px" : ""));
        }).catch(function (err) {
          window.alert("That file could not be produced: " + (err && err.message ? err.message : "unknown error"));
        });
      });
    });

    core.$("#copy-handoff").addEventListener("click", function () {
      MN.handoff.copyBrief().then(function (ok) {
        setStatus(ok ? "Handoff brief copied to the clipboard." : "Could not reach the clipboard — use notes.md instead.");
      });
    });
  }

  /* ---------- history and recovery ---------- */

  function clockText(at) {
    const d = new Date(at);
    const pad = function (n) { return String(n).padStart(2, "0"); };
    return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()) +
      " " + pad(d.getHours()) + ":" + pad(d.getMinutes()) + ":" + pad(d.getSeconds());
  }

  function wireHistory() {
    const dialog = core.$("#history-dialog");
    const list = core.$("#history-list");

    core.$('[data-act="history"]').addEventListener("click", function () {
      MN.project.listHistory().then(function (entries) {
        list.textContent = "";
        for (const entry of entries) {
          const row = core.el("div", { class: "history-entry" }, [
            core.el("span", { class: "when", text: clockText(entry.at) }),
            core.el("span", {
              class: "what",
              text: entry.label + " · " + entry.itemCount + " item" + (entry.itemCount === 1 ? "" : "s") +
                ", " + entry.noteCount + " note" + (entry.noteCount === 1 ? "" : "s"),
            }),
          ]);
          const restore = core.el("button", { type: "button", text: "Restore" });
          restore.addEventListener("click", function () {
            MN.project.restoreEntry(entry.id).then(function () {
              dialog.close();
            }).catch(function (err) {
              window.alert(err && err.message ? err.message : "That snapshot could not be restored.");
            });
          });
          row.appendChild(restore);
          list.appendChild(row);
        }
        if (dialog && typeof dialog.showModal === "function") dialog.showModal();
      });
    });

    core.$("#close-history").addEventListener("click", function () { dialog.close(); });
  }

  /* ---------- another tab ---------- */

  function wireConflict() {
    const banner = core.$("#conflict-banner");
    const title = core.$("#conflict-title");
    const detail = core.$("#conflict-detail");

    function show(info) {
      if (!banner) return;
      if (!info) {
        banner.hidden = true;
        return;
      }
      banner.hidden = false;
      title.textContent = info.rev
        ? "Another tab saved a newer board."
        : "This board was updated in another tab.";
      detail.textContent = info.rev
        ? "The other tab's board has " + info.itemCount + " item" + (info.itemCount === 1 ? "" : "s") +
          ". Nothing has been overwritten. Reload to take it, or keep writing over it."
        : "Nothing has been overwritten. Reload to see the other tab's board.";
    }

    S.on("conflict", show);
    S.on("cross-tab", function () {
      if (MN.project.getConflict()) return;
      show({ rev: 0 });
    });

    core.$("#conflict-reload").addEventListener("click", function () {
      MN.project.reloadStored().then(function () { show(null); });
    });
    core.$("#conflict-overwrite").addEventListener("click", function () {
      MN.project.persist({ overwrite: true, force: true, label: "overwrite" }).then(function () {
        show(null);
      });
    });
    core.$("#conflict-dismiss").addEventListener("click", function () {
      show(null);
    });
  }

  function boot() {
    applyCapabilities();
    renderCanvasControls();
    updateEmptyState();
    wireCanvasControls();
    wireViewControls();
    wireProjectActions();
    wireHandoff();
    wireShortcuts();
    wireHistory();
    wireConflict();
    S.resetHistory();
    S.on("change", function () {
      updateEmptyState();
      renderCanvasControls();
    });
    setStatus("Ready — import a folder of images, then set the canvas.");
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }

  MN.app = {
    setStatus: setStatus,
    CAPS: CAPS,
    applyCapabilities: applyCapabilities,
    renderCanvasControls: renderCanvasControls,
  };
})(window.MN = window.MN || {});
