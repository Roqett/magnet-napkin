# Demo media

## The hero video

The README opens with a poster that links to the MP4:

| File | What it is |
|---|---|
| `napkinetic-hero.mp4` | H.264 High, yuv420p, 30 fps, AAC 128k, `+faststart` |
| `napkinetic-hero-poster.jpg` | one frame from the cut, same aspect as the video |

**Keep the file names.** Replacing the cut is a drop-in: export, overwrite both
files, and the README needs no change.

Budget: under about 6 MB. The current cut is 2:04 at 4.0 MB.

## From a QuickTime `.mov`

```sh
ffmpeg -i source.mov -vf "fps=30" \
  -c:v libx264 -profile:v high -level 4.0 -pix_fmt yuv420p \
  -crf 23 -preset slow \
  -c:a aac -b:a 128k \
  -movflags +faststart docs/demo/napkinetic-hero.mp4
```

Poster from a chosen moment:

```sh
ffmpeg -ss 118 -i source.mov -frames:v 1 -q:v 3 docs/demo/napkinetic-hero-poster.jpg
```

## Why not `.mov` or a GIF

- `.mov` is a QuickTime container. Browser support is inconsistent, and the
  original recording was 26 MB for two minutes.
- A two-minute GIF would be several times the MP4's size and visibly worse.
- GitHub sanitises `<video>` out of a README, so the poster-link pattern is the
  way to get a playable video on the repo landing page. On GitHub Pages a real
  `<video controls poster=…>` element works.

## The other clips

- `redline-prototype-demo.mp4` / `.mov` — the earlier Redline PanelBoard, kept as
  a record of where the tool came from.
- `redline-gt40.jpg` — the promotional still.
- `napkinetic.gif` — the short generic loop used in the README body.
