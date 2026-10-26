/* Napkinetic — export.
   The PNG is drawn from the same item data the editor shows, never from a
   screenshot. Text is drawn from the same measured lines the editor draws,
   so the two cannot disagree.

   Two modes:
     clean     — the design. No notes, no grid, no guides, no selection.
     annotated — the same board with the notes, badge and all, on top. */
(function (MN) {
  "use strict";

  const core = MN.core;
  const S = MN.state;
  const state = S.state;

  const imageCache = new Map();

  function loadImage(url) {
    if (!url) return Promise.resolve(null);
    if (imageCache.has(url)) return imageCache.get(url);
    const promise = new Promise(function (resolve, reject) {
      const img = new Image();
      img.onload = function () { resolve(img); };
      img.onerror = function () { reject(new Error("an image could not be decoded")); };
      img.src = url;
    });
    imageCache.set(url, promise);
    return promise;
  }

  function clearImageCache() {
    imageCache.clear();
  }

  /* ---------- background ---------- */

  function drawBackground(ctx, canvas, scale) {
    const bg = state.canvas.background || { type: "color", value: "#eef0f3" };
    if (bg.type === "image") {
      const asset = S.findAsset(bg.value);
      if (asset && asset.url) {
        return loadImage(asset.url).then(function (img) {
          if (img) ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        });
      }
    }
    if (bg.type === "checker") {
      /* The checker is an editor aid for an empty board. The export uses its
         base colour, so the file is a flat background rather than a pattern. */
      ctx.fillStyle = "#f6f7f9";
    } else {
      ctx.fillStyle = bg.value || "#eef0f3";
    }
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    return Promise.resolve();
  }

  /* ---------- items ---------- */

  function drawImageItem(ctx, item, scale) {
    const asset = S.findAsset(item.assetId);
    if (!asset || !asset.url) return Promise.resolve();
    return loadImage(asset.url).then(function (img) {
      if (!img) return;
      /* object-fit: contain, so the export matches what the editor shows
         when a box does not have the picture's own proportions. */
      const boxAspect = item.w / item.h;
      const imageAspect = asset.width && asset.height ? asset.width / asset.height : boxAspect;
      let dw = item.w;
      let dh = item.h;
      if (imageAspect > boxAspect) dh = item.w / imageAspect;
      else dw = item.h * imageAspect;
      const dx = (item.w - dw) / 2;
      const dy = (item.h - dh) / 2;
      ctx.drawImage(img, dx * scale, dy * scale, dw * scale, dh * scale);
    });
  }

  function drawTextLines(ctx, item, layout, scale, originX, originY) {
    ctx.font = MN.textlayout.fontString(item, item.fontSize * scale);
    /* The alphabetic baseline, placed exactly where the editor's DOM puts
       it, measured by the same helper the editor's layout uses. */
    ctx.textBaseline = "alphabetic";
    ctx.textAlign = "left";
    ctx.fillStyle = item.color || "#111111";
    const baseline = MN.textlayout.baselineOffset(item);
    for (let i = 0; i < layout.lines.length; i += 1) {
      const line = layout.lines[i];
      let x = originX;
      if (layout.align === "center") x = originX + (item.w * scale - line.width * scale) / 2;
      else if (layout.align === "right") x = originX + item.w * scale - line.width * scale;
      const y = originY + (i * layout.lineHeight + baseline) * scale;
      ctx.fillText(line.text, x, y);
    }
  }

  function drawTextItem(ctx, item, scale) {
    const layout = MN.items.layoutOf(item);
    if (item.background && item.background !== "transparent") {
      ctx.fillStyle = item.background;
      ctx.fillRect(0, 0, item.w * scale, item.h * scale);
    }
    drawTextLines(ctx, item, layout, scale, 0, 0);
  }

  /* A rounded rectangle, in the current path. */
  function roundRect(ctx, x, y, w, h, r) {
    const radius = Math.max(0, Math.min(r, w / 2, h / 2));
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.arcTo(x + w, y, x + w, y + h, radius);
    ctx.arcTo(x + w, y + h, x, y + h, radius);
    ctx.arcTo(x, y + h, x, y, radius);
    ctx.arcTo(x, y, x + w, y, radius);
    ctx.closePath();
  }

  /* A shape is a filled, bordered box with the text centred in it. The editor
     draws the same thing with CSS, so the two agree. */
  function drawShape(ctx, item, scale) {
    const spec = MN.items.shapeSpec ? MN.items.shapeSpec(item.shape) : null;
    const w = item.w * scale;
    const h = item.h * scale;
    const borderWidth = (item.borderWidth || 1) * scale;
    const radius = (spec ? spec.radius : 0.1) * item.h * scale;

    ctx.fillStyle = item.fill || (spec ? spec.fill : "#1c1c1c");
    ctx.strokeStyle = item.border || (spec ? spec.border : "#3a3a3a");
    ctx.lineWidth = borderWidth;

    const r = Math.max(0, radius - borderWidth / 2);
    const inset = borderWidth / 2;
    roundRect(ctx, inset, inset, Math.max(0, w - borderWidth), Math.max(0, h - borderWidth), r);
    ctx.fill();
    ctx.stroke();

    if (!item.text) return;

    const layout = MN.items.layoutOf(item);
    const fontSize = (item.fontSize > 0 ? item.fontSize : Math.min(item.h * 0.4, 16));
    ctx.font = MN.textlayout.fontString(item, fontSize * scale);
    ctx.textBaseline = "alphabetic";
    ctx.textAlign = "left";
    ctx.fillStyle = item.color || (spec ? spec.color : "#ededed");

    const blockHeight = layout.lines.length * layout.lineHeight * scale;
    const top = (h - blockHeight) / 2;
    const baseline = MN.textlayout.baselineOffset({
      fontFamily: item.fontFamily,
      fontWeight: item.fontWeight,
      fontSize: fontSize,
    }) * scale;

    for (let i = 0; i < layout.lines.length; i += 1) {
      const line = layout.lines[i];
      const x = (w - line.width * scale) / 2;
      const y = top + i * layout.lineHeight * scale + baseline;
      ctx.fillText(line.text, x, y);
    }
  }

  /* ---------- notes ---------- */

  function drawNote(ctx, note, scale) {
    const NOTE = MN.items.NOTE;
    const layout = MN.items.layoutOf(note);
    const w = note.w * scale;
    const h = note.h * scale;

    ctx.fillStyle = note.background || "#fff3b0";
    ctx.fillRect(0, 0, w, h);

    ctx.setLineDash([4 * scale, 3 * scale]);
    ctx.lineWidth = NOTE.borderWidth * scale;
    ctx.strokeStyle = note.borderColor || "#b08900";
    ctx.strokeRect(ctx.lineWidth / 2, ctx.lineWidth / 2, w - ctx.lineWidth, h - ctx.lineWidth);
    ctx.setLineDash([]);

    drawTextLines(ctx, note, layout, scale, NOTE.pad * scale, NOTE.pad * scale);

    /* The badge: the thing that makes a note impossible to mistake for
       artwork, even without colour. */
    const badgeW = NOTE.badgeW * scale;
    const badgeH = NOTE.badgeH * scale;
    const badgeX = -2 * scale;
    const badgeY = -(badgeH + 1 * scale);
    ctx.fillStyle = "#1c1c1c";
    ctx.fillRect(badgeX, badgeY, badgeW, badgeH);
    ctx.fillStyle = "#fff3b0";
    ctx.font = "700 " + NOTE.badgeFont * scale + "px " + MN.textlayout.stackFor("system-ui");
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(NOTE.badgeText, badgeX + badgeW / 2, badgeY + badgeH / 2);
  }

  /* ---------- the canvas ---------- */

  function drawObject(ctx, obj, scale, isNote) {
    ctx.save();
    ctx.globalAlpha = obj.opacity == null ? 1 : obj.opacity;
    const cx = (obj.x + obj.w / 2) * scale;
    const cy = (obj.y + obj.h / 2) * scale;
    ctx.translate(cx, cy);
    ctx.rotate((obj.rotation || 0) * Math.PI / 180);
    ctx.translate(-obj.w * scale / 2, -obj.h * scale / 2);
    if (isNote) drawNote(ctx, obj, scale);
    else if (obj.kind === "text") drawTextItem(ctx, obj, scale);
    else if (obj.kind === "shape") drawShape(ctx, obj, scale);
    else return drawImageItem(ctx, obj, scale).then(function () { ctx.restore(); });
    ctx.restore();
    return Promise.resolve();
  }

  /* Draw everything in order, awaiting each item so the images are decoded
     before they are painted. The order matters: an opaque image drawn after
     the text would cover it. */
  async function drawAll(ctx, scale, annotated) {
    for (const item of state.items) {
      await drawObject(ctx, item, scale, false);
    }
    if (annotated) {
      for (const note of state.notes) {
        await drawObject(ctx, note, scale, true);
      }
    }
  }

  async function renderCanvas(options) {
    const opts = options || {};
    const tier = opts.tier || 1;
    const scale = state.canvas.scale * tier;

    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(state.canvas.width * scale));
    canvas.height = Math.max(1, Math.round(state.canvas.height * scale));

    const ctx = canvas.getContext("2d");
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";

    if (document.fonts && document.fonts.ready) {
      try { await document.fonts.ready; } catch (err) { /* no font loading API */ }
    }

    await drawBackground(ctx, canvas, scale);
    await drawAll(ctx, scale, !!opts.annotated);
    return canvas;
  }

  function canvasSizeFor(tier) {
    const scale = state.canvas.scale * tier;
    return {
      width: Math.round(state.canvas.width * scale),
      height: Math.round(state.canvas.height * scale),
    };
  }

  async function exportPng(options) {
    const opts = options || {};
    const tier = opts.tier || 1;
    const canvas = await renderCanvas({ tier: tier, annotated: !!opts.annotated });
    const name = opts.filename || (opts.annotated ? "layout-annotated.png" : "layout.png");
    const blob = await new Promise(function (resolve, reject) {
      try {
        canvas.toBlob(function (b) {
          if (b) resolve(b);
          else reject(new Error("the PNG could not be encoded"));
        }, "image/png");
      } catch (err) {
        reject(err);
      }
    });
    core.downloadBlob(blob, name);
    return { name: name, width: canvas.width, height: canvas.height };
  }

  MN.exporter = {
    renderCanvas: renderCanvas,
    exportPng: exportPng,
    canvasSizeFor: canvasSizeFor,
    clearImageCache: clearImageCache,
  };
})(window.MN = window.MN || {});
