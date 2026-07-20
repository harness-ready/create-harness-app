# @harness-ready/create-app

> Generate a **harness-engineering-ready** project for AI coding agents (Claude Code, Cursor, Codex, Copilot).

```sh
npx @harness-ready/create-app my-project
```

## What it does

This tool scaffolds a new project that comes pre-configured for optimal AI-assisted development. Instead of manually creating `AGENTS.md`, `CLAUDE.md`, `.cursor/rules/`, lint configs, pre-commit hooks, CI pipelines, and architecture docs — you get all of it generated in one command, tailored to your language, framework, and team setup.

## Quick start

```sh
# Interactive mode
npx @harness-ready/create-app my-project

# Skip prompts (uses TypeScript + Express defaults)
npx @harness-ready/create-app my-project --yes

# Add harness config to an EXISTING project (detects the stack, leaves your
# source/manifests/README untouched)
npx @harness-ready/create-app init
```

You'll be asked:

| Question | Options |
|----------|---------|
| Language | TypeScript, Python, Go, Java, Rust |
| Framework | Next.js / Express / FastAPI / Spring Boot / Gin / Actix / ... |
| Package manager | pnpm / npm / yarn / bun / uv / poetry / Maven / Gradle / cargo |
| AI coding agent | Claude Code, Cursor, Codex, Copilot, Multiple |
| Team mode | Solo, Small team, Large team (PR-based) |
| CI provider | GitHub Actions, GitLab CI, None |

## What gets generated

```
my-project/
├── AGENTS.md              # Agent instructions (read by all tools)
├── CLAUDE.md              # Claude Code specific (if selected)
├── .cursor/rules/         # Cursor rules (if selected)
├── .editorconfig
├── .gitignore
├── README.md
├── [lint config]          # biome.json / ruff.toml / .golangci.yml / checkstyle.xml / clippy.toml
├── [project config]       # package.json / pyproject.toml / go.mod / pom.xml / Cargo.toml
├── .husky/pre-commit      # or .githooks/pre-commit (lint + type-check + test)
├── .github/workflows/ci.yml   # or .gitlab-ci.yml (if CI selected)
├── scripts/
│   └── setup-hooks.sh     # One-shot hook activation
├── docs/
│   └── architecture.md    # Architecture scaffold with module boundaries
├── src/                   # Language-specific project skeleton
└── tests/                 # Smoke test (passing out of the box)
```

## Supported stacks

| Language | Frameworks | Lint | Test | Package managers |
|----------|-----------|------|------|-----------------|
| **TypeScript** | Next.js, Express, Nest.js, None | Biome | Vitest | pnpm, npm, yarn, bun |
| **Python** | FastAPI, Django, Flask, None | Ruff | pytest | uv, Poetry, pip |
| **Go** | Standard, Gin, Fiber, None | golangci-lint | go test | go modules |
| **Java** | Spring Boot, Quarkus, None | Checkstyle | JUnit 5 | Maven, Gradle |
| **Rust** | Standard, Actix-web, Axum, None | Clippy | cargo test | Cargo |

## Documentation

The `docs/` directory contains the research and analysis behind this tool:

| Document | Description |
|----------|-------------|
| [research-report.md](./docs/research-report.md) | Deep research report on harness engineering: definitions, empirical evidence (SWE-agent, Reflexion, context management), landscape of harnesses and eval benchmarks, open problems |
| [research-report-zh.md](./docs/research-report-zh.md) | 中文版研究报告 |
| [practitioner-guide-zh.md](./docs/practitioner-guide-zh.md) | 面向开发者的实践指南：基于 Fowler 的 guide/sensor 框架，覆盖 AGENTS.md 配置、lint/hooks/CI 设置、项目评估清单 |

## Roadmap

See [ROADMAP.md](./ROADMAP.md) for the project direction, tracked in [GitHub Issues](https://github.com/harness-ready/create-harness-app/issues) under the P0–P3 milestones. The next focus is the generator test suite ([#1](https://github.com/harness-ready/create-harness-app/issues/1)), which unblocks the CI fix.

## Why?

Research shows that the "harness" around an LLM — the tools, context, and feedback loops — matters as much as the model itself. Martin Fowler calls this **harness engineering for coding agent users**: the practice of building feed-forward guides (AGENTS.md, architecture docs) and feedback sensors (lint, hooks, CI) that make AI coding agents reliable.

This tool automates the initial setup so every new project starts harness-ready.

## Local development

```sh
git clone https://github.com/harness-ready/create-harness-app.git
cd create-harness-app
node bin/cli.js my-test-project --yes
```

## License

MIT
