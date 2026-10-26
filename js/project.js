/* Magnet Napkin — projects and persistence.
   The board lives in two places: IndexedDB for autosave (blobs and layout),
   and a .napkin.json file for saving and sharing.

   Chrome blocks IndexedDB on file:// URLs, so autosave is feature detected.
   Without it the app still works end to end; it just cannot remember the
   board, and it says so rather than pretending. */
(function (MN) {
  "use strict";

  const core = MN.core;
  const S = MN.state;
  const state = S.state;

  const FORMAT = "magnet-napkin/v1";
  const DB_NAME = "magnet-napkin";
  const DB_VERSION = 1;
  const STORE_PROJECT = "project";
  const STORE_BLOBS = "blobs";
  const CURRENT = "current";

  let dbPromise = null;
  let autosaveTimer = null;
  let lastError = null;

  /* ---------- IndexedDB ---------- */

  function openDb() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise(function (resolve, reject) {
      let request;
      try {
        request = window.indexedDB.open(DB_NAME, DB_VERSION);
      } catch (err) {
        reject(err);
        return;
      }
      request.onupgradeneeded = function () {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE_PROJECT)) db.createObjectStore(STORE_PROJECT);
        if (!db.objectStoreNames.contains(STORE_BLOBS)) db.createObjectStore(STORE_BLOBS);
      };
      request.onsuccess = function () { resolve(request.result); };
      request.onerror = function () { reject(request.error || new Error("IndexedDB is unavailable")); };
      request.onblocked = function () { reject(new Error("IndexedDB is blocked")); };
    });
    return dbPromise;
  }

  function withStore(name, mode, work) {
    return openDb().then(function (db) {
      return new Promise(function (resolve, reject) {
        const tx = db.transaction(name, mode);
        const store = tx.objectStore(name);
        let result;
        try {
          const request = work(store);
          if (request) request.onsuccess = function () { result = request.result; };
        } catch (err) {
          reject(err);
          return;
        }
        tx.oncomplete = function () { resolve(result); };
        tx.onerror = function () { reject(tx.error); };
        tx.onabort = function () { reject(tx.error); };
      });
    });
  }

  function idbGet(name, key) {
    return withStore(name, "readonly", function (store) { return store.get(key); });
  }

  function idbPut(name, key, value) {
    return withStore(name, "readwrite", function (store) { return store.put(value, key); });
  }

  function idbDelete(name, key) {
    return withStore(name, "readwrite", function (store) { return store.delete(key); });
  }

  function idbClear(name) {
    return withStore(name, "readwrite", function (store) { return store.clear(); });
  }

  /* ---------- the document ---------- */

  function blobToDataUrl(blob) {
    return new Promise(function (resolve, reject) {
      const reader = new FileReader();
      reader.onload = function () { resolve(reader.result); };
      reader.onerror = function () { reject(reader.error); };
      reader.readAsDataURL(blob);
    });
  }

  function dataUrlToBlob(dataUrl) {
    const parts = String(dataUrl).split(",");
    const mime = (/:(.*?);/.exec(parts[0]) || [null, "application/octet-stream"])[1];
    const binary = atob(parts[1] || "");
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    return new Blob([bytes], { type: mime });
  }

  /* The document is the state, minus the things that are not part of the
     format: the live blobs and the internal marker on notes. */
  function documentOf(options) {
    const opts = options || {};
    return {
      format: FORMAT,
      name: state.projectName || "Magnet Napkin board",
      canvas: core.clone(state.canvas),
      assets: state.assets.map(function (asset) {
        const out = {
          id: asset.id,
          name: asset.name,
          path: asset.path,
          mime: asset.mime,
          width: asset.width,
          height: asset.height,
          embedded: false,
        };
        return out;
      }),
      items: state.items.map(function (item) { return core.clone(item); }),
      notes: state.notes.map(function (note) {
        const out = core.clone(note);
        delete out.kind;
        return out;
      }),
    };
  }

  /* Embedding the images makes the file portable but large. Off by default. */
  async function documentWithImages() {
    const doc = documentOf();
    for (let i = 0; i < doc.assets.length; i += 1) {
      const asset = state.assets[i];
      if (!asset || !asset.blob) continue;
      doc.assets[i].embedded = true;
      doc.assets[i].data = await blobToDataUrl(asset.blob);
    }
    return doc;
  }

  /* ---------- validation ---------- */

  function clampNumber(value, fallback, lo, hi) {
    const n = Number(value);
    if (!isFinite(n)) return fallback;
    return core.clamp(n, lo, hi);
  }

  function normaliseItem(raw) {
    if (!raw || typeof raw !== "object") return null;
    const kind = raw.kind === "text" ? "text" : "image";
    const item = {
      id: typeof raw.id === "string" && raw.id ? raw.id : core.uid("i"),
      kind: kind,
      x: clampNumber(raw.x, 0, -1e6, 1e6),
      y: clampNumber(raw.y, 0, -1e6, 1e6),
      w: Math.max(1, clampNumber(raw.w, 20, 0.01, 1e6)),
      h: Math.max(1, clampNumber(raw.h, 20, 0.01, 1e6)),
      rotation: clampNumber(raw.rotation, 0, -3600, 3600),
      opacity: clampNumber(raw.opacity, 1, 0, 1),
      locked: !!raw.locked,
    };
    if (kind === "image") {
      item.assetId = typeof raw.assetId === "string" ? raw.assetId : null;
    } else {
      item.text = typeof raw.text === "string" ? raw.text : "";
      item.fontFamily = typeof raw.fontFamily === "string" ? raw.fontFamily : "system-ui";
      item.fontSize = clampNumber(raw.fontSize, 12, 0.5, 1000);
      item.fontWeight = clampNumber(raw.fontWeight, 400, 100, 900);
      item.color = typeof raw.color === "string" ? raw.color : "#111111";
      item.background = typeof raw.background === "string" ? raw.background : "transparent";
      item.align = ["left", "center", "right"].indexOf(raw.align) >= 0 ? raw.align : "left";
      item.autoHeight = raw.autoHeight !== false;
    }
    return item;
  }

  function normaliseNote(raw) {
    if (!raw || typeof raw !== "object") return null;
    const note = {
      id: typeof raw.id === "string" && raw.id ? raw.id : core.uid("n"),
      kind: "note",
      text: typeof raw.text === "string" ? raw.text : "",
      x: clampNumber(raw.x, 0, -1e6, 1e6),
      y: clampNumber(raw.y, 0, -1e6, 1e6),
      w: Math.max(1, clampNumber(raw.w, 140, 1, 1e6)),
      h: Math.max(1, clampNumber(raw.h, 48, 1, 1e6)),
      rotation: clampNumber(raw.rotation, 0, -3600, 3600),
      opacity: clampNumber(raw.opacity, 1, 0, 1),
      locked: !!raw.locked,
      fontFamily: typeof raw.fontFamily === "string" ? raw.fontFamily : "system-ui",
      fontSize: clampNumber(raw.fontSize, 11, 0.5, 1000),
      fontWeight: clampNumber(raw.fontWeight, 400, 100, 900),
      color: typeof raw.color === "string" ? raw.color : "#1c1c1c",
      background: typeof raw.background === "string" ? raw.background : "#fff3b0",
      border: typeof raw.border === "string" ? raw.border : "dashed",
      borderColor: typeof raw.borderColor === "string" ? raw.borderColor : "#b08900",
      align: ["left", "center", "right"].indexOf(raw.align) >= 0 ? raw.align : "left",
      autoHeight: raw.autoHeight !== false,
      includeInCleanPNG: false,
      targetId: typeof raw.targetId === "string" ? raw.targetId : null,
    };
    return note;
  }

  function normaliseCanvas(raw) {
    const base = core.clone(S.DEFAULT_CANVAS);
    if (!raw || typeof raw !== "object") return base;
    base.width = Math.max(0.01, clampNumber(raw.width, base.width, 0.01, 1e6));
    base.height = Math.max(0.01, clampNumber(raw.height, base.height, 0.01, 1e6));
    if (MN.units.UNITS[raw.unit]) base.unit = raw.unit;
    base.scale = Math.max(0.0001, clampNumber(raw.scale, base.scale, 0.0001, 10000));
    if (raw.background && typeof raw.background === "object") {
      const type = ["checker", "color", "image"].indexOf(raw.background.type) >= 0
        ? raw.background.type
        : "checker";
      base.background = {
        type: type,
        value: typeof raw.background.value === "string" ? raw.background.value : "#eef0f3",
      };
    }
    return base;
  }

  /* ---------- loading a document into the board ---------- */

  function missingAssetsOf(restored) {
    return restored.filter(function (asset) { return asset.missing; });
  }

  async function loadDocument(doc, options) {
    const opts = options || {};
    if (!doc || typeof doc !== "object") throw new Error("That file is not a Magnet Napkin project.");
    if (doc.format !== FORMAT) {
      throw new Error("Unknown format: " + (doc.format || "none") + ". Expected " + FORMAT + ".");
    }

    /* A restore must never land on top of work the user has already done
       while the stored project was being read. */
    if (opts.restore && (state.items.length || state.notes.length || state.assets.length)) {
      return { missing: [], skipped: true };
    }

    /* Assets already in the tray keep their blobs; assets in the file that
       are embedded are decoded; the rest are reported as missing. */
    const existing = new Map();
    for (const asset of state.assets) existing.set(asset.id, asset);

    /* Assets prepared by the caller (the autosave restore path) carry their
       blob with them and are taken as they are. */
    const prepared = new Map();
    if (opts.assets) {
      for (const asset of opts.assets) prepared.set(asset.id, asset);
    }

    const restored = [];
    for (const raw of doc.assets || []) {
      const id = typeof raw.id === "string" ? raw.id : core.uid("a");
      if (prepared.has(id)) {
        restored.push(prepared.get(id));
        continue;
      }
      if (existing.has(id)) {
        restored.push(existing.get(id));
        continue;
      }
      const url = raw.embedded && typeof raw.data === "string"
        ? URL.createObjectURL(dataUrlToBlob(raw.data))
        : null;
      restored.push({
        id: id,
        name: typeof raw.name === "string" ? raw.name : "Missing image",
        path: typeof raw.path === "string" ? raw.path : (raw.name || ""),
        mime: typeof raw.mime === "string" ? raw.mime : "image/png",
        width: Math.max(0, clampNumber(raw.width, 0, 0, 1e6)),
        height: Math.max(0, clampNumber(raw.height, 0, 0, 1e6)),
        blob: null,
        url: url,
        missing: !url,
      });
    }

    state.assets = restored;
    state.canvas = normaliseCanvas(doc.canvas);
    state.items = (doc.items || []).map(normaliseItem).filter(Boolean);
    state.notes = (doc.notes || []).map(normaliseNote).filter(Boolean);
    state.projectName = typeof doc.name === "string" ? doc.name : "Magnet Napkin board";
    state.selection = null;

    S.resetHistory();
    S.emit("change", { label: "open project" });
    MN.assets.renderTray();
    MN.stage.applyView();

    const missing = missingAssetsOf(restored);
    if (missing.length && !opts.silent) MN.project.showMissing(missing);
    return { missing: missing };
  }

  /* ---------- saving and opening files ---------- */

  async function saveFile(embedImages) {
    const doc = embedImages ? await documentWithImages() : documentOf();
    const text = JSON.stringify(doc, null, 2);
    const name = (state.projectName || "board").replace(/[^\w.-]+/g, "-").toLowerCase() + ".napkin.json";
    core.downloadText(text, name, "application/json");
    MN.app.setStatus("Saved " + name + (embedImages ? " with images" : " without images") +
      " · " + doc.assets.length + " asset" + (doc.assets.length === 1 ? "" : "s") + " referenced.");
  }

  async function openFile(file) {
    let doc;
    try {
      doc = JSON.parse(await file.text());
    } catch (err) {
      throw new Error("That file could not be read as JSON.");
    }
    return loadDocument(doc);
  }

  /* ---------- autosave ---------- */

  async function persist() {
    const doc = documentOf();
    await idbPut(STORE_PROJECT, CURRENT, doc);
    for (const asset of state.assets) {
      if (asset.blob) await idbPut(STORE_BLOBS, asset.id, asset.blob);
    }
    /* Blobs of assets that are gone. */
    const live = new Set(state.assets.map(function (a) { return a.id; }));
    const keys = await withStore(STORE_BLOBS, "readonly", function (store) { return store.getAllKeys(); });
    for (const key of keys || []) {
      if (!live.has(key)) await idbDelete(STORE_BLOBS, key);
    }
  }

  function scheduleAutosave() {
    if (autosaveTimer) clearTimeout(autosaveTimer);
    autosaveTimer = setTimeout(function () {
      autosaveTimer = null;
      if (MN.interact.isDragging()) {
        scheduleAutosave();
        return;
      }
      persist().catch(function (err) {
        lastError = err;
        showStorageWarning(err);
      });
    }, 500);
  }

  async function restoreProject() {
    const doc = await idbGet(STORE_PROJECT, CURRENT);
    if (!doc) return false;

    /* If the board was touched while the stored project was being read —
       a big folder of images takes a moment — the restore is dropped rather
       than allowed to wipe what the user just did. */
    if (state.items.length || state.notes.length || state.assets.length) return false;

    const assets = [];
    for (const raw of doc.assets || []) {
      const id = typeof raw.id === "string" ? raw.id : core.uid("a");
      let blob = null;
      try {
        blob = await idbGet(STORE_BLOBS, id);
      } catch (err) {
        blob = null;
      }
      assets.push({
        id: id,
        name: typeof raw.name === "string" ? raw.name : "image",
        path: typeof raw.path === "string" ? raw.path : (raw.name || ""),
        mime: typeof raw.mime === "string" ? raw.mime : "image/png",
        width: Math.max(0, clampNumber(raw.width, 0, 0, 1e6)),
        height: Math.max(0, clampNumber(raw.height, 0, 0, 1e6)),
        blob: blob,
        url: blob ? URL.createObjectURL(blob) : null,
        missing: !blob,
      });
    }
    const restored = Object.assign({}, doc, { assets: assets });
    await loadDocument(restored, { silent: true, assets: assets, restore: true });
    return true;
  }

  async function clearStored() {
    await idbClear(STORE_PROJECT);
    await idbClear(STORE_BLOBS);
  }

  /* ---------- the storage warning ---------- */

  let warned = false;

  function showStorageWarning(err) {
    if (warned) return;
    warned = true;
    const banner = core.$("#storage-warning");
    if (!banner) return;
    banner.hidden = false;
    const detail = core.$("#storage-warning-detail");
    if (detail) {
      detail.textContent = location.protocol === "file:"
        ? "This page is open from disk, and Chrome does not allow IndexedDB there, so the board cannot be remembered between visits. Everything else works. Run ./serve.sh and open http://localhost:8123/ for autosave, or use Save to keep a .napkin.json file."
        : "Autosave is not available in this browser (" + (err && err.message ? err.message : "unknown error") + "). Use Save to keep a .napkin.json file.";
    }
  }

  /* ---------- missing assets ---------- */

  let pendingMissing = [];

  function showMissing(missing) {
    pendingMissing = missing || [];
    const dialog = core.$("#missing-dialog");
    const list = core.$("#missing-list");
    if (!dialog || !list) return;
    list.textContent = "";
    for (const asset of pendingMissing) {
      list.appendChild(core.el("li", { text: asset.path || asset.name }));
    }
    if (typeof dialog.showModal === "function") dialog.showModal();
  }

  function relink(assets) {
    /* Match the missing assets to the files just imported, by file name. */
    const byName = new Map();
    for (const asset of state.assets) {
      if (asset.blob) byName.set(asset.name.toLowerCase(), asset);
    }
    let linked = 0;
    for (const missing of assets) {
      const found = byName.get(String(missing.name || "").toLowerCase());
      if (!found) continue;
      missing.blob = found.blob;
      missing.url = found.url;
      missing.missing = false;
      linked += 1;
    }
    if (linked) {
      S.emit("change", { label: "relink assets" });
      MN.app.setStatus(linked + " asset" + (linked === 1 ? "" : "s") + " relinked.");
    }
    return linked;
  }

  /* ---------- boot ---------- */

  async function boot() {
    let restored = false;
    try {
      restored = await restoreProject();
    } catch (err) {
      showStorageWarning(err);
    }
    if (restored) {
      MN.assets.renderTray();
      MN.stage.applyView();
      MN.app.setStatus("Restored your last board from this browser.");
    }
    S.on("change", function () {
      scheduleAutosave();
    });

    /* When a folder arrives after a project was opened, try to match the
       files that were missing. */
    S.on("assets-imported", function () {
      if (!pendingMissing.length) return;
      const linked = relink(pendingMissing);
      pendingMissing = pendingMissing.filter(function (asset) { return asset.missing; });
      if (linked) {
        const dialog = core.$("#missing-dialog");
        if (dialog && dialog.open) dialog.close();
      }
    });

    if (location.protocol === "file:") {
      /* Chrome cannot autosave here. Check whether IndexedDB really works
         before saying so. */
      try {
        await openDb();
      } catch (err) {
        showStorageWarning(err);
      }
    }
  }

  MN.project = {
    FORMAT: FORMAT,
    boot: boot,
    documentOf: documentOf,
    documentWithImages: documentWithImages,
    loadDocument: loadDocument,
    openFile: openFile,
    saveFile: saveFile,
    clearStored: clearStored,
    showMissing: showMissing,
    relink: relink,
    scheduleAutosave: scheduleAutosave,
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})(window.MN = window.MN || {});
