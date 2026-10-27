# Security

Napkinetic is a static page. It has no server, no account, no database and no
analytics, and it sends nothing anywhere after it has loaded. That removes most
of what a security policy usually covers, and leaves a short and specific list.

## Reporting something

Please use **[Report a vulnerability](https://github.com/Roqett/napkinetic/security/advisories/new)**
— it opens a private advisory that only the maintainer can see. Please do not
open a public issue for a security problem.

A useful report says what you did, what you expected, what happened, and which
browser and version. A proof of concept in a `.napkin.json` or a folder of
images is the most useful thing you can send, because those two are the only
things this app accepts from outside.

## What is in scope

- **A way to make the app reach the network.** It is not supposed to, at all,
  and it is supposed to be unable to. Both are tested.
- **A way to run script from a file.** Images are loaded through `<img>` and
  text goes in as text; a `.napkin.json` is validated field by field.
- **A way to lose a board.** Autosave, history, the second-tab guard and the
  empty-board guard are all meant to make that impossible.
- **A note that could instruct a reader.** `notes.md` is often handed to a
  model. Instruction-shaped notes are marked, and invisible control characters
  are removed on the way out.
- Anything that makes the page hang or crash on a file a person could plausibly
  have. Very large images are refused before they are decoded, on purpose.

## What is out of scope

- **A compromised GitHub account.** Someone who can push to this repository can
  change the JavaScript, and can remove anything in it. That is a control
  problem, not a code problem: two-factor authentication, and the code scanning
  and secret scanning already enabled on this repository, are the answer to it.
- **A compromised browser or operating system.** Nothing a page does helps.
- **The shared `github.io` origin.** Every project under `roqett.github.io`
  shares one browser origin and therefore one storage area. This is a known
  property of GitHub Pages, not a bug in this app, and it is why the app does
  not keep anything it would be harmed by losing.
- Denial of service against GitHub, or against your own machine by your own
  files.

## What the app does about it

The promises above are in [`tests/`](tests/) rather than only in this file. If a
change breaks one, the smoke test says so. The checks themselves are small and
readable on purpose: `js/sanity.js` for the page, `js/handoff.js` for the brief.
Nothing is obfuscated, and there are no hidden features — a design tool that
quietly did something else would be a bigger problem than the one it was
guarding against.
