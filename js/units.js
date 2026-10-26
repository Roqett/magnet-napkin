/* Napkinetic — units.
   The canvas has a unit (px, pt, mm, in) and a scale: how many pixels one
   canvas unit is worth. Geometry is always stored in canvas units, never in
   screen pixels. */
(function (MN) {
  "use strict";

  const UNITS = {
    px: { label: "px", perInch: 96, defaultScale: 1, step: 1, defaultGrid: 10 },
    pt: { label: "pt", perInch: 72, defaultScale: 2, step: 0.5, defaultGrid: 4 },
    mm: { label: "mm", perInch: 25.4, defaultScale: 96 / 25.4, step: 0.5, defaultGrid: 1 },
    in: { label: "in", perInch: 1, defaultScale: 96, step: 0.0625, defaultGrid: 0.25 },
  };

  function unitOf(name) {
    return UNITS[name] || UNITS.px;
  }

  /* Format a value in the canvas unit without trailing noise. */
  function format(value, unit) {
    const u = unitOf(unit);
    const dp = u.step >= 1 ? 0 : u.step >= 0.1 ? 1 : 3;
    return MN.core.fmtNum(value, dp) + " " + u.label;
  }

  /* The same value in pixels, for the small secondary label in the inspector. */
  function toPixels(value, scale) {
    return value * scale;
  }

  /* A "nice" ruler step: 1, 2, 5, 10, 25, 50, 100 ... scaled into the unit. */
  function tickStep(unit, pixelsPerUnit) {
    const u = unitOf(unit);
    const candidates = [1, 2, 5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000];
    const base = u.step;
    for (const c of candidates) {
      const step = base * c;
      if (step * pixelsPerUnit >= 56) return step;
    }
    return base * 10000;
  }

  MN.units = { UNITS, unitOf, format, toPixels, tickStep };
})(window.MN = window.MN || {});
