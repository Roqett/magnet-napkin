# AGENTS.md — Magnet Napkin

This is the working brief for any coding agent in this repo. OpenCode reads it; DeepSeek Harness (DSH) also reads `AGENTS.md` at the repo root. Read it before changing code.

## 0. Read order

1. `01-MAGNET-NAPKIN-HANDOVER.md` — the spec. Read it in full.
2. `README.md` — the public promise.
3. `docs/PLAN.md` — the current phase plan, decisions and gates.
4. This file — working rules, tooling and gates.
5. The code.

When they disagree: the handover wins on **scope**, this file wins on **process**, and the code wins on **what exists**. Record any conflict rather than silently working around it.

## 1. What we are building

A single static page — vanilla HTML, CSS and JavaScript — that lets someone drop a folder of images onto a canvas of a known size, move/resize/rotate them, add design text, add notes that are explicitly not design content, and export the layout plus a brief for a vision agent.

**MVP only.** The Definition of Done is §9 of the handover. Stop there.

**Non-goals:** accounts, cloud, collaboration, comments, AI generation, vector editing, PDF, mobile-first layout, analytics, backend, npm, frameworks, and an MCP server as a product feature in this build. Development MCP/tooling is fine; a shipped MCP server is not. The notes are static text, not a commenting system.

## 2. Non-negotiables

- **One static page.** It must open from disk and work on GitHub Pages. Classic scripts, no build step, no bundler, no framework unless the handover is amended.
- **Local-only.** No uploads, telemetry, analytics or network calls after load.
- **Canvas units, not pixels.** Store geometry in the chosen unit (`px`, `pt`, `mm`, `in`); render at `scale`. Never store screen pixels.
- **Text is design content; notes are not.** Text lives in `items` and appears in the clean PNG. Notes live in `notes`, are hidden from the clean PNG, appear in the annotated PNG, and are never merged into `items`.
- **No Redline source assets.** The only Redline image allowed is the promotional capture at `docs/demo/redline-gt40.jpg`; no fonts, artwork or brand files.
- **No MCP server as a product feature in this build.** The export format (`layout.json` + two PNGs + `notes.md`) is the interface. Development MCP/tooling is fine. A shipped MCP is a later, separate, read-only wrapper.
- **Security.** Never `innerHTML` untrusted filenames or text; load SVG through `<img>`; no `eval`; no third-party runtime scripts.
- **Accessibility.** Keyboard selection, arrow nudge, visible focus, labels on controls. The app should be usable without a mouse for the common path.
- **Commits.** One coherent change per commit; Conventional Commits; no secrets, no generated junk, no Redline assets.

## 3. Working rhythm

Build one thin slice at a time, in this order:

1. scaffold and README;
2. canvas, units, rulers, zoom/pan;
3. folder import and tray;
4. add/select/move/resize/rotate;
5. text boxes;
6. notes;
7. z-order, lock, opacity, duplicate/delete;
8. undo/redo;
9. snapping and guides;
10. IndexedDB autosave and project import/export;
11. clean/annotated PNG export;
12. `notes.md` / handoff panel;
13. cross-browser QA, README screenshots, polish.

After each slice: run it in the browser, check the console, and commit. Do not start the next slice while the current one is visibly broken.

## 4. Gates

There is no build/type step. Adapt the verification to a static app:

- `node --check` on every `.js` file.
- Open `index.html` from disk; the console must be clean.
- Browser smoke: import a mixed folder, set a canvas, place, move, resize with aspect lock, rotate, add text, add a note, undo/redo, reload (autosave), export clean PNG, export annotated PNG, export JSON, import JSON, open `notes.md`.
- Check the exports: the clean PNG has no notes; the annotated PNG has them; the JSON round-trips; `notes.md` names positions in canvas units.
- Cross-browser: current Chrome, Safari and Firefox at least smoke-tested.
- Network: no requests after load.
- The handover §9 checklist is all true, with evidence in the final report.

