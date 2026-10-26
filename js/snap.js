/* Napkinetic — snapping.
   Snaps to the grid, to the canvas edges and centre, and to the edges and
   centres of everything else on the board. When something snaps, a thin
   guide line is drawn so the snap is visible rather than mysterious.
   Hold Alt/Option to bypass it for one move. */
(function (MN) {
  "use strict";

  const core = MN.core;
  const S = MN.state;
  const state = S.state;

  /* How close, in screen pixels, a value has to be to snap. */
  const THRESHOLD_PX = 6;

  const guidesEl = core.$("#guides");

  function threshold() {
    return THRESHOLD_PX / MN.stage.pxPerUnit();
  }

  function others(excludeId) {
    return state.items.concat(state.notes).filter(function (o) {
      return o.id !== excludeId;
    });
  }

  function xCandidates(excludeId) {
    const c = state.canvas;
    const list = [
      { value: 0, guide: true },
      { value: c.width / 2, guide: true },
      { value: c.width, guide: true },
    ];
    for (const o of others(excludeId)) {
      list.push({ value: o.x, guide: true });
      list.push({ value: o.x + o.w / 2, guide: true });
      list.push({ value: o.x + o.w, guide: true });
    }
    return list;
  }

  function yCandidates(excludeId) {
    const c = state.canvas;
    const list = [
      { value: 0, guide: true },
      { value: c.height / 2, guide: true },
      { value: c.height, guide: true },
    ];
    for (const o of others(excludeId)) {
      list.push({ value: o.y, guide: true });
      list.push({ value: o.y + o.h / 2, guide: true });
      list.push({ value: o.y + o.h, guide: true });
    }
    return list;
  }

  /* Find the nearest thing to align to. `refs` are the points being aligned;
     `delta` is what has to be added to the reference to reach the target. */
  function nearest(refs, candidates, useGrid, gridSize) {
    const t = threshold();
    let best = null;

    for (const candidate of candidates) {
      for (const ref of refs) {
        const delta = candidate.value - ref.ref;
        if (Math.abs(delta) <= t && (!best || Math.abs(delta) < Math.abs(best.delta))) {
          best = { delta: delta, value: candidate.value, guide: candidate.guide };
        }
      }
    }

    if (useGrid && gridSize > 0) {
      for (const ref of refs) {
        const grid = Math.round(ref.ref / gridSize) * gridSize;
        const delta = grid - ref.ref;
        if (Math.abs(delta) <= t && (!best || Math.abs(delta) < Math.abs(best.delta))) {
          best = { delta: delta, value: grid, guide: false };
        }
      }
    }

    return best;
  }

  function enabled() {
    return !!state.view.snap;
  }

  /* Snap a moving box. Returns the new position and any guides to draw. */
  function snapMove(obj, x, y) {
    const result = { x: x, y: y, guides: [] };
    if (!enabled()) return result;

    const refsX = [
      { ref: x, offset: 0 },
      { ref: x + obj.w / 2, offset: obj.w / 2 },
      { ref: x + obj.w, offset: obj.w },
    ];
    const refsY = [
      { ref: y, offset: 0 },
      { ref: y + obj.h / 2, offset: obj.h / 2 },
      { ref: y + obj.h, offset: obj.h },
    ];

    /* A snap translates the whole box by the same delta, whichever of its
       reference points lined up. */
    const sx = nearest(refsX, xCandidates(obj.id), true, state.view.gridSize);
    if (sx) {
      result.x = x + sx.delta;
      if (sx.guide) result.guides.push({ axis: "x", value: sx.value });
    }
    const sy = nearest(refsY, yCandidates(obj.id), true, state.view.gridSize);
    if (sy) {
      result.y = y + sy.delta;
      if (sy.guide) result.guides.push({ axis: "y", value: sy.value });
    }
    return result;
  }

  /* Snap the growing corner of a resized box. */
  function snapResize(obj, w, h) {
    const result = { w: w, h: h, guides: [] };
    if (!enabled()) return result;

    const right = obj.x + w;
    const bottom = obj.y + h;
    const refsX = [{ ref: right }];
    const refsY = [{ ref: bottom }];

    const sx = nearest(refsX, xCandidates(obj.id), true, state.view.gridSize);
    if (sx) {
      result.w = right + sx.delta - obj.x;
      if (sx.guide) result.guides.push({ axis: "x", value: sx.value });
    }
    const sy = nearest(refsY, yCandidates(obj.id), true, state.view.gridSize);
    if (sy) {
      result.h = bottom + sy.delta - obj.y;
      if (sy.guide) result.guides.push({ axis: "y", value: sy.value });
    }
    return result;
  }

  function renderGuides(guides) {
    if (!guidesEl) return;
    guidesEl.textContent = "";
    if (!guides || !guides.length) return;
    const p = MN.stage.pxPerUnit();
    for (const guide of guides) {
      const line = core.el("div", { class: "guide " + (guide.axis === "x" ? "v" : "h") });
      if (guide.axis === "x") line.style.left = guide.value * p + "px";
      else line.style.top = guide.value * p + "px";
      guidesEl.appendChild(line);
    }
  }

  function clearGuides() {
    renderGuides([]);
  }

  MN.snap = {
    snapMove: snapMove,
    snapResize: snapResize,
    renderGuides: renderGuides,
    clearGuides: clearGuides,
  };
})(window.MN = window.MN || {});
