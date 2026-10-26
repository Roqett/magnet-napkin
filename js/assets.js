/* Magnet Napkin — assets.
   Folder import in four layers, because no browser supports all of them:
     1. webkitGetAsEntry   — Chrome, Safari
     2. getAsFileSystemHandle — Firefox
     3. <input webkitdirectory> — everywhere, as the button fallback
     4. showDirectoryPicker — Chromium only, a nicety, never required
   Images only. The blob stays in memory, the object URL is reused for the
   tray thumbnail, the canvas and the export. */
(function (MN) {
  "use strict";

  const core = MN.core;
  const S = MN.state;
  const state = S.state;

  const IMAGE_EXT = { png: 1, jpg: 1, jpeg: 1, webp: 1, svg: 1, gif: 1 };
  const KNOWN_MIME = {
    "image/png": 1, "image/jpeg": 1, "image/webp": 1, "image/svg+xml": 1, "image/gif": 1,
  };

  const trayEl = core.$("#tray-scroll");
  const trayCountEl = core.$("#tray-count");
  const trayEmptyEl = core.$("#tray-empty");
  const fileInput = core.$("#file-input");

  function extOf(name) {
    const match = /\.([a-z0-9]+)$/i.exec(name || "");
    return match ? match[1].toLowerCase() : "";
  }

  /* Only formats a browser can actually decode. HEIC and friends are out. */
  function isImageFile(file) {
    if (!file) return false;
    if (IMAGE_EXT[extOf(file.name)]) return true;
    return !!(file.type && KNOWN_MIME[file.type]);
  }

  function measureImage(url) {
    return new Promise(function (resolve, reject) {
      const img = new Image();
      img.onload = function () {
        resolve({ width: img.naturalWidth || img.width || 0, height: img.naturalHeight || img.height || 0 });
      };
      img.onerror = function () { reject(new Error("could not decode image")); };
      img.src = url;
    });
  }

  /* ---------- adding assets ---------- */

  async function addAsset(file, path) {
    const url = URL.createObjectURL(file);
    let size;
    try {
      size = await measureImage(url);
    } catch (err) {
      URL.revokeObjectURL(url);
      return null;
    }
    if (!size.width || !size.height) {
      URL.revokeObjectURL(url);
      return null;
    }
    const asset = {
      id: core.uid("a"),
      name: file.name,
      path: path || file.name,
      mime: (file.type && KNOWN_MIME[file.type]) ? file.type : ("image/" + extOf(file.name)),
      width: size.width,
      height: size.height,
      blob: file,
      url: url,
    };
    state.assets.push(asset);
    return asset;
  }

  /* Import a flat list of { file, path }. Dedupe by path, sort by path. */
  async function importEntries(entries) {
    const seen = new Map();
    let skipped = 0;
    for (const entry of entries) {
      if (!entry || !entry.file) continue;
      if (!isImageFile(entry.file)) { skipped += 1; continue; }
      const path = entry.path || entry.file.name;
      if (!seen.has(path)) seen.set(path, entry.file);
      else skipped += 1;
    }

    const ordered = Array.from(seen.entries()).sort(function (a, b) {
      return a[0].localeCompare(b[0]);
    });

    let added = 0;
    for (const pair of ordered) {
      const asset = await addAsset(pair[1], pair[0]);
      if (asset) added += 1;
    }

    renderTray();
    S.emit("change", { label: "import assets" });
    S.emit("assets-imported", { added: added, skipped: skipped });
    return { added: added, skipped: skipped };
  }

  async function importFileList(fileList) {
    const entries = [];
    for (const file of Array.from(fileList || [])) {
      entries.push({ file: file, path: file.webkitRelativePath || file.name });
    }
    return importEntries(entries);
  }

  /* ---------- the four import paths ---------- */

  function readEntry(entry, prefix, out) {
    return new Promise(function (resolve) {
      if (!entry) { resolve(); return; }

      if (entry.isFile) {
        entry.file(function (file) {
          out.push({ file: file, path: prefix + file.name });
          resolve();
        }, function () { resolve(); });
        return;
      }

      if (entry.isDirectory) {
        const reader = entry.createReader();
        const children = [];
        /* readEntries returns at most 100 entries per call, so keep going
           until it hands back an empty batch. */
        function readBatch() {
          reader.readEntries(function (batch) {
            if (!batch.length) {
              Promise.all(children.map(function (child) {
                return readEntry(child, prefix + entry.name + "/", out);
              })).then(resolve);
              return;
            }
            for (const child of batch) children.push(child);
            readBatch();
          }, function () { resolve(); });
        }
        readBatch();
        return;
      }

      resolve();
    });
  }

  async function walkHandle(handle, prefix, out) {
    if (!handle) return;
    if (handle.kind === "file") {
      const file = await handle.getFile();
      out.push({ file: file, path: prefix + file.name });
      return;
    }
    for await (const pair of handle.entries()) {
      await walkHandle(pair[1], prefix + pair[0] + "/", out);
    }
  }

  async function entriesFromDataTransfer(dataTransfer) {
    const out = [];
    const items = dataTransfer && dataTransfer.items ? Array.from(dataTransfer.items) : [];

    if (items.length && typeof items[0].webkitGetAsEntry === "function") {
      for (const item of items) {
        const entry = item.webkitGetAsEntry();
        if (!entry) continue;
        await readEntry(entry, "", out);
      }
      if (out.length) return out;
    }

    if (items.length && typeof items[0].getAsFileSystemHandle === "function") {
      for (const item of items) {
        if (typeof item.getAsFileSystemHandle !== "function") continue;
        try {
          const handle = await item.getAsFileSystemHandle();
          if (handle) await walkHandle(handle, "", out);
        } catch (err) { /* permission denied or unsupported */ }
      }
      if (out.length) return out;
    }

    if (dataTransfer && dataTransfer.files && dataTransfer.files.length) {
      for (const file of Array.from(dataTransfer.files)) {
        out.push({ file: file, path: file.webkitRelativePath || file.name });
      }
    }
    return out;
  }

  /* Chromium only. A nicety: the button falls back to the file input. */
  async function pickDirectory() {
    if (typeof window.showDirectoryPicker !== "function") return false;
    let handle;
    try {
      handle = await window.showDirectoryPicker({ mode: "read" });
    } catch (err) {
      return false; /* the user cancelled */
    }
    const out = [];
    await walkHandle(handle, "", out);
    const result = await importEntries(out);
    return result;
  }

  function openFolderPicker() {
    if (typeof window.showDirectoryPicker === "function") {
      pickDirectory();
      return;
    }
    if (fileInput) fileInput.click();
  }

  /* ---------- the tray ---------- */

  /* Group by the folder inside the imported root: dropping
     "gt40-assets/gauges/tach.png" groups it under "gauges", not under the
     name of the folder that was dropped. */
  function groupOf(path) {
    const parts = String(path || "").split("/");
    if (parts.length < 3) return "Loose files";
    parts.pop();
    parts.shift();
    return parts.join("/") || "Loose files";
  }

  function renderTray() {
    if (!trayEl) return;
    trayEl.textContent = "";

    const groups = new Map();
    for (const asset of state.assets) {
      const group = groupOf(asset.path);
      if (!groups.has(group)) groups.set(group, []);
      groups.get(group).push(asset);
    }

    for (const pair of groups) {
      const head = core.el("div", { class: "group", text: pair[0] });
      trayEl.appendChild(head);
      for (const asset of pair[1]) {
        const row = core.el("div", {
          class: "tray-item",
          draggable: "true",
          title: asset.path,
          dataset: { id: asset.id, search: (asset.name + " " + asset.path).toLowerCase() },
        });
        const thumb = core.el("img", { src: asset.url, alt: "", draggable: "false" });
        /* The parent folder, so two files with the same name in different
           folders stay tellable apart. */
        const slash = asset.path.lastIndexOf("/");
        const parent = slash < 0 ? "" : asset.path.slice(0, slash).split("/").pop();
        const label = core.el("div", { class: "t" }, [
          core.el("b", { text: asset.name }),
          core.el("small", {
            text: (parent ? parent + " · " : "") + asset.width + " × " + asset.height + " px",
          }),
        ]);
        row.appendChild(thumb);
        row.appendChild(label);
        trayEl.appendChild(row);
      }
    }

    if (trayCountEl) {
      trayCountEl.textContent = state.assets.length
        ? state.assets.length + (state.assets.length === 1 ? " asset" : " assets")
        : "";
    }
    if (trayEmptyEl) trayEmptyEl.hidden = state.assets.length > 0;
  }

  function filterTray(query) {
    const q = (query || "").trim().toLowerCase();
    const rows = core.$$(".tray-item", trayEl);
    for (const row of rows) {
      const hit = !q || row.dataset.search.indexOf(q) >= 0;
      row.style.display = hit ? "" : "none";
    }
    /* Hide a group heading when every row under it is filtered out. */
    let node = trayEl.firstElementChild;
    while (node) {
      if (node.classList.contains("group")) {
        let visible = false;
        let sibling = node.nextElementSibling;
        while (sibling && !sibling.classList.contains("group")) {
          if (sibling.style.display !== "none") visible = true;
          sibling = sibling.nextElementSibling;
        }
        node.style.display = visible ? "" : "none";
      }
      node = node.nextElementSibling;
    }
  }

  /* ---------- page level drop ---------- */

  function wireDropTarget() {
    const app = core.$("#app");
    if (!app) return;
    let depth = 0;

    document.addEventListener("dragenter", function (e) {
      if (!e.dataTransfer) return;
      e.preventDefault();
      depth += 1;
      document.body.classList.add("dropping");
    });
    document.addEventListener("dragover", function (e) {
      if (!e.dataTransfer) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = "copy";
    });
    document.addEventListener("dragleave", function (e) {
      e.preventDefault();
      depth = Math.max(0, depth - 1);
      if (!depth) document.body.classList.remove("dropping");
    });
    document.addEventListener("drop", async function (e) {
      e.preventDefault();
      depth = 0;
      document.body.classList.remove("dropping");
      const entries = await entriesFromDataTransfer(e.dataTransfer);
      const result = await importEntries(entries);
      MN.app.setStatus(result.added + " image" + (result.added === 1 ? "" : "s") + " imported" +
        (result.skipped ? " · " + result.skipped + " skipped" : ""));
    });
  }

  function boot() {
    renderTray();

    const search = core.$("#search");
    if (search) search.addEventListener("input", function () { filterTray(search.value); });

    if (fileInput) {
      fileInput.addEventListener("change", function (e) {
        const files = e.target.files;
        if (!files || !files.length) return;
        importFileList(files).then(function (result) {
          MN.app.setStatus(result.added + " image" + (result.added === 1 ? "" : "s") + " imported" +
            (result.skipped ? " · " + result.skipped + " skipped" : ""));
        });
        e.target.value = "";
      });
    }

    wireDropTarget();
    S.on("change", renderTray);
  }

  MN.assets = {
    renderTray: renderTray,
    filterTray: filterTray,
    importEntries: importEntries,
    importFileList: importFileList,
    openFolderPicker: openFolderPicker,
    isImageFile: isImageFile,
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})(window.MN = window.MN || {});
