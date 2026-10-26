/* Napkinetic — core helpers.
   Classic script on purpose: ES modules are blocked on file://, and this app
   has to open by double-click. Everything hangs off one namespace so nothing
   leaks onto window. */
(function (MN) {
  "use strict";

  const $ = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));

  const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

  const round = (v, dp) => {
    const m = Math.pow(10, dp == null ? 2 : dp);
    return Math.round(v * m) / m;
  };

  /* Trim trailing zeros but keep at least one decimal place for 0.5 style values. */
  function fmtNum(v, dp) {
    if (!isFinite(v)) return "0";
    const s = round(v, dp == null ? 3 : dp).toString();
    return s === "-0" ? "0" : s;
  }

  let uidCounter = 0;
  const uid = (prefix) => {
    uidCounter += 1;
    return (prefix || "x") + Date.now().toString(36) + uidCounter.toString(36) +
      Math.random().toString(36).slice(2, 5);
  };

  function debounce(fn, ms) {
    let timer = null;
    const wrapped = function () {
      const args = arguments;
      if (timer) clearTimeout(timer);
      timer = setTimeout(function () { timer = null; fn.apply(null, args); }, ms);
    };
    wrapped.cancel = function () { if (timer) { clearTimeout(timer); timer = null; } };
    wrapped.flush = function () { if (timer) { clearTimeout(timer); timer = null; fn(); } };
    return wrapped;
  }

  const clone = (value) => {
    if (value === null || typeof value !== "object") return value;
    if (typeof structuredClone === "function") return structuredClone(value);
    return JSON.parse(JSON.stringify(value));
  };

  /* Build an element without ever touching innerHTML.
     `text` is always set as a text node, so filenames and note text from
     disk can never become markup. */
  function el(tag, opts, children) {
    const node = document.createElement(tag);
    if (opts) {
      for (const key of Object.keys(opts)) {
        const value = opts[key];
        if (value === null || value === undefined || value === false) continue;
        if (key === "class") node.className = value;
        else if (key === "text") node.textContent = String(value);
        else if (key === "dataset") Object.assign(node.dataset, value);
        else if (key === "style") Object.assign(node.style, value);
        else if (key === "html") throw new Error("core.el: raw HTML is not allowed");
        else if (key.slice(0, 2) === "on" && typeof value === "function") {
          node.addEventListener(key.slice(2).toLowerCase(), value);
        } else if (value === true) node.setAttribute(key, "");
        else node.setAttribute(key, String(value));
      }
    }
    for (const child of [].concat(children || [])) {
      if (child === null || child === undefined || child === false) continue;
      node.appendChild(typeof child === "string" ? document.createTextNode(child) : child);
    }
    return node;
  }

  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 2000);
  }

  function downloadText(text, filename, type) {
    downloadBlob(new Blob([text], { type: type || "text/plain;charset=utf-8" }), filename);
  }

  /* A number input that keeps the caret usable while the user types. */
  function num(value, dp) {
    const n = Number(value);
    return isFinite(n) ? n : 0;
  }

  MN.core = {
    $, $$, el, clamp, round, fmtNum, uid, debounce, clone, downloadBlob, downloadText, num,
  };
})(window.MN = window.MN || {});
