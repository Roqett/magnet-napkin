# AGENTS.md on DeepSeek Harness (DSH)

This is the DSH-specific companion to the repo-root [`AGENTS.md`](../AGENTS.md). Read that first. The project rules do not change between harnesses; only the plumbing does.

## 1. Instructions

DSH's instruction loader reads `AGENTS.md` (and `CLAUDE.md`) from the workspace, plus `~/.dsh/AGENTS.md` as a global baseline. The repo-root `AGENTS.md` is therefore the canonical brief for this project in both OpenCode and DSH. Keep it current; do not fork a second set of rules for DSH.

## 2. Skills

DSH discovers native `SKILL.md` files from, in priority order:

1. project `.dsh/skills/` or `.agents/skills/`
2. `~/.dsh/skills/`

Project roots beat the global root. Link only the skills the current phase needs — do not link the whole ECC catalogue.

```bash
mkdir -p .agents/skills
ln -s ~/.config/opencode/skills/browser-qa        .agents/skills/browser-qa
ln -s ~/.config/opencode/skills/accessibility     .agents/skills/accessibility
ln -s ~/.config/opencode/skills/security-review   .agents/skills/security-review
ln -s ~/.config/opencode/skills/verification-loop .agents/skills/verification-loop
ln -s ~/.config/opencode/skills/git-workflow      .agents/skills/git-workflow
```

For this project the useful set is the same as OpenCode's phase map in [`AGENTS.md`](../AGENTS.md) §5:

- `intent-driven-development` — kickoff scope.
- `make-interfaces-feel-better`, `accessibility` — UI.
- `security-review` — file import, SVG, text, export.
- `browser-qa`, `e2e-testing` — browser checks; adapt to whatever browser plugin/profile is mounted.
- `verification-loop` — gate (adapt: `node --check`, console, export round-trip).
- `git-workflow`, `conventional-commit-review` — commits.
- `deepseek-harness-setup` — only when installing or debugging the ECC bridge.
- `tdd-workflow` — only for pure geometry/serialization helpers; there is no test framework in the MVP.

If a skill does not appear, check that its `SKILL.md` is in a higher-priority root and that the directory name matches the `name` frontmatter. Remove links for skills you are not using; a smaller catalogue is easier for the model to choose from.

## 3. Hooks

ECC hooks do **not** run on DSH as Claude Code hooks. They go through the first-party bridge:

```bash
node scripts/dsh/generate-hooks-config.js \
  --ecc-root /path/to/ECC \
  --out ~/.dsh/ecc/hooks-dsh.json
```

Mount it with a bare insert in `~/.dsh/profiles/<profile>/cordis.patch.yml`:

```yaml
- insert:
    - id: ecc-hooks-claude-code
      name: "@deepseek-ai/dsh-hooks-claude-code"
      config:
        configPath: /absolute/path/to/hooks-dsh.json
```

Loader rules that cost time:

- A plain top-level `- id:` entry is silently dropped; it must be under `insert`.
- `insert` under an existing non-group id is rejected as “not a group”.
- First-party plugin packages need no profile `package.json` entry.

Validate by composing, not by assuming:

```bash
cd ~/.dsh && dsh --profile <name> --dump-config > /tmp/dump.yml
grep ecc-hooks /tmp/dump.yml
```

Compose can exit 0 while the loader drops or rejects an entry — check stderr too. A live GateGuard denial on the first edit/write/bash is the visible signal the bridge is active.

Event limits: 23 command hooks on 5 of 7 bridge events. `PreCompact`, `PostToolUseFailure` and `SessionEnd` are not bridged. Do not rely on those events for delivery-gate behaviour.

For this project, hooks are optional. Do not block the build on the hook bridge; the gates in `AGENTS.md` §4 are the contract.

## 4. Slash commands and agents

- Slash commands are a Claude Code mechanism and are **not available** on DSH. Use the skill workflows and the prompt in the handover §10.
- Native agent dispatch is **unverified**. Do not assume OpenCode subagent names (`planner`, `code-reviewer`, etc.) exist. Use DSH's native agents if the profile has them, or run the same prompt directly in the main thread.
- Keep the main thread on the spec. A subagent must not be given the whole build without the handover and `AGENTS.md`.

## 5. Plugins and MCPs

Map by **capability**, not by OpenCode's server names. Inspect what the profile actually mounts:

```bash
dsh --profile <name> --dump-config
```

Then choose:

| Need | DSH approach |
|---|---|
| Code discovery | Native filesystem/search; a codebase-memory MCP only if the repo is indexed and large enough to justify it. This repo is tiny — start without it. |
| Browser / UI testing | Whatever browser or Playwright plugin the profile mounts. If none, use the browser's own devtools and screenshots; the app is a static page. |
| GitHub | `gh` CLI via the shell. No MCP needed. |
| Docs / APIs | Native web search/fetch. No MCP needed. |
| Skills | Native `SKILL.md` roots as above. |
| Hooks | The ECC bridge as above; optional. |

Do not add an MCP just to mirror OpenCode. Do not add a cloud browser, a second code graph, or an analytics service. The project is local-only and small.

## 6. Verification on DSH

A practical loop:

1. `node --check` every `.js` file.
2. `dsh web` (or `dsh headless "<task>"`) from the repo root.
3. Open `index.html` or the local page in the browser the profile provides.
4. Check the console, then run the handover §9 checklist: import, canvas, drag/resize/rotate, text, note, undo, reload, clean PNG, annotated PNG, JSON round-trip, `notes.md`.
5. Confirm no network requests after load.
6. Commit with a Conventional Commit message; push.

If the DSH profile cannot run a browser, the fallback is the same page opened manually plus `node --check` and a JSON/PNG export inspection. Say so in the final report rather than claiming a browser test you did not run.

## 7. See also

- [`AGENTS.md`](../AGENTS.md) — the project rules and the OpenCode tool map.
- [`01-NAPKINETIC-HANDOVER.md`](../01-NAPKINETIC-HANDOVER.md) — the spec.
- ECC `deepseek-harness-setup` skill — the canonical install/update guide.
- ECC `docs/DEEPSEEK-HARNESS-GUIDE.md` — the long-form guide, if the checkout ships it.
