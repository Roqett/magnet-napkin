/* Napkinetic — projects and persistence.
   The board is the work, so the store has to survive more than one tab.

   The rules this file exists to keep:
     1. A tab that has not edited anything never writes a layout.
     2. An empty board never overwrites a populated one.
     3. If another tab saved something newer, this tab stops and asks
        instead of winning by being last.
     4. Every write leaves a versioned snapshot behind, so a lost board can
        be recovered rather than mourned.

   Storage layout (IndexedDB):
     project  "CURRENT"  the layout document, with a revision number
     history  auto       { id, at, label, itemCount, noteCount, doc }
     view     "view"     zoom, grid, asset ratio, underlay — not the layout
     blobs    asset id   the image files
*/
(function (MN) {
  "use strict";

  const core = MN.core;
  const S = MN.state;
  const state = S.state;

  const FORMAT = "napkinetic/v1";
  const DB_MAIN = "napkinetic";
  const DB_META = "napkinetic-meta";
  const STORE_PROJECT = "project";
  const STORE_HISTORY = "history";
  const STORE_VIEW = "view";
  const STORE_BLOBS = "blobs";
  const CURRENT = "CURRENT";
  const VIEW_KEY = "view";
  const HISTORY_LIMIT = 50;
  const HISTORY_BYTES = 8 * 1024 * 1024;
  const ROLLING_INTERVAL = 60000;
  const CHANNEL = "napkinetic";

  /* Every tab gets an identity, so a message from another tab is never
     mistaken for our own. */
  const tabId = core.uid("tab");

  let autosaveTimer = null;
  let rollingTimer = null;
  let loadedRev = 0;       // the revision this tab last read or wrote
  let layoutDirty = false; // this tab has made a layout change
  let viewDirty = false;   // this tab has changed the view only
  let otherTabUpdated = false;
  let conflict = null;     // { rev, at, itemCount } when another tab is newer
  let lastSaveAt = 0;
  let warned = false;
  let channel = null;

  /* ---------- IndexedDB ----------
     The project and its blobs live in one database; the history and the view
     state live in another. That is not tidiness for its own sake: raising the
     version of a database blocks every other tab that still holds it open,
     and a blocked upgrade leaves those tabs unable to read or write at all.
     Keeping the new stores in a fresh database means no existing tab can ever
     be stranded by a migration. */

  const dbPromises = {};

  function openDb(name, stores) {
    if (dbPromises[name]) return dbPromises[name];
    dbPromises[name] = new Promise(function (resolve, reject) {
      let request;
      try {
        request = window.indexedDB.open(name);
      } catch (err) {
        reject(err);
        return;
      }
      /* A database that is being deleted, or a version change that another
         tab is blocking, can leave the request hanging for ever. The board
         still works without a store, so give up rather than wait. */
      const timer = setTimeout(function () {
        reject(new Error("The database did not respond"));
      }, 8000);
      request.onupgradeneeded = function () {
        const db = request.result;
        for (const store of stores) {
          if (store.keyPath) {
            if (!db.objectStoreNames.contains(store.name)) {
              db.createObjectStore(store.name, { keyPath: store.keyPath });
            }
          } else if (!db.objectStoreNames.contains(store.name)) {
            db.createObjectStore(store.name);
          }
        }
      };
      request.onsuccess = function () {
        clearTimeout(timer);
        resolve(request.result);
      };
      request.onerror = function () {
        clearTimeout(timer);
        reject(request.error || new Error("IndexedDB is unavailable"));
      };
      request.onblocked = function () {
        clearTimeout(timer);
        reject(new Error("IndexedDB is blocked by another tab"));
      };
    }).catch(function (err) {
      /* A database left at a higher version by an older build cannot be
         opened with our version number. Open it as it is and use the stores
         that are there. */
      return new Promise(function (resolve, reject) {
        let request;
        try {
          request = window.indexedDB.open(name);
        } catch (err2) {
          reject(err2);
          return;
        }
        const timer = setTimeout(function () {
          reject(new Error("The database did not respond"));
        }, 8000);
        request.onupgradeneeded = function () {
          const db = request.result;
          for (const store of stores) {
            if (store.keyPath) {
              if (!db.objectStoreNames.contains(store.name)) db.createObjectStore(store.name, { keyPath: store.keyPath });
            } else if (!db.objectStoreNames.contains(store.name)) {
              db.createObjectStore(store.name);
            }
          }
        };
        request.onsuccess = function () {
          clearTimeout(timer);
          resolve(request.result);
        };
        request.onerror = function () {
          clearTimeout(timer);
          reject(request.error || new Error("IndexedDB is unavailable"));
        };
        request.onblocked = function () {
          clearTimeout(timer);
          reject(new Error("IndexedDB is blocked by another tab"));
        };
      });
    });
    return dbPromises[name];
  }

  const MAIN_STORES = [{ name: STORE_PROJECT }, { name: STORE_BLOBS }];
  const META_STORES = [{ name: STORE_HISTORY, keyPath: "id" }, { name: STORE_VIEW }];

  function withStore(dbName, name, mode, work) {
    return openDb(dbName, dbName === DB_META ? META_STORES : MAIN_STORES).then(function (db) {
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

  function idbGet(dbName, name, key) {
    return withStore(dbName, name, "readonly", function (store) { return store.get(key); });
  }

  function idbPut(dbName, name, key, value) {
    return withStore(dbName, name, "readwrite", function (store) { return store.put(value, key); });
  }

  /* For stores with a key path: the record carries its own key. */
  function idbPutRecord(dbName, name, record) {
    return withStore(dbName, name, "readwrite", function (store) { return store.put(record); });
  }

  function idbDelete(dbName, name, key) {
    return withStore(dbName, name, "readwrite", function (store) { return store.delete(key); });
  }

  function idbClear(dbName, name) {
    return withStore(dbName, name, "readwrite", function (store) { return store.clear(); });
  }

  function idbAll(dbName, name) {
    return withStore(dbName, name, "readonly", function (store) { return store.getAll(); });
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

  /* The layout document. The underlay is view state, so it is kept out of
     the layout that gets written on every commit. */
  function documentOf(options) {
    const opts = options || {};
    const canvas = core.clone(state.canvas);
    const underlay = canvas.underlay || { assetId: null, opacity: 0.25 };
    delete canvas.underlay;
    return {
      format: FORMAT,
      name: state.projectName || "Napkinetic board",
      canvas: canvas,
      assets: state.assets.map(function (asset) {
        return {
          id: asset.id,
          name: asset.name,
          path: asset.path,
          mime: asset.mime,
          width: asset.width,
          height: asset.height,
          embedded: false,
        };
      }),
      items: state.items.map(function (item) { return core.clone(item); }),
      notes: state.notes.map(function (note) {
        const out = core.clone(note);
        delete out.kind;
        return out;
      }),
      view: opts.withView ? viewOf() : undefined,
    };
  }

  /* The exported project file: the layout, plus the view state merged in so
     the file carries the underlay with it. */
  function exportDocument(options) {
    const opts = options || {};
    const doc = documentOf();
    doc.canvas.underlay = core.clone(state.canvas.underlay || { assetId: null, opacity: 0.25 });
    return doc;
  }

  async function documentWithImages() {
    const doc = exportDocument();
    for (let i = 0; i < doc.assets.length; i += 1) {
      const asset = state.assets[i];
      if (!asset || !asset.blob) continue;
      doc.assets[i].embedded = true;
      doc.assets[i].data = await blobToDataUrl(asset.blob);
    }
    return doc;
  }

  /* ---------- view state ---------- */

  function viewOf() {
    return {
      zoom: state.view.zoom,
      grid: state.view.grid,
      snap: state.view.snap,
      aspect: state.view.aspect,
      gridSize: state.view.gridSize,
      assetScale: state.view.assetScale,
      underlay: core.clone(state.canvas.underlay || { assetId: null, opacity: 0.25 }),
    };
  }

  function applyViewState(view) {
    if (!view || typeof view !== "object") return;
    if (typeof view.zoom === "number") state.view.zoom = view.zoom;
    if (typeof view.grid === "boolean") state.view.grid = view.grid;
    if (typeof view.snap === "boolean") state.view.snap = view.snap;
    if (typeof view.aspect === "boolean") state.view.aspect = view.aspect;
    if (typeof view.gridSize === "number") state.view.gridSize = view.gridSize;
    if (typeof view.assetScale === "number") state.view.assetScale = view.assetScale;
    if (view.underlay) state.canvas.underlay = core.clone(view.underlay);
  }

  function writeView() {
    if (!viewDirty) return Promise.resolve();
    viewDirty = false;
    return idbPut(DB_META, STORE_VIEW, VIEW_KEY, viewOf()).then(function () {
      /* A view save is still a save, and the other tabs should know. It
         carries no revision, so it can never be a conflict. */
      broadcast({ type: "saved", kind: "view" });
    }).catch(function () { /* the layout matters more */ });
  }

  /* Something changed that is only about how the board is being looked at. */
  function touchView() {
    viewDirty = true;
    scheduleAutosave();
  }

  /* ---------- history ---------- */

  function historyEntry(doc, label) {
    return {
      id: "h-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 7),
      at: Date.now(),
      label: label || "edit",
      itemCount: doc.items.length,
      noteCount: doc.notes.length,
      doc: doc,
    };
  }

  async function writeHistory(doc, label) {
    try {
      await idbPutRecord(DB_META, STORE_HISTORY, historyEntry(doc, label));
      await trimHistory();
    } catch (err) {
      /* A full disk must not cost us the current document. Trim harder and
         move on: the current board is the one that matters. */
      await trimHistory(10).catch(function () { });
    }
  }

  async function trimHistory(keep) {
    const entries = await idbAll(DB_META, STORE_HISTORY);
    if (!entries || !entries.length) return;
    entries.sort(function (a, b) { return b.at - a.at; });

    let budget = HISTORY_BYTES;
    let survivors = [];
    for (const entry of entries) {
      const size = JSON.stringify(entry.doc || {}).length;
      if (survivors.length >= (keep || HISTORY_LIMIT) || size > budget) break;
      survivors.push(entry);
      budget -= size;
    }
    const doomed = entries.filter(function (entry) {
      return survivors.indexOf(entry) < 0;
    });
    for (const entry of doomed) {
      await idbDelete(DB_META, STORE_HISTORY, entry.id).catch(function () { });
    }
  }

  function listHistory() {
    return idbAll(DB_META, STORE_HISTORY).then(function (entries) {
      return (entries || []).sort(function (a, b) { return b.at - a.at; });
    });
  }

  /* ---------- saving ---------- */

  function clock(at) {
    const d = at ? new Date(at) : new Date();
    const pad = function (n) { return String(n).padStart(2, "0"); };
    return pad(d.getHours()) + ":" + pad(d.getMinutes()) + ":" + pad(d.getSeconds());
  }

  function readCurrent() {
    return idbGet(DB_MAIN, STORE_PROJECT, CURRENT).then(function (record) {
      return record || null;
    });
  }

  /* Write the layout. The guards below are the point of this function. */
  async function persist(options) {
    const opts = options || {};
    const explicit = !!opts.explicit;   // the user chose New, Open or Save
    const force = explicit || !!opts.force;

    await writeView();

    if (!layoutDirty && !force) return { saved: false, reason: "nothing to save" };

    const doc = documentOf();
    const stored = await readCurrent();

    /* Rule 3: another tab wrote something newer than what we loaded. */
    if (stored && stored.rev > loadedRev && !opts.overwrite) {
      conflict = {
        rev: stored.rev,
        at: stored.savedAt,
        itemCount: stored.doc && stored.doc.items ? stored.doc.items.length : 0,
      };
      S.emit("conflict", conflict);
      MN.app.setStatus("Not saved: another tab is newer.");
      return { saved: false, reason: "conflict" };
    }

    /* Rule 2: an empty board never overwrites a populated one, unless the
       user asked for it. */
    const storedHasContent = !!(stored && stored.doc &&
      ((stored.doc.items && stored.doc.items.length) || (stored.doc.notes && stored.doc.notes.length)));
    const oursIsEmpty = doc.items.length === 0 && doc.notes.length === 0;
    if (oursIsEmpty && storedHasContent && !opts.allowEmpty) {
      MN.app.setStatus("Not saved: this board is empty and the stored one is not.");
      return { saved: false, reason: "empty" };
    }

    const rev = (stored ? stored.rev : 0) + 1;
    const record = {
      rev: rev,
      savedAt: Date.now(),
      tabId: tabId,
      doc: doc,
    };

    /* The history first: if the current write fails, the board is still in
       the history. */
    await writeHistory(doc, opts.label);

    /* An IndexedDB transaction is atomic: if this write fails, the last
       known good CURRENT is still there. */
    await idbPut(DB_MAIN, STORE_PROJECT, CURRENT, record);

    for (const asset of state.assets) {
      if (asset.blob) await idbPut(DB_MAIN, STORE_BLOBS, asset.id, asset.blob);
    }
    const live = new Set(state.assets.map(function (a) { return a.id; }));
    const keys = await withStore(DB_MAIN, STORE_BLOBS, "readonly", function (store) { return store.getAllKeys(); });
    for (const key of keys || []) {
      if (!live.has(key)) await idbDelete(DB_MAIN, STORE_BLOBS, key);
    }

    loadedRev = rev;
    layoutDirty = false;
    lastSaveAt = record.savedAt;
    broadcast({
      type: "saved",
      kind: "layout",
      rev: rev,
      at: lastSaveAt,
      itemCount: doc.items.length,
      noteCount: doc.notes.length,
    });
    MN.app.setStatus("Saved " + clock(lastSaveAt));
    return { saved: true, rev: rev, at: lastSaveAt };
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
        showStorageWarning(err);
      });
    }, 500);
  }

  /* A checkpoint every minute, so a long session always has something to
     come back to. */
  function scheduleRolling() {
    if (rollingTimer) return;
    rollingTimer = setTimeout(function () {
      rollingTimer = null;
      if (layoutDirty) {
        persist({ label: "checkpoint" }).catch(function () { });
      }
      scheduleRolling();
    }, ROLLING_INTERVAL);
  }

  /* ---------- other tabs ---------- */

  function setupChannel() {
    if (typeof BroadcastChannel === "function") {
      try {
        channel = new BroadcastChannel(CHANNEL);
        channel.onmessage = function (event) { onRemoteMessage(event.data); };
      } catch (err) {
        channel = null;
      }
    }
    /* The localStorage fallback: a ping other tabs can hear. */
    window.addEventListener("storage", function (event) {
      if (event.key !== CHANNEL + ":ping" || !event.newValue) return;
      try {
        onRemoteMessage(JSON.parse(event.newValue));
      } catch (err) { /* not ours */ }
    });
    /* Coming back to the tab is a good moment to notice a newer board. */
    document.addEventListener("visibilitychange", function () {
      if (document.visibilityState !== "visible") return;
      checkForNewer();
    });
  }

  function broadcast(message) {
    const payload = Object.assign({ tabId: tabId }, message);
    if (channel) {
      try { channel.postMessage(payload); } catch (err) { /* closed */ }
    }
    try {
      window.localStorage.setItem(CHANNEL + ":ping", JSON.stringify(payload));
    } catch (err) { /* private mode, or full */ }
  }

  function onRemoteMessage(message) {
    if (!message || message.tabId === tabId) return;
    if (message.type !== "saved") return;
    otherTabUpdated = true;
    S.emit("cross-tab", message);
    checkForNewer();
  }

  /* Is the stored board newer than the one this tab loaded? */
  function checkForNewer() {
    return readCurrent().then(function (stored) {
      if (!stored) return false;
      if (stored.rev > loadedRev) {
        if (!conflict) {
          conflict = {
            rev: stored.rev,
            at: stored.savedAt,
            itemCount: stored.doc && stored.doc.items ? stored.doc.items.length : 0,
          };
          S.emit("conflict", conflict);
        }
        return true;
      }
      return false;
    }).catch(function () { return false; });
  }

  /* ---------- restoring ---------- */

  async function restoreProject() {
    const stored = await readCurrent();
    const view = await idbGet(DB_META, STORE_VIEW, VIEW_KEY);
    if (view) applyViewState(view);

    if (!stored || !stored.doc) {
      const history = await listHistory();
      if (history.length) {
        /* Something happened, but the current document is gone. Offer the
           newest snapshot; never restore it silently. */
        S.emit("recoverable", history[0]);
        MN.app.setStatus("No stored board, but " + history.length + " snapshot" +
          (history.length === 1 ? "" : "s") + " can be recovered.");
      }
      return false;
    }

    loadedRev = stored.rev;
    const doc = stored.doc;

    const assets = [];
    for (const raw of doc.assets || []) {
      const id = typeof raw.id === "string" ? raw.id : core.uid("a");
      /* The built-in symbols carry no blob: they are re-resolved from the
         library instead, so a saved board still finds them. */
      if (id.indexOf("sym-") === 0 && MN.symbols) {
        const name = id.slice(4);
        const url = MN.symbols.urlFor(name);
        if (url) {
          assets.push({
            id: id,
            name: raw.name || name,
            path: raw.path || ("library/symbols/" + name + ".svg"),
            mime: "image/svg+xml",
            width: 24,
            height: 24,
            blob: null,
            url: url,
            builtin: true,
            missing: false,
          });
          continue;
        }
      }
      let blob = null;
      try {
        blob = await idbGet(DB_MAIN, STORE_BLOBS, id);
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

    await loadDocument(doc, { assets: assets, silent: true });
    layoutDirty = false;
    /* The library belongs in the tray whatever order things happen in. */
    if (MN.symbols) MN.symbols.install();
    return true;
  }

  /* ---------- loading a document into the board ---------- */

  function clampNumber(value, fallback, lo, hi) {
    const n = Number(value);
    if (!isFinite(n)) return fallback;
    return core.clamp(n, lo, hi);
  }

  /* Every colour that comes out of a file passes through here before it can
     reach a style property. A style value can carry a url(), and a url() is a
     request; only the forms this app writes are let through. */
  function colour(value, fallback) {
    if (MN.sanity && typeof MN.sanity.safeColour === "function") {
      return MN.sanity.safeColour(value, fallback);
    }
    return typeof value === "string" ? value : fallback;
  }

  function normaliseItem(raw) {
    if (!raw || typeof raw !== "object") return null;
    const kind = raw.kind === "text" ? "text" : raw.kind === "shape" ? "shape" : "image";
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
    } else if (kind === "shape") {
      const spec = S.shapeSpec(raw.shape);
      item.shape = spec.id;
      item.text = typeof raw.text === "string" ? raw.text : spec.text;
      item.fill = colour(raw.fill, spec.fill);
      item.border = colour(raw.border, spec.border);
      item.color = colour(raw.color, spec.color);
      item.borderWidth = clampNumber(raw.borderWidth, 1, 0, 20);
      item.fontFamily = typeof raw.fontFamily === "string" ? raw.fontFamily : "Helvetica Neue";
      item.fontSize = clampNumber(raw.fontSize, 0, 0, 1000);
      item.fontWeight = clampNumber(raw.fontWeight, 700, 100, 900);
      item.align = ["left", "center", "right"].indexOf(raw.align) >= 0 ? raw.align : "center";
    } else {
      item.text = typeof raw.text === "string" ? raw.text : "";
      item.fontFamily = typeof raw.fontFamily === "string" ? raw.fontFamily : "system-ui";
      item.fontSize = clampNumber(raw.fontSize, 12, 0.5, 1000);
      item.fontWeight = clampNumber(raw.fontWeight, 400, 100, 900);
      item.color = colour(raw.color, "#111111");
      item.background = colour(raw.background, "transparent");
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
      color: colour(raw.color, "#1c1c1c"),
      background: colour(raw.background, "#fff3b0"),
      border: typeof raw.border === "string" ? raw.border : "dashed",
      borderColor: colour(raw.borderColor, "#b08900"),
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
        value: colour(raw.background.value, "#eef0f3"),
      };
    }
    if (raw.underlay && typeof raw.underlay === "object") {
      base.underlay = {
        assetId: typeof raw.underlay.assetId === "string" ? raw.underlay.assetId : null,
        opacity: clampNumber(raw.underlay.opacity, 0.25, 0.05, 1),
      };
    }
    return base;
  }

  async function loadDocument(doc, options) {
    const opts = options || {};
    if (!doc || typeof doc !== "object") throw new Error("That file is not a Napkinetic project.");
    if (doc.format !== FORMAT) {
      throw new Error("Unknown format: " + (doc.format || "none") + ". Expected " + FORMAT + ".");
    }

    /* A restore must never land on top of work the user has already done
       while the stored project was being read. */
    if (opts.restore && (state.items.length || state.notes.length || state.assets.length)) {
      return { missing: [], skipped: true };
    }

    const existing = new Map();
    for (const asset of state.assets) existing.set(asset.id, asset);

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
    state.projectName = typeof doc.name === "string" ? doc.name : "Napkinetic board";
    state.selection = null;
    if (doc.view) applyViewState(doc.view);

    S.resetHistory();
    S.emit("change", { label: "open project" });
    MN.assets.renderTray();
    MN.stage.applyView();

    const missing = restored.filter(function (asset) { return asset.missing; });
    if (missing.length && !opts.silent) MN.project.showMissing(missing);
    return { missing: missing };
  }

  /* ---------- saving and opening files ---------- */

  async function saveFile(embedImages) {
    const doc = embedImages ? await documentWithImages() : exportDocument();
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
    const result = await loadDocument(doc);
    layoutDirty = true;
    return result;
  }

  /* ---------- recovery ---------- */

  /* Restoring is not destructive: the board being replaced goes into the
     history first, so it can be restored again. */
  async function restoreEntry(id) {
    const entries = await listHistory();
    const entry = entries.find(function (e) { return e.id === id; });
    if (!entry) throw new Error("That snapshot is gone.");
    await writeHistory(documentOf(), "before restore");
    await loadDocument(entry.doc, { silent: true });
    layoutDirty = true;
    conflict = null;
    otherTabUpdated = false;
    S.emit("conflict", null);
    MN.app.setStatus("Restored the board from " + clock(entry.at) + ".");
    return entry;
  }

  /* Take the board the other tab saved. */
  async function reloadStored() {
    conflict = null;
    otherTabUpdated = false;
    S.emit("conflict", null);
    const ok = await restoreProject();
    if (ok) {
      MN.assets.renderTray();
      MN.stage.applyView();
      MN.app.setStatus("Reloaded the board saved by the other tab.");
    }
    return ok;
  }

  async function clearStored() {
    await idbClear(DB_MAIN, STORE_PROJECT);
    await idbClear(DB_META, STORE_HISTORY);
    await idbClear(DB_META, STORE_VIEW);
    loadedRev = 0;
    layoutDirty = false;
  }

  /* ---------- the storage warning ---------- */

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
    setupChannel();
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

    /* The symbol library is always in the tray. */
    if (MN.symbols) {
      MN.symbols.install();
      MN.assets.renderTray();
    }
    /* And again in case a restore landed after it. */
    setTimeout(function () {
      if (!MN.symbols) return;
      MN.symbols.install();
      MN.assets.renderTray();
    }, 1500);

    /* Only a layout change makes the board worth writing. */
    S.on("change", function (event) {
      layoutDirty = true;
      scheduleAutosave();
    });

    scheduleRolling();

    if (location.protocol === "file:") {
      /* Chrome cannot autosave here. Check whether IndexedDB really works
         before saying so. */
      try {
        await openDb(DB_MAIN, MAIN_STORES);
      } catch (err) {
        showStorageWarning(err);
      }
    }
  }

  MN.project = {
    FORMAT: FORMAT,
    tabId: tabId,
    boot: boot,
    documentOf: documentOf,
    exportDocument: exportDocument,
    documentWithImages: documentWithImages,
    loadDocument: loadDocument,
    openFile: openFile,
    saveFile: saveFile,
    clearStored: clearStored,
    showMissing: showMissing,
    relink: relink,
    scheduleAutosave: scheduleAutosave,
    touchView: touchView,
    persist: persist,
    listHistory: listHistory,
    restoreEntry: restoreEntry,
    reloadStored: reloadStored,
    checkForNewer: checkForNewer,
    getConflict: function () { return conflict; },
    getOtherTabUpdated: function () { return otherTabUpdated; },
    clearConflict: function () { conflict = null; otherTabUpdated = false; },
    markDirty: function () { layoutDirty = true; },
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})(window.MN = window.MN || {});
