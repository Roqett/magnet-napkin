# Magnet Napkin

**A napkin for your assets.** Drop a folder of images onto a canvas of a known size, move them around like magnets, and export the layout.

> **Status:** pre-build. The build brief, scope and technical decisions are in [`HANDOVER.md`](HANDOVER.md).

## The idea

Every layout starts as a pile of assets and a rough arrangement. Magnet Napkin is the smallest tool for that moment:

- drop a folder of images in;
- set the canvas to the real size in px, pt, mm or inches;
- drag, resize (aspect locked) and rotate the images;
- read exact positions and sizes;
- export a PNG and a JSON layout.

No accounts. No cloud. No install. No build step.

## Planned shape

A single static page — HTML, CSS and vanilla JavaScript — that runs from disk or GitHub Pages. Assets stay local. The current project and its images are cached in the browser so reopening the page restores the board.

## Build

The MVP scope, data model, file format, UX shape, acceptance criteria and first-session prompt are all in [`HANDOVER.md`](HANDOVER.md).

## License

MIT. See [`LICENSE`](LICENSE).
