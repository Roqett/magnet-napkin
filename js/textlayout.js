/* Magnet Napkin — text layout.
   One measurement, two consumers: the editor draws the lines this returns,
   and the PNG exporter draws the same lines. Neither side re-wraps, so the
   exported text cannot disagree with the screen.

   Measurement happens in canvas units. The measurement context is scaled by
   1/PRECISION so the font is measured large and divided back down, which
   keeps the fractional precision that decides where a line wraps. */
(function (MN) {
  "use strict";

  const core = MN.core;

  const PRECISION = 4;
  const LINE_HEIGHT = 1.2;

  const FONT_STACKS = {
    "system-ui": 'system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
    "Georgia": 'Georgia, "Times New Roman", Times, serif',
    "Menlo": 'Menlo, Consolas, "Courier New", monospace',
    "Avenir Next Condensed": '"Avenir Next Condensed", "Arial Narrow", "Helvetica Neue", sans-serif',
    "Helvetica Neue": '"Helvetica Neue", Helvetica, Arial, sans-serif',
  };

  const FONT_NAMES = Object.keys(FONT_STACKS);

  let measureCtx = null;

  function context() {
    if (!measureCtx) {
      const canvas = document.createElement("canvas");
      canvas.width = 16;
      canvas.height = 16;
      measureCtx = canvas.getContext("2d");
    }
    return measureCtx;
  }

  function stackFor(family) {
    return FONT_STACKS[family] || FONT_STACKS["system-ui"];
  }

  /* The canvas font string for a spec, at a given pixel size. */
  function fontString(spec, pixelSize) {
    const weight = spec.fontWeight || 400;
    return weight + " " + pixelSize + "px " + stackFor(spec.fontFamily);
  }

  /* Wrap text to a width and report the lines and the height.
     All measurements are in canvas units. Accepts `width` or `w`, so an item
     can be passed in directly. */
  function layoutText(spec) {
    const text = spec.text == null ? "" : String(spec.text);
    const fontSize = spec.fontSize > 0 ? spec.fontSize : 12;
    const weight = spec.fontWeight || 400;
    const family = stackFor(spec.fontFamily);
    const rawWidth = spec.width != null ? spec.width : spec.w;
    const width = Math.max(0, rawWidth || 0);
    const ctx = context();

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.font = weight + " " + fontSize * PRECISION + "px " + family;

    const measure = function (value) {
      return ctx.measureText(value).width / PRECISION;
    };

    const lines = [];
    const paragraphs = text.split("\n");
    for (let p = 0; p < paragraphs.length; p += 1) {
      const paragraph = paragraphs[p];
      if (paragraph === "") {
        lines.push({ text: "", width: 0 });
        continue;
      }
      const words = paragraph.split(" ");
      let line = "";
      for (let w = 0; w < words.length; w += 1) {
        const word = words[w];
        const candidate = line === "" ? word : line + " " + word;
        if (width > 0 && line !== "" && measure(candidate) > width) {
          lines.push({ text: line, width: measure(line) });
          line = word;
        } else {
          line = candidate;
        }
      }
      lines.push({ text: line, width: measure(line) });
    }

    const lineHeight = fontSize * LINE_HEIGHT;
    return {
      lines: lines,
      lineHeight: lineHeight,
      height: lines.length * lineHeight,
      fontSize: fontSize,
      fontWeight: weight,
      fontFamily: spec.fontFamily,
      fontStack: family,
      align: spec.align || "left",
      width: width,
    };
  }

  /* The gap the DOM puts between the line box top and the em square top.
     The exporter adds the same gap so the glyphs land in the same place. */
  function halfLeading(layout) {
    return (layout.lineHeight - layout.fontSize) / 2;
  }

  MN.textlayout = {
    layoutText: layoutText,
    fontString: fontString,
    stackFor: stackFor,
    halfLeading: halfLeading,
    FONT_NAMES: FONT_NAMES,
    LINE_HEIGHT: LINE_HEIGHT,
  };
})(window.MN = window.MN || {});
