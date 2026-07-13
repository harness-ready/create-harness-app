# Roadmap

> Where `@harness-ready/create-app` is heading. Items track the move from
> "useful v1 scaffolder" toward a trustworthy, self-verifying harness toolkit.
> Every item has a tracking issue (linked below); browse them all on the
> [issues board](https://github.com/harness-ready/create-harness-app/issues?q=is%3Aopen+label%3Aenhancement+label%3Abug).

The guiding principle is the project's own thesis: a good harness combines
**feed-forward guides** (`AGENTS.md`, architecture docs) with **feedback
sensors** (lint, hooks, CI, evals). The roadmap applies that lens to the tool
itself — the highest-value work is making the generator *verifiable* before
making it *broader*.

## Status legend

- 🔴 not started · 🟡 in progress · 🟢 done

---

## P0 — Make the foundation trustworthy

These block confidence in every generated project and should land first.

| | Item | Issue |
|---|------|-------|
| 🔴 | **Generator test suite** — snapshot/golden tests across the full stack matrix (language × framework × agent × team × CI) | [#1](issues/1) |
| 🔴 | **Fix the CI / publish workflow** — the release job runs `npm test`, which fails because no `test` script exists | [#2](issues/2) |
| 🔴 | **Localize coding conventions** — English by default, Chinese set as an opt-in locale | [#3](issues/3) |

`lib/templates.js` is ~2000 lines and mutation-prone; there is currently no
test coverage and `package.json` has no `test` script. `CODING_CONVENTIONS` is
hardcoded in Chinese and injected into every generated `AGENTS.md` /
`CLAUDE.md` / `.cursor/rules`, regardless of the user's language.

## P1 — Close the agent-coverage gap and harden output

| | Item | Issue |
|---|------|-------|
| 🔴 | **Dedicated Copilot + Codex config** — emit `.github/copilot-instructions.md` and Codex config; verify the "Multiple" path emits all agent configs | [#4](issues/4) |
| 🔴 | **Self-verification of generated projects** — after scaffolding, assert the produced project passes its own gate (`lint → type-check → test`) | [#5](issues/5) |

Today selecting Copilot or Codex produces nothing agent-specific — they fall
back to the generic `AGENTS.md` only.

## P2 — Beyond greenfield scaffolding

| | Item | Issue |
|---|------|-------|
| 🔴 | **`init` mode for existing repos** — inject harness config into an existing project without re-scaffolding | [#6](issues/6) |
| 🔴 | **Reproducible scaffolds** — `.harnessrc` config file, `--preset` flags, and template-extension hooks for team-specific conventions | [#7](issues/7) |
| 🔴 | **Expanded sensor surface** — Dependabot/Renovate, secret scanning (gitleaks), commitlint/semantic-release, Dockerfile | [#8](issues/8) |

## P3 — Ecosystem and forward-compatibility

| | Item | Issue |
|---|------|-------|
| 🔴 | **More stacks + MCP/tool-config generation** — C#, Ruby, PHP, mobile; emit MCP server / tool config as harness design formalizes | [#9](issues/9) |
| 🔴 | **ADRs, onboarding docs, versioned template upgrades** — Architecture Decision Records, contributor onboarding, and an upgrade path for existing projects | [#10](issues/10) |

---

## How to contribute

Pick any open issue above, leave a comment claiming it, and open a PR against
`main`. P0 items are especially welcome — the test suite (#1) unblocks the CI
fix (#2) and protects every later change.
