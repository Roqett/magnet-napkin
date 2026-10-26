/* Magnet Napkin — the agent handoff.
   Four files, one click each, all derived from the same project document:
     layout.png           the clean design
     layout-annotated.png the same board with the notes on top
     layout.json          the machine contract
     notes.md             the brief, for a human or a model

   The JSON is the source of truth. The Markdown is derived from it. */
(function (MN) {
  "use strict";

  const core = MN.core;
  const S = MN.state;
  const state = S.state;

  function unitLabel() {
    return MN.units.unitOf(state.canvas.unit).label;
  }

  /* The label of the item a note is attached to, if any. */
  function targetLabel(note) {
    if (!note.targetId) return null;
    const item = S.findItem(note.targetId);
    return item ? MN.items.nameFor(item) : null;
  }

  function positionText(note) {
    const unit = unitLabel();
    return "(x " + core.fmtNum(note.x, 2) + ", y " + core.fmtNum(note.y, 2) + " " + unit + ")";
  }

  /* notes.md: the human brief. */
  function notesMarkdown() {
    const c = state.canvas;
    const lines = [];
    lines.push("# Handoff — " + (state.projectName || "Magnet Napkin board"));
    lines.push("");
    lines.push("**layout.png is the design. The notes below are commentary and are not part of it.**");
    lines.push("");
    lines.push("- Canvas: " + core.fmtNum(c.width, 2) + " × " + core.fmtNum(c.height, 2) + " " + unitLabel() +
      ", " + core.fmtNum(c.scale, 4) + " px per unit");
    lines.push("- Design: `layout.png` — the clean render, no notes, no grid, no selection");
    lines.push("- Annotated: `layout-annotated.png` — the same board with the notes visible");
    lines.push("- Contract: `layout.json` — the exact geometry, in canvas units");
    lines.push("- Items: " + state.items.length + " · Notes: " + state.notes.length);
    lines.push("");
    lines.push("## Notes");
    lines.push("");
    if (!state.notes.length) {
      lines.push("_No notes._");
    } else {
      for (const note of state.notes) {
        const label = targetLabel(note);
        lines.push("- " + positionText(note) + (label ? " [" + label + "]" : "") + " " + (note.text || "").trim());
      }
    }
    lines.push("");
    return lines.join("\n");
  }

  /* The clipboard brief: the same facts, compact. */
  function handoffBrief() {
    const c = state.canvas;
    const lines = [];
    lines.push("# " + (state.projectName || "Magnet Napkin board"));
    lines.push("");
    lines.push("Canvas: " + core.fmtNum(c.width, 2) + " × " + core.fmtNum(c.height, 2) + " " + unitLabel() +
      " (" + core.fmtNum(c.scale, 4) + " px per unit)");
    lines.push("layout.png is the design. layout-annotated.png includes the notes, which are commentary, not artwork.");
    lines.push("The exact geometry is in layout.json, in canvas units.");
    lines.push("");
    if (state.notes.length) {
      lines.push("Notes:");
      for (const note of state.notes) {
        const label = targetLabel(note);
        lines.push("- " + positionText(note) + (label ? " [" + label + "]" : "") + " " + (note.text || "").trim());
      }
    } else {
      lines.push("No notes.");
    }
    return lines.join("\n");
  }

  /* ---------- the four artifacts ---------- */

  function downloadCleanPng(tier) {
    return MN.exporter.exportPng({ tier: tier, annotated: false, filename: "layout.png" });
  }

  function downloadAnnotatedPng(tier) {
    return MN.exporter.exportPng({ tier: tier, annotated: true, filename: "layout-annotated.png" });
  }

  function downloadJson() {
    const doc = MN.project.documentOf();
    core.downloadText(JSON.stringify(doc, null, 2), "layout.json", "application/json");
    return { name: "layout.json" };
  }

  function downloadNotes() {
    core.downloadText(notesMarkdown(), "notes.md", "text/markdown;charset=utf-8");
    return { name: "notes.md" };
  }

  /* Copy to the clipboard, with a fallback for pages that are not a secure
     context (a file:// page in Chrome, for one). */
  async function copyBrief() {
    const text = handoffBrief();
    if (navigator.clipboard && navigator.clipboard.writeText) {
      try {
        await navigator.clipboard.writeText(text);
        return true;
      } catch (err) { /* fall through to the old way */ }
    }
    const area = document.createElement("textarea");
    area.value = text;
    area.setAttribute("readonly", "");
    area.style.cssText = "position:fixed;left:-9999px;top:0;opacity:0";
    document.body.appendChild(area);
    area.select();
    let ok = false;
    try {
      ok = document.execCommand("copy");
    } catch (err) {
      ok = false;
    }
    area.remove();
    return ok;
  }

  MN.handoff = {
    notesMarkdown: notesMarkdown,
    handoffBrief: handoffBrief,
    downloadCleanPng: downloadCleanPng,
    downloadAnnotatedPng: downloadAnnotatedPng,
    downloadJson: downloadJson,
    downloadNotes: downloadNotes,
    copyBrief: copyBrief,
    positionText: positionText,
  };
})(window.MN = window.MN || {});
