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

  /* How close, in screen pixels, an edge has to be to line up. */
  const THRESHOLD_PX = 6;
  /* How close, in screen pixels, the two gaps have to be to count as equal.
     Wider than the alignment threshold: equalising the gaps moves the item
     further, so it needs more room before it is worth doing. */
  const SPACING_PX = 20;

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
  function nearest(refs, candidates) {
    const t = threshold();
    let best = null;

    for (const candidate of candidates) {
      for (const ref of refs) {
        const delta = candidate.value - ref.ref;
        if (Math.abs(delta) <= t && (!best || Math.abs(delta) < Math.abs(best.delta) - 0.001)) {
          best = { delta: delta, value: candidate.value, guide: candidate.guide };
        }
      }
    }

    return best;
  }

  /* The grid, as a last resort. */
  function gridSnap(value, gridSize) {
    if (!gridSize || gridSize <= 0) return null;
    return Math.round(value / gridSize) * gridSize;
  }

  function enabled() {
    return !!state.view.snap;
  }

  /* Snap a moving box. Returns the new position and any guides to draw. */
  /* ---------- equal spacing ----------
     The gap to the nearest neighbour on each side snaps equal, the way a
     hand layout wants it and a spreadsheet cannot give it. */

  /* The nearest neighbour on each side, counting only those that overlap on
     the other axis. Two canvas units of margin, so a neighbour that just
     touches the corner does not count. */
  function neighbours(obj, x, y, excludeId) {
    const found = { left: null, right: null, above: null, below: null };
    for (const other of others(excludeId)) {
      const row = other.y < y + obj.h - 2 && other.y + other.h > y + 2;
      if (row) {
        if (other.x + other.w <= x + 1) {
          if (!found.left || other.x + other.w > found.left.x + found.left.w) found.left = other;
        } else if (other.x >= x + obj.w - 1) {
          if (!found.right || other.x < found.right.x) found.right = other;
        }
      }
      const column = other.x < x + obj.w - 2 && other.x + other.w > x + 2;
      if (column) {
        if (other.y + other.h <= y + 1) {
          if (!found.above || other.y + other.h > found.above.y + found.above.h) found.above = other;
        } else if (other.y >= y + obj.h - 1) {
          if (!found.below || other.y < found.below.y) found.below = other;
        }
      }
    }
    return found;
  }

  /* The equal spacing snap for both axes. `dx`/`dy` are the deltas; the
     neighbours come back with them so the spans can be drawn from the final
     geometry rather than from a candidate position. */
  function spacingSnap(obj, x, y, excludeId) {
    const result = { x: null, y: null };
    if (!enabled()) return result;
    const found = neighbours(obj, x, y, excludeId);
    const tolerance = SPACING_PX / MN.stage.pxPerUnit();

    if (found.left && found.right) {
      const leftGap = x - (found.left.x + found.left.w);
      const rightGap = found.right.x - (x + obj.w);
      if (leftGap > 0 && rightGap > 0 && Math.abs(leftGap - rightGap) <= tolerance) {
        result.x = {
          dx: (rightGap - leftGap) / 2,
          left: found.left,
          right: found.right,
          gap: (leftGap + rightGap) / 2,
        };
      }
    }

    if (found.above && found.below) {
      const aboveGap = y - (found.above.y + found.above.h);
      const belowGap = found.below.y - (y + obj.h);
      if (aboveGap > 0 && belowGap > 0 && Math.abs(belowGap - aboveGap) <= tolerance) {
        result.y = {
          dy: (belowGap - aboveGap) / 2,
          above: found.above,
          below: found.below,
          gap: (aboveGap + belowGap) / 2,
        };
      }
    }

    return result;
  }

  /* The gap, written the way it should be read. */
  function gapLabel(gap) {
    const unit = state.canvas.unit;
    const value = (unit === "px" || unit === "pt") ? Math.round(gap) : Math.round(gap * 10) / 10;
    return unit === "px" ? String(value) : value + " " + unit;
  }

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
       reference points lined up.

       Priority per axis: alignment, then equal spacing, then the grid. If
       alignment found something, spacing is not considered on that axis —
       otherwise the two systems fight each other. */
    const sx = nearest(refsX, xCandidates(obj.id));
    if (sx) {
      result.x = x + sx.delta;
      if (sx.guide) result.guides.push({ kind: "line", axis: "x", value: sx.value });
    } else {
      /* Alignment had nothing to say, so try to make the gaps equal. */
      const spacing = spacingSnap(obj, x, y, obj.id);
      if (spacing.x) {
        result.x = x + spacing.x.dx;
        result.guides.push({
          kind: "span", axis: "x",
          left: spacing.x.left, right: spacing.x.right, gap: spacing.x.gap,
        });
      } else {
        const grid = gridSnap(x, state.view.gridSize);
        if (grid !== null) result.x = grid;
      }
    }

    /* Y is settled after X, so the column detection uses the final x. */
    const sy = nearest(refsY, yCandidates(obj.id));
    if (sy) {
      result.y = y + sy.delta;
      if (sy.guide) result.guides.push({ kind: "line", axis: "y", value: sy.value });
    } else {
      const spacing = spacingSnap(obj, result.x, y, obj.id);
      if (spacing.y) {
        result.y = y + spacing.y.dy;
        result.guides.push({
          kind: "span", axis: "y",
          above: spacing.y.above, below: spacing.y.below, gap: spacing.y.gap,
        });
      } else {
        const grid = gridSnap(y, state.view.gridSize);
        if (grid !== null) result.y = grid;
      }
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

    const sx = nearest(refsX, xCandidates(obj.id));
    if (sx) {
      result.w = right + sx.delta - obj.x;
      if (sx.guide) result.guides.push({ kind: "line", axis: "x", value: sx.value });
    } else {
      const grid = gridSnap(right, state.view.gridSize);
      if (grid !== null) result.w = grid - obj.x;
    }
    const sy = nearest(refsY, yCandidates(obj.id));
    if (sy) {
      result.h = bottom + sy.delta - obj.y;
      if (sy.guide) result.guides.push({ kind: "line", axis: "y", value: sy.value });
    } else {
      const grid = gridSnap(bottom, state.view.gridSize);
      if (grid !== null) result.h = grid - obj.y;
    }
    return result;
  }

  /* Draw the guides. The spans are drawn from the item's final position, so
     the label and the thing it measures always agree. */
  function renderGuides(guides, item) {
    if (!guidesEl) return;
    guidesEl.textContent = "";
    if (!guides || !guides.length) return;
    const p = MN.stage.pxPerUnit();

    for (const guide of guides) {
      if (guide.kind === "span") {
        renderSpan(guide, item, p);
        continue;
      }
      const line = core.el("div", { class: "guide " + (guide.axis === "x" ? "v" : "h") });
      if (guide.axis === "x") line.style.left = guide.value * p + "px";
      else line.style.top = guide.value * p + "px";
      guidesEl.appendChild(line);
    }
  }

  /* One gap between the item and its neighbour on each side, with the
     distance printed on it. */
  function renderSpan(guide, item, p) {
    if (!item) return;
    const label = gapLabel(guide.gap);
    const spans = [];

    if (guide.axis === "x") {
      const y = item.y + item.h / 2;
      const leftEnd = guide.left.x + guide.left.w;
      const rightStart = guide.right.x;
      spans.push({ from: leftEnd, to: item.x, at: y });
      spans.push({ from: item.x + item.w, to: rightStart, at: y });
    } else {
      const x = item.x + item.w / 2;
      const aboveEnd = guide.above.y + guide.above.h;
      const belowStart = guide.below.y;
      spans.push({ from: aboveEnd, to: item.y, at: x });
      spans.push({ from: item.y + item.h, to: belowStart, at: x });
    }

    for (const span of spans) {
      const length = span.to - span.from;
      if (length < 0) continue;
      const line = core.el("div", { class: "guide-span" });
      if (guide.axis === "x") {
        line.style.left = span.from * p + "px";
        line.style.top = span.at * p + "px";
        line.style.width = length * p + "px";
        line.style.height = "1px";
      } else {
        line.style.top = span.from * p + "px";
        line.style.left = span.at * p + "px";
        line.style.width = "1px";
        line.style.height = length * p + "px";
      }
      guidesEl.appendChild(line);

      const chip = core.el("div", { class: "guide-chip", text: label });
      if (guide.axis === "x") {
        chip.style.left = ((span.from + span.to) / 2) * p + "px";
        chip.style.top = span.at * p + "px";
        chip.style.transform = "translate(-50%, -50%)";
      } else {
        chip.style.left = (span.at + 14 / p) * p + "px";
        chip.style.top = ((span.from + span.to) / 2) * p + "px";
        chip.style.transform = "translate(-50%, -50%)";
      }
      guidesEl.appendChild(chip);
    }
  }

  function clearGuides() {
    renderGuides([]);
  }

  MN.snap = {
    snapMove: snapMove,
    snapResize: snapResize,
    spacingSnap: spacingSnap,
    gapLabel: gapLabel,
    renderGuides: renderGuides,
    clearGuides: clearGuides,
  };
})(window.MN = window.MN || {});
