/* Napkinetic — sanity checks.

   Four promises the app makes, kept by a few lines of code rather than by a
   sentence in the README:

     1. The page never talks to the network once it has loaded.
     2. A board is never read through somebody else's page.
     3. An image the browser cannot survive is refused, not loaded.
     4. A colour from a file is a colour, never a request for anything.

   Every check here fails towards the user's work. A check that costs someone
   their layout is worse than the thing it defends against, so none of these
   throw away data, none block a normal edit, and none report anywhere: there
   is nowhere to report to, and that is the point.

   Nothing fails loudly. If the network is ever reached for, it is simply not
   there; an image that is too big is reported in the status line, like any
   other file that was not taken. The one exception is the framed board, which
   cannot be used safely at all and so says why. */
(function (MN) {
  "use strict";

  const core = MN.core;

  /* A 10,000 × 8,000 image is 80 megapixels and already unreasonable for a
     layout tool. Past that the decode, not the drawing, is what kills the
     tab, and the crash looks like the app broke rather than the file. */
  const MAX_IMAGE_PIXELS = 80e6;

  /* Enough to diagnose, not enough to leak memory if something loops. */
  const MAX_RECORDED = 20;
  const attempts = [];
  let offlineInstalled = false;

  const OFFLINE = "Napkinetic works on the board in this tab and does not use the network.";

  function note(kind, detail) {
    if (attempts.length >= MAX_RECORDED) return;
    attempts.push({
      kind: kind,
      detail: String(detail == null ? "" : detail).slice(0, 200),
      at: Date.now(),
    });
  }

  /* ---------- 1. the page stays offline ----------
     The README says the page loads nothing and sends nothing. That is true
     today because nobody wrote a call. It is true tomorrow because there is
     nowhere to put one. blob: and data: are local bytes and still allowed,
     so downloads and object URLs keep working. */

  function localUrl(value) {
    return /^(blob|data):/i.test(String(value || ""));
  }

  function installOffline() {
    if (offlineInstalled) return;
    offlineInstalled = true;
    try {
      const nativeFetch = window.fetch;
      if (typeof nativeFetch === "function") {
        window.fetch = function (input) {
          const target = typeof input === "string" ? input : (input && input.url) || "";
          if (localUrl(target)) return nativeFetch.apply(window, arguments);
          note("fetch", target);
          return Promise.reject(new Error(OFFLINE));
        };
      }
    } catch (err) { /* a page that cannot be patched still runs */ }

    try {
      const prototype = window.XMLHttpRequest && window.XMLHttpRequest.prototype;
      if (prototype && typeof prototype.open === "function") {
        const nativeOpen = prototype.open;
        prototype.open = function (method, url) {
          if (localUrl(url)) return nativeOpen.apply(this, arguments);
          note("xhr", url);
          throw new Error(OFFLINE);
        };
      }
    } catch (err) { }

    try {
      if (typeof navigator.sendBeacon === "function") {
        navigator.sendBeacon = function (url) { note("beacon", url); return false; };
      }
    } catch (err) { }

    ["WebSocket", "EventSource"].forEach(function (name) {
      try {
        const Native = window[name];
        if (typeof Native !== "function") return;
        const Refused = function () {
          note(name.toLowerCase(), "connect");
          throw new Error(OFFLINE);
        };
        Refused.prototype = Native.prototype;
        window[name] = Refused;
      } catch (err) { }
    });

    /* A service worker could serve different bytes on a later visit, which is
       the one way a static page can change after you have read it. */
    try {
      if (navigator.serviceWorker && typeof navigator.serviceWorker.register === "function") {
        navigator.serviceWorker.register = function () {
          note("serviceworker", "register");
          return Promise.reject(new Error(OFFLINE));
        };
      }
    } catch (err) { }
  }

  /* ---------- 2. a board is only opened in its own window ----------
     Framed by another site, the board still loads the owner's own stored
     layout, and a click can be positioned over a button that clears it. A
     same-origin frame is fine: the test pages use one. */

  function framedByAnotherSite() {
    if (window.top === window.self) return false;
    try {
      /* Reading a same-origin parent is allowed; a cross-origin one throws. */
      void window.top.location.href;
      return false;
    } catch (err) {
      return true;
    }
  }

  function showFramedNotice() {
    try {
      const host = document.getElementById("app") || document.body;
      host.textContent = "";
      /* #app is a three-column grid. A single child would land in the tray
         column, so the host becomes a plain block for the notice. */
      host.style.display = "block";
      host.appendChild(core.el("div", {
        style: {
          maxWidth: "34rem",
          margin: "18vh auto",
          padding: "0 1.5rem",
          font: "16px/1.65 system-ui, -apple-system, Segoe UI, sans-serif",
          color: "#e8ecf4",
        },
      }, [
        core.el("h1", {
          text: "This board is open inside another site.",
          style: { fontSize: "1.15rem", margin: "0 0 0.9rem" },
        }),
        core.el("p", {
          text: "Napkinetic runs in its own window or tab. Opened inside another " +
            "page, a click could land on the board without you meaning it to, so " +
            "it has stopped here. Your board has not been touched.",
          style: { margin: "0 0 0.9rem" },
        }),
        core.el("p", {
          text: "Open roqett.github.io/napkinetic directly instead.",
          style: { margin: 0, opacity: "0.7" },
        }),
      ]));
      document.body.style.pointerEvents = "none";
    } catch (err) { /* there is nothing left to protect */ }
  }

  /* ---------- 3. an image the browser cannot survive ---------- */

  function imageTooLarge(width, height) {
    const w = Number(width);
    const h = Number(height);
    if (!isFinite(w) || !isFinite(h)) return true;
    return w * h > MAX_IMAGE_PIXELS;
  }

  /* ---------- 4. a colour is a colour ----------
     Colours from a file land straight in style properties, and a style value
     can carry a url() that fetches. Anything this app writes is a hex value
     or transparent, so those are the only forms accepted back. */

  const HEX = /^#[0-9a-f]{3,8}$/i;
  const RGB = /^rgba?\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*(?:,\s*(?:0|1|0?\.\d+)\s*)?\)$/i;

  function safeColour(value, fallback) {
    if (typeof value !== "string") return fallback;
    const v = value.trim();
    if (HEX.test(v) || RGB.test(v)) return v;
    if (v.toLowerCase() === "transparent") return v;
    return fallback;
  }

  installOffline();

  MN.sanity = {
    MAX_IMAGE_PIXELS: MAX_IMAGE_PIXELS,
    framedByAnotherSite: framedByAnotherSite,
    imageTooLarge: imageTooLarge,
    installOffline: installOffline,
    safeColour: safeColour,
    showFramedNotice: showFramedNotice,
    /* Nothing in the app reads this; it is here so a test, or a person with
       the console open, can see whether anything ever reached for the
       network. */
    attempts: attempts,
  };
})(window.MN = window.MN || {});
