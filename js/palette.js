/* Napkinetic — the colour palette.

   A set of named colours to pick from, so a board can be marked up with
   colours an agent can reproduce exactly: every one of these is a plain hex
   value, and every colour on the board is stored as one.

   The set is the macOS system palette — the blue of a system button, the
   greens and reds and greys — because those are the colours people reach
   for by default, and they read the same everywhere. */
(function (MN) {
  "use strict";

  const PALETTE = [
    { name: "System blue", hex: "#007aff" },
    { name: "System green", hex: "#34c759" },
    { name: "System indigo", hex: "#5856d6" },
    { name: "System orange", hex: "#ff9500" },
    { name: "System pink", hex: "#ff2d55" },
    { name: "System purple", hex: "#af52de" },
    { name: "System red", hex: "#ff3b30" },
    { name: "System teal", hex: "#5ac8fa" },
    { name: "System yellow", hex: "#ffcc00" },
    { name: "System brown", hex: "#a2845e" },
    { name: "Black", hex: "#000000" },
    { name: "Near black", hex: "#1c1c1e" },
    { name: "Dark grey", hex: "#2c2c2e" },
    { name: "Grey", hex: "#3a3a3c" },
    { name: "Mid grey", hex: "#636366" },
    { name: "Grey 5", hex: "#8e8e93" },
    { name: "Grey 4", hex: "#aeaeb2" },
    { name: "Grey 3", hex: "#c7c7cc" },
    { name: "Grey 2", hex: "#d1d1d6" },
    { name: "Grey 1", hex: "#e5e5ea" },
    { name: "Light grey", hex: "#f2f2f7" },
    { name: "White", hex: "#ffffff" },
  ];

  /* Is this something we can put in a hex field? */
  function isHex(value) {
    return /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.test(String(value || "").trim());
  }

  /* Normalise to a six digit hex, so what is stored is always exact. */
  function normalise(value) {
    const text = String(value || "").trim().replace(/^#/, "");
    if (/^[0-9a-f]{3}$/i.test(text)) {
      return "#" + text[0] + text[0] + text[1] + text[1] + text[2] + text[2];
    }
    if (/^[0-9a-f]{6}$/i.test(text)) return "#" + text.toLowerCase();
    return null;
  }

  MN.palette = { PALETTE: PALETTE, isHex: isHex, normalise: normalise };
})(window.MN = window.MN || {});