## 5. OpenCode

### MCP servers and built-in tools

- **`browser` — required.** The built-in desktop browser tools: open the page, read the console, screenshot, and test interactions. The `browser.preview` / `tabs.open` flow is enough; you do not need a second browser MCP.
- **`codebase-memory-mcp` — optional.** This repo is tiny. Index it only once it has more than roughly 20 source files; until then, grep and read are faster and more honest. If it is indexed, follow the global graph rules.
- **`opencode_console` — not for building.** Only for workspace/provider administration. Do not use it for code changes.
- Do not add new MCP servers for this project. If Playwright MCP is already installed, it may supplement the `browser` tool for repeatable E2E; it is not required.

### Skills

Load only what the current phase needs. Do not load the whole catalogue.

| Phase | Skill |
|---|---|
| Kickoff / scope | `intent-driven-development` |
| UI craft | `make-interfaces-feel-better`, `accessibility` |
| Security review | `security-review` — file import, SVG, text rendering, export |
| Browser testing | `browser-qa`, `e2e-testing` — adapt to the `browser` tool |
| Gate | `verification-loop` — adapt to `node --check`, console, export round-trip |
| Git | `git-workflow`, `conventional-commit-review` |
| Docs | `docs-governance` or `living-docs-governance` only if docs sprawl |
| Harness / config | `opencode` for OpenCode; `deepseek-harness-setup` for DSH |
| Optional | `tdd-workflow` for pure geometry/serialization helpers; there is no test framework in the MVP |

### Subagents

- `planner` once, for the phase plan.
- `code-reviewer` after each major phase.
- `security-reviewer` before the repo is announced or released.
- `e2e-runner` if Playwright is available; otherwise use the `browser` tool.
- `doc-updater` for README, FORMAT and SHORTCUTS.
- Keep the main thread on the spec. Do not delegate the whole build.

## 6. DeepSeek Harness

DSH reads `AGENTS.md` at the repo root (`AGENTS.md` / `CLAUDE.md` candidates), so this file is the brief in both harnesses. Setup details are in [`docs/AGENTS-DSH.md`](docs/AGENTS-DSH.md).

- **Skills:** DSH discovers `SKILL.md` from project `.agents/skills` or `.dsh/skills`, then `~/.dsh/skills`; project roots beat global. Link only the skills for the current phase. The phase map above is the same.
- **Hooks:** if ECC is installed, use the `@deepseek-ai/dsh-hooks-claude-code` bridge. It supports 23 command hooks on 5 of 7 events; `PreCompact`, `PostToolUseFailure` and `SessionEnd` are not bridged. Verify the entry in `dsh --profile <name> --dump-config`; do not assume a hook fired.
- **Slash commands:** not available on DSH. Use skills and prompt workflows.
- **Agents:** native dispatch is unverified. Do not rely on OpenCode subagent names; use DSH's native agents if configured, or run the same prompt directly.
- **Plugins / MCPs:** map by capability, not name. Inspect `dsh --profile <name> --dump-config` for what is actually mounted. Use native filesystem/search, the browser/Playwright plugin if present, and the `gh` CLI for GitHub. Do not add an MCP just to match OpenCode.
- **Skills not appearing?** Check root priority and symlink the skill into the project root.

## 7. Handover convention

Handovers are numbered and named:

```
NN-PROJECT-HANDOVER.md
```

The number goes first so the files sort and the console tab identifies the project. This repo's handover is `01-MAGNET-NAPKIN-HANDOVER.md`. A future handover would be `02-MAGNET-NAPKIN-HANDOVER.md`, and so on.

Do not create a new handover unless asked. Keep the current one current. Use `README.md` / `CHANGELOG.md` for progress.

## 8. Session kickoff

Use the prompt in the handover §10, plus:

> Read `AGENTS.md` before coding. Restate the MVP, the non-goals and the Definition of Done in your own words, then build one phase at a time and stop at each gate. Do not add stretch features. Do not build an MCP.
