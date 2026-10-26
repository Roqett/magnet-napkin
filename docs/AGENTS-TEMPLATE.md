# AGENTS.md template

Copy this file to a new repository as `AGENTS.md`, replace the `<PLACEHOLDERS>`, and delete the sections that do not apply. Keep it under ~150 lines. It is read by OpenCode and by DeepSeek Harness (DSH reads `AGENTS.md` at the repo root).

The point of this template is to answer three questions before an agent writes code:

1. **What is the truth?** Which document wins, and in what order.
2. **What is the scope?** What ships now, and what is explicitly out.
3. **What tools may it use?** Which MCPs, skills, agents and gates — in OpenCode and in DSH.

---

# AGENTS.md — <PROJECT>

<One sentence: what this is and who it is for.>

Read this before changing code. It is the working brief: the spec is separate, this file is the process.

## 0. Read order

1. `<PRIMARY_SPEC>` — the build spec / handover. Read in full.
2. `README.md` — the public promise.
3. This file — scope, rules, tooling and gates.
4. The code.

When they disagree: the spec wins on **scope**, this file wins on **process**, the code wins on **what exists**. Record conflicts; never silently work around them.

## 1. What we are building

<The one-paragraph product description.>

**MVP:** <the smallest shippable slice. Link to the acceptance list.>

**Non-goals:** <list the tempting things that are explicitly out: accounts, cloud, collaboration, AI generation, analytics, backend, mobile-first, frameworks, etc.>

## 2. Non-negotiables

- <Stack / platform constraint.>
- <Distribution constraint: static page, single binary, no backend, etc.>
- <Data/privacy constraint: local-only, no uploads, no telemetry.>
- <The one domain rule that must never be broken.>
- <Security rule: no innerHTML, no eval, sanitize imports.>
- <Accessibility rule.>
- <Commit rule: one coherent change, Conventional Commits, no secrets.>
- **Do not add tools you do not need.** Every MCP, plugin, skill and dependency has to earn its place.

## 3. Stack and commands

| Thing | Choice |
|---|---|
| Language | <e.g. vanilla JS> |
| Framework | <e.g. none> |
| Package manager | <e.g. none> |
| Build | <e.g. none; open index.html> |
| Test | <e.g. node --check + browser smoke> |
| Run | <e.g. open index.html / python3 -m http.server> |
| Deploy | <e.g. GitHub Pages from main> |

## 4. Working rhythm and gates

Build one thin slice at a time. Suggested order: <scaffold → core → input → persistence → export → polish>.

After each slice:

- run it;
- check the console;
- run the syntax/test command;
- update the docs only if behaviour changed;
- commit.

**Gate:** <the exact commands and checks that must pass before “done”.> The acceptance list in `<PRIMARY_SPEC>` is the contract; do not declare done without evidence for each line.

## 5. Harness: OpenCode

### MCP servers and built-in tools

- **<server/tool> — required.** <why>.
- **<server/tool> — optional.** <when to skip it>.
- **<server/tool> — do not use for this project.** <why>.

Do not add an MCP just because it exists. Prefer the dedicated tool over a shell command when it can do the job; fall back to grep/read when the graph is not indexed.

### Skills

Load only what the current phase needs.

| Phase | Skill |
|---|---|
| Kickoff / scope | `intent-driven-development` |
| UI craft | `make-interfaces-feel-better`, `accessibility` |
| Security | `security-review` |
| Testing / QA | `browser-qa`, `e2e-testing` |
| Gate | `verification-loop` |
| Git | `git-workflow`, `conventional-commit-review` |
| Docs | `docs-governance` / `living-docs-governance` |
| Harness | `opencode`; `deepseek-harness-setup` for DSH |

### Subagents

- `planner` once for the phase plan.
- `code-reviewer` after each major phase.
- `security-reviewer` before public release.
- `e2e-runner` if the project has a browser flow and Playwright is available.
- `doc-updater` for docs.
- Do not delegate the whole build without the spec; keep the main thread on the contract.

## 6. Harness: DeepSeek Harness

DSH reads `AGENTS.md` at the repo root (and `CLAUDE.md`), plus `~/.dsh/AGENTS.md` globally. This file is the brief in both harnesses.

- **Skills:** native `SKILL.md` discovery from project `.dsh/skills` or `.agents/skills`, then `~/.dsh/skills`. Project roots win. Link only the phase's skills.
- **Hooks:** ECC hooks need the `@deepseek-ai/dsh-hooks-claude-code` bridge. It supports 23 command hooks on 5 of 7 events; `PreCompact`, `PostToolUseFailure` and `SessionEnd` are not bridged. Verify with `dsh --profile <name> --dump-config`; do not assume.
- **Slash commands:** not available; use skills and prompts.
- **Agents:** native dispatch is unverified; do not rely on OpenCode subagent names. Use DSH’s native agents if configured, or run the prompt directly.
- **Plugins / MCPs:** map by capability, not name. Inspect `dsh --profile <name> --dump-config`; use what is actually mounted. CLI (`gh`, `node`, etc.) is often enough.
- **Setup details:** see the project’s `docs/AGENTS-DSH.md` or the ECC `deepseek-harness-setup` skill.

## 7. Tooling matrix

| Capability | OpenCode | DSH |
|---|---|---|
| Code discovery | `codebase-memory-mcp` when indexed; else grep/read | native search; codebase-memory only if mounted and indexed |
| Browser / UI test | `browser` tool; Playwright MCP optional | mounted browser/Playwright plugin |
| GitHub | `gh` CLI | `gh` CLI |
| Docs / APIs | web search/fetch; docs-lookup subagent | native web search/fetch |
| Skills | `skill` tool; ECC catalogue | native `SKILL.md` roots |
| Hooks | ECC hooks | bridge; limited events |
| Agents | subagents | native dispatch unverified |
| Deploy | `gh` / Pages | `gh` / Pages |

Do not add a second tool for a capability that is already covered. If a tool is missing, say so and use the fallback; do not claim a check you did not run.

## 8. Handover convention

Handovers are numbered and project-named:

```
NN-PROJECT-HANDOVER.md
```

Number first so the files sort and the console tab identifies the project. Examples: `01-MAGNET-NAPKIN-HANDOVER.md`, `02-<PROJECT>-HANDOVER.md`.

Do not create a new handover unless asked. Keep the current one current; use `README.md` / `CHANGELOG.md` for progress.

## 9. Session kickoff

> Build **<PROJECT>** from `<PRIMARY_SPEC>`. Read it in full, then `AGENTS.md`. Restate the MVP, the non-goals and the gate in your own words. Build one slice at a time and stop at the gate. Do not add stretch features. <Any hard prohibition, e.g. “Do not build an MCP in this session.”>

## 10. Template cleanup checklist

- [ ] Replace every `<PLACEHOLDER>`.
- [ ] Delete rows/rows that do not apply (e.g. no DSH, no browser).
- [ ] Name the exact primary spec and the exact acceptance list.
- [ ] Name the exact gate commands.
- [ ] Name the MCPs that are actually configured, not the ones that sound useful.
- [ ] Name the skills the project actually needs; remove the rest.
- [ ] Add the handover number and name.
- [ ] Keep it short enough that a model will read it.
