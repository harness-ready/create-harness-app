// ─────────────────────────────────────────────────
// templates.js — content generators for create-harness-app
//
// Each exported function returns { filepath, content } where `filepath`
// is relative to the project root and `content` is the file body string.
// Functions return null when the artefact does not apply (e.g. a Rust lint
// config, or CLAUDE.md when the user did not pick Claude Code). The caller
// can filter out nulls with `.filter(Boolean)`.
//
// NOTE: this module intentionally imports no Node.js built-ins. It only
// returns strings — disk I/O is the caller's responsibility.
// ─────────────────────────────────────────────────

import { LANGUAGES, conventionsFor, FRAMEWORK_DIRS, CI_PROVIDERS, SENSORS, DEPENDABOT_ECOSYSTEM } from './config.js';

// ─────────────────────────────────────────────────
// Internal helpers
// ─────────────────────────────────────────────────

/** Resolve a command from config. Config values are either strings or
 *  functions that take the package manager, and may be null. */
function resolveCommand(cmd, packageManager) {
  if (cmd == null) return null;
  if (typeof cmd === 'function') return cmd(packageManager);
  return cmd;
}

function langConfig(language) {
  return LANGUAGES[language];
}

function frameworkMeta(language, framework) {
  const cfg = LANGUAGES[language];
  return cfg.frameworks.find((f) => f.value === framework) || { value: framework, label: framework };
}

function pmMeta(language, packageManager) {
  const cfg = LANGUAGES[language];
  return cfg.packageManagers.find((p) => p.value === packageManager) || { value: packageManager, label: packageManager };
}

/** Normalise a project / module name to a kebab-case identifier. */
function kebab(name) {
  return (
    String(name || 'app')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'app'
  );
}

/** Python distribution / import name (snake_case). */
function pyPkg(name) {
  return kebab(name).replace(/-/g, '_');
}

/** Java base package — stable and valid across groupId/artifactId. */
function javaBasePackage() {
  return 'com.example';
}

/**
 * Build an ordered list of [label, command] pairs for the "common commands"
 * sections, taking the package manager and (for Java) the build tool into
 * account. Null commands are filtered out.
 */
function buildCommands(answers) {
  const { language, packageManager, framework } = answers;
  const cfg = LANGUAGES[language];

  if (language === 'java') {
    const j = javaCommands(packageManager, framework);
    return [
      ['Install / compile', j.install],
      ['Run tests', j.test],
      ['Run / dev server', j.run],
      ['Build (skip tests)', j.build],
      ['Lint (checkstyle)', j.lint],
    ].filter(([, c]) => c);
  }

  return [
    ['Install dependencies', resolveCommand(cfg.installCommand, packageManager)],
    ['Run tests', resolveCommand(cfg.testCommand, packageManager)],
    ['Run tests (watch / TDD)', resolveCommand(cfg.testDevCommand, packageManager)],
    ['Type check', resolveCommand(cfg.typeCheckCommand, packageManager)],
    ['Build', resolveCommand(cfg.buildCommand, packageManager)],
    ['Dev server', resolveCommand(cfg.devCommand, packageManager)],
  ].filter(([, c]) => c);
}

/** Java has no static commands in config (they depend on the build tool). */
function javaCommands(packageManager, framework) {
  const isMaven = packageManager === 'maven';
  const isSpring = framework === 'spring-boot';
  const isQuarkus = framework === 'quarkus';
  if (isMaven) {
    return {
      install: 'mvn -B -ntp compile',
      test: 'mvn -B -ntp test',
      build: 'mvn -B -ntp package -DskipTests',
      run: isSpring ? 'mvn spring-boot:run' : isQuarkus ? 'mvn quarkus:dev' : 'mvn -B -ntp exec:java',
      lint: 'mvn -B -ntp checkstyle:check',
    };
  }
  // Gradle (Kotlin DSL)
  return {
    install: './gradlew --refresh-dependencies build -x test',
    test: './gradlew test',
    build: './gradlew build -x test',
    run: isSpring ? './gradlew bootRun' : isQuarkus ? './gradlew quarkusDev' : './gradlew run',
    lint: './gradlew checkstyleMain',
  };
}

/** The canonical "run the tests" command for the chosen stack. */
function primaryTestCommand(answers) {
  const { language, packageManager, framework } = answers;
  if (language === 'java') return javaCommands(packageManager, framework).test;
  const resolved = resolveCommand(LANGUAGES[language].testCommand, packageManager);
  if (resolved) return resolved;
  // Sensible fallback per language
  if (language === 'typescript') return 'npx vitest --run';
  if (language === 'python') return 'python -m pytest';
  if (language === 'go') return 'go test ./...';
  if (language === 'rust') return 'cargo test';
  return 'echo "no test command configured"';
}

/** The canonical "type check" command (may be null for stacks without one). */
function primaryTypeCheckCommand(answers) {
  const { language, packageManager } = answers;
  return resolveCommand(LANGUAGES[language].typeCheckCommand, packageManager);
}

/** Lint invocation used by hooks & CI. */
function lintCommand(answers) {
  const { language, packageManager, framework } = answers;
  switch (language) {
    case 'typescript':
      return 'npx biome check .';
    case 'python':
      return 'ruff check .';
    case 'go':
      return 'golangci-lint run ./...';
    case 'rust':
      return 'cargo clippy -- -D warnings';
    case 'java':
      return javaCommands(packageManager, framework).lint;
    default:
      return null;
  }
}

function commandTable(entries) {
  const header = '| Task | Command |\n| --- | --- |';
  const rows = entries.map(([label, cmd]) => `| ${label} | \`${cmd}\` |`).join('\n');
  return `${header}\n${rows}`;
}

function bulletList(items) {
  return items.map((s) => `- ${s}`).join('\n');
}

function dirList(dirs) {
  return dirs.map((d) => `- \`${d}\``).join('\n');
}

// ─────────────────────────────────────────────────
// 1. AGENTS.md
// ─────────────────────────────────────────────────

/**
 * generateAgentsMd — the primary harness file consumed by AI coding agents.
 * Pulls tech-stack facts from LANGUAGES, conventions from CODING_CONVENTIONS,
 * and project layout from FRAMEWORK_DIRS.
 */
export function generateAgentsMd(answers) {
  const { projectName, description, language, framework, packageManager, teamMode } = answers;
  const cfg = LANGUAGES[language];
  const conventions = conventionsFor(language, answers.locale);
  const dirs = (FRAMEWORK_DIRS[language] && FRAMEWORK_DIRS[language][framework]) || [];
  const fMeta = frameworkMeta(language, framework);
  const pMeta = pmMeta(language, packageManager);
  const commands = buildCommands(answers);
  const testCmd = primaryTestCommand(answers);
  const typeCmd = primaryTypeCheckCommand(answers);

  const prSection =
    teamMode === 'large'
      ? `
## Pull Request Workflow

This project uses a **PR-based workflow** for all changes:

1. **Branch** off \`main\`: \`feat/<scope>\`, \`fix/<scope>\`, \`chore/<scope>\`.
2. **Keep PRs small** — one logical change per PR, under ~400 lines where possible.
3. **Before pushing** run the full local gate:
   \`\`\`sh
   ${[lintCommand(answers), typeCmd, testCmd].filter(Boolean).join('\n   ')}
   \`\`\`
4. **Open a PR** and fill in the template (what / why / how to test).
5. **CI must be green** before review — fix failures before requesting review.
6. **At least one approval** required. Address review comments inline.
7. **Squash-merge** into \`main\` and delete the feature branch.

Agents: when finishing a task, summarise what changed, which tests you ran,
and any follow-ups, in the PR description.
`
      : '';

  const content = `<!-- AUTO-GENERATED by create-harness-app — harness config for AI coding agents. Safe to edit. -->

# ${projectName}

> ${description || 'No description provided yet.'}

## Overview

**${projectName}** is a ${cfg.label} project built with ${fMeta.label}.
This file is the single source of truth for any AI coding agent working in this
repository. Read it first, every session.

## Tech Stack

| Layer | Choice |
| --- | --- |
| Language | \`${cfg.label}\` |
| Framework | \`${fMeta.label}\` |
| Package manager | \`${pMeta.label}\` |
| Test framework | \`${cfg.testFramework}\` |
| Lint / format | \`${cfg.lintTool}\` |

## Common Commands

${commandTable(commands)}

> Always run the full gate (\`lint → type-check → test\`) before declaring a task done.

## Coding Conventions

### Style
${bulletList(conventions.style)}

### Imports
- ${conventions.importStyle}
${
  Array.isArray(answers.extraConventions) && answers.extraConventions.length
    ? '\n### Team Conventions\n' + bulletList(answers.extraConventions)
    : ''
}
## Project Structure

${dirList(dirs)}

> Keep new code inside the layout above. Cross-cutting helpers go in \`lib/\`,
> \`core/\`, or \`common/\` as appropriate for the framework.

## Testing Conventions
${bulletList(conventions.testing)}

### Running tests
- Full suite: \`${testCmd}\`
${typeCmd ? `- Type check: \`${typeCmd}\`` : ''}
- Treat a red test as a stop-the-line event — do not push broken tests.

## Agent Workflow

- **Explore before editing.** Read the relevant module and its tests first.
- **Make atomic, well-scoped changes.** Prefer many small commits over one big one.
- **Update tests alongside code.** Never lower coverage to make a test pass.
- **Leave the gate green.** After your changes, run lint + type-check + tests.
- **Document "why", not "what".** Commit messages and comments explain intent.
- **When unsure, ask.** Surface assumptions and open questions rather than guessing silently.

${prSection}---
This file was generated by **create-harness-app**. Review and customise it as the
project evolves — the conventions above are a starting point, not a straitjacket.
`;

  return { filepath: 'AGENTS.md', content };
}

// ─────────────────────────────────────────────────
// 2. CLAUDE.md
// ─────────────────────────────────────────────────

/**
 * generateClaudeMd — Claude Code specific instructions. Returns null when the
 * user did not select Claude Code (solo or "multiple").
 */
export function generateClaudeMd(answers) {
  if (answers.codingAgent !== 'claude-code' && answers.codingAgent !== 'multiple') {
    return null;
  }
  const { projectName, language } = answers;
  const testCmd = primaryTestCommand(answers);
  const typeCmd = primaryTypeCheckCommand(answers);
  const lint = lintCommand(answers);
  const conventions = conventionsFor(language, answers.locale);

  const content = `<!-- AUTO-GENERATED by create-harness-app. Claude Code instructions for ${projectName}. -->

@import AGENTS.md

# Claude Code Guidelines

These instructions refine the project-wide \`AGENTS.md\` for Claude Code
specifically. They do not replace it — always honour both.

## Non-negotiables

- **Read before edit.** Use the Read tool on a file before editing it. Never
  blind-overwrite. Understand the surrounding context and existing patterns.
- **Run tests after changes.** After any code change, run the test suite:
  \`\`\`sh
  ${testCmd}
  \`\`\`
  ${typeCmd ? `And type-check:\n  \`\`\`sh\n  ${typeCmd}\n  \`\`\`` : ''}
  Do not report a task complete while tests are red.
- **Use plan mode for complex tasks.** For multi-file refactors, architectural
  changes, or anything touching >3 files, enter plan mode first and get
  alignment before writing code.

## Workflow

1. **Re-read** \`AGENTS.md\` and the module you are about to touch.
2. **Write a plan** for anything non-trivial.
3. **Make the change** in small, reviewable steps.
4. **Update or add tests** in the same change.
5. **Run the gate:** \`${[lint, typeCmd].filter(Boolean).join('` → `')}\` then \`${testCmd}\`.
6. **Summarise** what you changed, what you tested, and any risks.

## Testing reminders
${bulletList(conventions.testing)}

## Editing discipline

- Prefer the Edit tool over Write for existing files — produce minimal diffs.
- Do not reformat untouched code in the same change.
- Preserve existing tests; if a test must change, explain why in the commit.
- Keep commits focused: one logical change per commit.

---
Generated by **create-harness-app**.
`;

  return { filepath: 'CLAUDE.md', content };
}

// ─────────────────────────────────────────────────
// 3. .cursor/rules/project.mdc
// ─────────────────────────────────────────────────

/**
 * generateCursorRules — Cursor rule file. Returns null when Cursor was not chosen.
 */
export function generateCursorRules(answers) {
  if (answers.codingAgent !== 'cursor' && answers.codingAgent !== 'multiple') {
    return null;
  }
  const { projectName, description, language, framework } = answers;
  const cfg = LANGUAGES[language];
  const conventions = conventionsFor(language, answers.locale);
  const dirs = (FRAMEWORK_DIRS[language] && FRAMEWORK_DIRS[language][framework]) || [];
  const fMeta = frameworkMeta(language, framework);

  const content = `---
description: Project conventions, tech stack, and coding standards for ${projectName}
globs:
  - "**/*"
alwaysApply: true
---

# ${projectName} — Cursor Rules

> ${description || 'AI-assisted coding rules for this project.'}

## Tech Stack
- **Language:** ${cfg.label}
- **Framework:** ${fMeta.label}
- **Test framework:** ${cfg.testFramework}
- **Linter / formatter:** ${cfg.lintTool}

## Coding Standards

### Style
${bulletList(conventions.style)}

### Imports
- ${conventions.importStyle}

### Testing
${bulletList(conventions.testing)}

## File Structure Rules
${dirs.map((d) => `- \`${d}\` — place ${dirPurpose(d, framework, language)}`).join('\n')}

## Cursor Workflow
- Always read a file before proposing edits to it.
- Match the existing style of the file you are editing; do not reformat untouched code.
- After generating code, also generate or update the corresponding tests.
- Run the linter and tests before marking a task complete.
- For large changes, outline a plan in chat first and confirm scope.
- Never use \`any\` / untyped escapes — respect the conventions above.

---
Generated by **create-harness-app**.
`;

  return { filepath: '.cursor/rules/project.mdc', content };
}

// ─────────────────────────────────────────────────
// 2b. GitHub Copilot instructions
// ─────────────────────────────────────────────────

/**
 * generateCopilotInstructions — GitHub Copilot reads
 * `.github/copilot-instructions.md` and injects it as custom instructions.
 * Emitted when the user chose Copilot or "Multiple"; returns null otherwise.
 *
 * Note on Codex: OpenAI Codex reads `AGENTS.md` directly and has no dedicated
 * instructions file, so it needs no generator here — the generic `AGENTS.md`
 * (always emitted) already covers it.
 */
export function generateCopilotInstructions(answers) {
  if (answers.codingAgent !== 'copilot' && answers.codingAgent !== 'multiple') {
    return null;
  }
  const { projectName, description, language, framework } = answers;
  const cfg = LANGUAGES[language];
  const conventions = conventionsFor(language, answers.locale);
  const fMeta = frameworkMeta(language, framework);
  const testCmd = primaryTestCommand(answers);
  const typeCmd = primaryTypeCheckCommand(answers);
  const lint = lintCommand(answers);
  const gate = [lint, typeCmd].filter(Boolean).join(' && ');

  const content = `<!-- AUTO-GENERATED by create-harness-app. GitHub Copilot custom instructions for ${projectName}. -->

# ${projectName} — Copilot Instructions

> ${description || 'GitHub Copilot custom instructions.'}

These instructions refine the project-wide \`AGENTS.md\` for GitHub Copilot.
\`AGENTS.md\` is the single source of truth — read it first. This file adds
Copilot-specific reminders.

## Tech Stack
- **Language:** ${cfg.label}
- **Framework:** ${fMeta.label}
- **Test framework:** ${cfg.testFramework}
- **Linter / formatter:** ${cfg.lintTool}

## Coding Standards

### Style
${bulletList(conventions.style)}

### Testing
${bulletList(conventions.testing)}

## Copilot Workflow
- Read a file before editing it; respect existing patterns and style.
- Keep changes small and reviewable — one logical change per suggestion.
- Add or update tests alongside any code change.
- Before marking a task done, run the full gate:
  \`\`\`sh
  ${gate}
  ${testCmd}
  \`\`\`
- Never lower coverage or disable a test just to make it pass.

---
Generated by **create-harness-app**.
`;

  return { filepath: '.github/copilot-instructions.md', content };
}

/** Human-readable one-liner for a framework directory. */
function dirPurpose(dir, framework, language) {
  const d = dir.replace(/\/$/, '');
  const map = {
    'src': 'application source code',
    'src/lib': 'shared, framework-agnostic helpers',
    'src/routes': 'HTTP route handlers / controllers',
    'src/middleware': 'request middleware',
    'src/api': 'API route definitions',
    'src/components': 'reusable UI components',
    'src/app': 'framework app entry / routing root',
    'src/types': 'shared TypeScript type definitions',
    'src/models': 'data models / ORM entities',
    'src/services': 'business logic and domain services',
    'src/core': 'core domain primitives and config',
    'src/modules': 'feature modules (co-located by domain)',
    'src/common': 'cross-cutting helpers shared across modules',
    'src/config': 'application configuration',
    'src/templates': 'server-rendered templates',
    'src/apps': 'Django applications',
    'cmd': 'executable entry points (one main per binary)',
    'internal': 'private application packages (not importable externally)',
    'internal/handler': 'HTTP handlers',
    'internal/middleware': 'HTTP middleware',
    'internal/model': 'domain models',
    'pkg': 'public, importable library packages',
    'api': 'API definitions (OpenAPI, schemas, contracts)',
    'public': 'static assets served as-is',
    'tests': 'integration and end-to-end tests',
    'docs': 'documentation and ADRs',
    'benches': 'benchmarks',
    'src/main/java': 'Java main sources',
    'src/main/resources': 'runtime resources / config',
    'src/test/java': 'Java test sources',
    'src/test/resources': 'test resources',
    'src/bin': 'supplementary binary entry points',
  };
  return map[d] || 'project files';
}

// ─────────────────────────────────────────────────
// 4. Lint configuration
// ─────────────────────────────────────────────────

/**
 * generateLintConfig — language-specific linter/formatter config.
 * Returns null for Rust (clippy is built into cargo) and for Python the lint
 * config is embedded in pyproject.toml (see generateProjectConfig); here we
 * return the ruff/pyright snippet for standalone reference.
 */
export function generateLintConfig(answers) {
  const { language } = answers;

  switch (language) {
    case 'typescript':
      return { filepath: 'biome.json', content: biomeConfig() };

    case 'python':
      // For Python the canonical home is pyproject.toml (see generateProjectConfig).
      // This snippet is provided for reference / standalone tooling.
      return { filepath: 'pyproject.toml', content: pythonRuffSnippet() };

    case 'go':
      return { filepath: '.golangci.yml', content: golangciConfig() };

    case 'java':
      return { filepath: 'checkstyle.xml', content: checkstyleConfig() };

    case 'rust':
      // clippy + rustfmt are built into cargo; no extra config file needed.
      return null;

    default:
      return null;
  }
}

function biomeConfig() {
  // Authored in Biome's canonical format so `biome check .` passes on the
  // generated file itself (Biome's JSON formatter collapses short arrays).
  return `{
  "$schema": "https://biomejs.dev/schemas/1.9.4/schema.json",
  "vcs": {
    "enabled": false,
    "clientKind": "git",
    "useIgnoreFile": true
  },
  "files": {
    "ignoreUnknown": true,
    "ignore": ["dist", "node_modules", ".next", "coverage", "*.tsbuildinfo"]
  },
  "formatter": {
    "enabled": true,
    "indentStyle": "space",
    "indentWidth": 2,
    "lineWidth": 100,
    "lineEnding": "lf"
  },
  "javascript": {
    "formatter": {
      "quoteStyle": "single",
      "semicolons": "always",
      "trailingCommas": "all"
    }
  },
  "linter": {
    "enabled": true,
    "rules": {
      "recommended": true,
      "suspicious": {
        "noExplicitAny": "error",
        "noConsole": "warn"
      },
      "style": {
        "noNonNullAssertion": "warn",
        "useImportType": "error",
        "useNamingConvention": "off"
      },
      "correctness": {
        "noUnusedVariables": "warn"
      }
    }
  }
}
`;
}

function pythonRuffSnippet() {
  return `# Ruff + Pyright configuration for this project.
# In a uv-style project this lives in pyproject.toml; the canonical copy is
# generated by generateProjectConfig. These sections are shown here for reference.

[tool.ruff]
line-length = 100
target-version = "py312"
extend-exclude = ["migrations", ".venv"]

[tool.ruff.lint]
# E/pycodestyle errors, F/pyflakes, W/warnings, I/isort, UP/pyupgrade
select = ["E", "F", "W", "I", "UP"]
ignore = ["E501"]  # line length handled by formatter

[tool.ruff.lint.isort]
known-first-party = ["src"]

[tool.ruff.format]
quote-style = "double"
indent-style = "space"

[tool.pyright]
include = ["src"]
exclude = ["**/__pycache__", ".venv"]
pythonVersion = "3.12"
typeCheckingMode = "standard"
venvPath = "."
venv = ".venv"
`;
}

function golangciConfig() {
  return `# golangci-lint configuration — generated by create-harness-app
run:
  timeout: 5m
  go: "1.22"
  modules-download-mode: readonly

linters:
  disable-all: true
  enable:
    - govet
    - errcheck
    - gofmt
    - staticcheck
    - unused
    - ineffassign
    - revive
    - gosimple

linters-settings:
  errcheck:
    check-type-assertions: true
    check-blank: true
  revive:
    rules:
      - name: exported
        disabled: false

issues:
  exclude-use-default: false
  max-issues-per-linter: 0
  max-same-issues: 0
`;
}

function checkstyleConfig() {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE module PUBLIC
    "-//Checkstyle//DTD Checkstyle Configuration 1.3//EN"
    "https://checkstyle.org/dtds/configuration_1_3.dtd">
<!--
  Checkstyle configuration approximating Google Java Style.
  Generated by create-harness-app — adjust to fit your team's taste.
-->
<module name="Checker">
  <property name="charset" value="UTF-8"/>
  <property name="severity" value="warning"/>
  <property name="fileExtensions" value="java"/>

  <!-- File-level checks -->
  <module name="FileTabCharacter"/>
  <module name="LineLength">
    <property name="max" value="100"/>
    <property name="ignorePattern" value="^package.*|^import.*|a href|href|http://|https://|ftp://"/>
  </module>

  <module name="TreeWalker">
    <!-- Imports -->
    <module name="AvoidStarImport"/>
    <module name="UnusedImports"/>
    <module name="ImportOrder">
      <property name="groups" value="*,javax,java"/>
      <property name="ordered" value="true"/>
      <property name="separated" value="true"/>
      <property name="option" value="bottom"/>
    </module>

    <!-- Naming -->
    <module name="ConstantName"/>
    <module name="LocalFinalVariableName"/>
    <module name="LocalVariableName"/>
    <module name="MemberName"/>
    <module name="MethodName"/>
    <module name="PackageName"/>
    <module name="ParameterName"/>
    <module name="StaticVariableName"/>
    <module name="TypeName"/>

    <!-- Whitespace -->
    <module name="GenericWhitespace"/>
    <module name="MethodParamPad"/>
    <module name="NoWhitespaceAfter"/>
    <module name="NoWhitespaceBefore"/>
    <module name="OperatorWrap"/>
    <module name="ParenPad"/>
    <module name="TypecastParenPad"/>
    <module name="WhitespaceAfter"/>
    <module name="WhitespaceAround"/>

    <!-- Coding / blocks -->
    <module name="EmptyBlock"/>
    <module name="LeftCurly"/>
    <module name="NeedBraces"/>
    <module name="RightCurly"/>
    <module name="EmptyStatement"/>
    <module name="EqualsHashCode"/>
    <module name="MissingSwitchDefault"/>
    <module name="SimplifyBooleanExpression"/>
    <module name="SimplifyBooleanReturn"/>

    <!-- Javadoc -->
    <module name="MissingJavadocType"/>
  </module>
</module>
`;
}

// ─────────────────────────────────────────────────
// 5. Pre-commit hook
// ─────────────────────────────────────────────────

/**
 * generatePreCommit — executable shell pre-commit hook. Lives under .husky/ for
 * Node-aware stacks (works with husky OR git core.hooksPath) and .githooks/ for
 * stacks without Node, where it is wired up via \`git config core.hooksPath\`.
 */
export function generatePreCommit(answers) {
  const { language } = answers;
  const hasNode = language === 'typescript' || language === 'python';
  const filepath = hasNode ? '.husky/pre-commit' : '.githooks/pre-commit';
  const header = `#!/usr/bin/env sh
# Pre-commit hook — generated by create-harness-app.
# Usage:
${
  hasNode
    ? '#   - With husky: run "npx husky" once (see scripts/setup-hooks.sh).\n#   - Without husky: git config core.hooksPath .husky'
    : '#   - No Node required. Run scripts/setup-hooks.sh once per clone,\n#     or: git config core.hooksPath .githooks'
}
# Exit non-zero to abort the commit.

. "$(dirname -- "$0")/_/husky.sh" 2>/dev/null || true
set -e
`;

  let body;
  switch (language) {
    case 'typescript':
      body = `
echo "→ Biome (lint + format, write)"
npx biome check --write

echo "→ Type check (tsc --noEmit)"
npx tsc --noEmit

echo "→ Tests (vitest)"
npx vitest --run

echo "✓ pre-commit checks passed"
`;
      break;
    case 'python':
      body = `
echo "→ Ruff (lint + autofix)"
ruff check --fix .
ruff format .

echo "→ Pyright (type check)"
pyright || python -m pyright

echo "→ Pytest"
python -m pytest -x --tb=short

echo "✓ pre-commit checks passed"
`;
      break;
    case 'go':
      body = `
echo "→ gofmt"
gofmt -l -s . | tee /dev/stderr | (! read) || (echo "files need gofmt -w"; exit 1)
gofmt -w .

echo "→ go vet"
go vet ./...

echo "→ go test"
go test ./...

echo "✓ pre-commit checks passed"
`;
      break;
    case 'java':
      body = javaPreCommitBody(answers);
      break;
    case 'rust':
      body = `
echo "→ rustfmt (check)"
cargo fmt -- --check

echo "→ clippy (-D warnings)"
cargo clippy -- -D warnings

echo "→ cargo test"
cargo test

echo "✓ pre-commit checks passed"
`;
      break;
    default:
      body = '\necho "(no pre-commit checks configured)"\n';
  }

  return { filepath, content: header + body };
}

function javaPreCommitBody(answers) {
  const isMaven = answers.packageManager === 'maven';
  if (isMaven) {
    return `
echo "→ Checkstyle"
mvn -B -ntp checkstyle:check

echo "→ Tests"
mvn -B -ntp test

echo "✓ pre-commit checks passed"
`;
  }
  return `
echo "→ Checkstyle"
./gradlew checkstyleMain

echo "→ Tests"
./gradlew test

echo "✓ pre-commit checks passed"
`;
}

// ─────────────────────────────────────────────────
// 6. CI pipeline
// ─────────────────────────────────────────────────

/**
 * generateCI — CI pipeline for the selected provider. Returns null when the
 * user opted out of CI.
 */
export function generateCI(answers) {
  switch (answers.ciProvider) {
    case 'github':
      return { filepath: '.github/workflows/ci.yml', content: githubActionsCI(answers) };
    case 'gitlab':
      return { filepath: '.gitlab-ci.yml', content: gitlabCI(answers) };
    case 'none':
    default:
      return null;
  }
}

function githubActionsCI(answers) {
  const { language, packageManager } = answers;
  const steps = ghSetupSteps(language, packageManager);
  const verify = ghVerifySteps(answers);

  return `# CI pipeline — generated by create-harness-app
name: CI

on:
  push:
    branches: [main, master]
  pull_request:

permissions:
  contents: read

concurrency:
  group: ci-\${{ github.ref }}
  cancel-in-progress: true

jobs:
  ci:
    name: lint · type-check · test
    runs-on: ubuntu-latest
    timeout-minutes: 15
    steps:
      - uses: actions/checkout@v4
${steps.indent(6)}
${verify}
`;
}

/** Returns { setupLines[], indent(n) } for the setup + install steps.
 *  The authored lines already encode their own relative indentation (starting
 *  at column 0), so indent(n) shifts the whole block by n spaces without
 *  flattening nested `with:` blocks. */
function ghSetupSteps(language, packageManager) {
  const lines = setupLinesFor(language, packageManager);
  return {
    indent: (n) =>
      lines
        .map((l) => (l.length ? ' '.repeat(n) + l : ''))
        .join('\n'),
  };
}

function setupLinesFor(language, packageManager) {
  switch (language) {
    case 'typescript':
      return tsSetupLines(packageManager);
    case 'python':
      return pythonSetupLines(packageManager);
    case 'go':
      return [
        '- uses: actions/setup-go@v5',
        '  with:',
        '    go-version: "1.22"',
        '    cache: true',
        '- run: go mod download',
      ];
    case 'java':
      return javaSetupLines(packageManager);
    case 'rust':
      return [
        '- uses: dtolnay/rust-toolchain@stable',
        '  with:',
        '    components: rustfmt, clippy',
        '- uses: Swatinem/rust-cache@v2',
      ];
    default:
      return [];
  }
}

function tsSetupLines(packageManager) {
  switch (packageManager) {
    case 'pnpm':
      return [
        '- uses: pnpm/action-setup@v4',
        '  with:',
        '    version: 9',
        '- uses: actions/setup-node@v4',
        '  with:',
        '    node-version: "20"',
        '    cache: pnpm',
        '- run: pnpm install --frozen-lockfile',
      ];
    case 'yarn':
      return [
        '- uses: actions/setup-node@v4',
        '  with:',
        '    node-version: "20"',
        '    cache: yarn',
        '- run: yarn install --frozen-lockfile',
      ];
    case 'bun':
      return [
        '- uses: oven-sh/setup-bun@v2',
        '  with:',
        '    bun-version: latest',
        '- run: bun install --frozen-lockfile',
      ];
    case 'npm':
    default:
      return [
        '- uses: actions/setup-node@v4',
        '  with:',
        '    node-version: "20"',
        '    cache: npm',
        '- run: npm ci',
      ];
  }
}

function pythonSetupLines(packageManager) {
  switch (packageManager) {
    case 'uv':
      return [
        '- uses: actions/setup-python@v5',
        '  with:',
        '    python-version: "3.12"',
        '- uses: astral-sh/setup-uv@v3',
        '  with:',
        '    enable-cache: true',
        '- run: uv sync',
      ];
    case 'poetry':
      return [
        '- uses: actions/setup-python@v5',
        '  with:',
        '    python-version: "3.12"',
        '- run: pip install poetry',
        '- run: poetry install --no-interaction',
      ];
    case 'pip':
    default:
      return [
        '- uses: actions/setup-python@v5',
        '  with:',
        '    python-version: "3.12"',
        '    cache: pip',
        '- run: pip install -e ".[dev]"',
      ];
  }
}

function javaSetupLines(packageManager) {
  if (packageManager === 'gradle') {
    return [
      '- uses: actions/setup-java@v4',
      '  with:',
      '    distribution: temurin',
      '    java-version: "21"',
      '    cache: gradle',
      '- run: ./gradlew build --no-daemon',
    ];
  }
  // maven
  return [
    '- uses: actions/setup-java@v4',
    '  with:',
    '    distribution: temurin',
    '    java-version: "21"',
    '    cache: maven',
    '- run: mvn -B -ntp verify',
  ];
}

/** Lint / type-check / test run steps (already indented to 6 spaces). */
function ghVerifySteps(answers) {
  const { language, packageManager } = answers;
  const i = '      ';
  switch (language) {
    case 'typescript': {
      const pm = ['bun', 'yarn', 'pnpm', 'npm'].includes(packageManager) ? packageManager : 'npm';
      return [
        `${i}- run: ${pm} run lint`,
        `${i}- run: ${pm} run typecheck`,
        `${i}- run: ${pm} run test`,
      ].join('\n');
    }
    case 'python': {
      const runner = packageManager === 'uv' ? 'uv run' : packageManager === 'poetry' ? 'poetry run' : '';
      const r = runner ? runner + ' ' : '';
      const steps = [`${i}- run: ${r}ruff check .`, `${i}- run: ${r}pyright`, `${i}- run: ${r}pytest`];
      return steps.join('\n');
    }
    case 'go':
      return [
        `${i}- uses: golangci/golangci-lint-action@v6`,
        '        with:',
        '          version: latest',
        `${i}- run: go test -race -coverprofile=coverage.out ./...`,
      ].join('\n');
    case 'java':
      if (packageManager === 'gradle') {
        return [
          `${i}- run: ./gradlew checkstyleMain`,
          `${i}- run: ./gradlew test`,
        ].join('\n');
      }
      return [
        `${i}- run: mvn -B -ntp checkstyle:check`,
        `${i}- run: mvn -B -ntp test`,
      ].join('\n');
    case 'rust':
      return [
        `${i}- run: cargo fmt -- --check`,
        `${i}- run: cargo clippy -- -D warnings`,
        `${i}- run: cargo test`,
      ].join('\n');
    default:
      return `${i}- run: echo "no CI steps configured"`;
  }
}

function gitlabCI(answers) {
  const { language, packageManager } = answers;
  const lint = lintCommand(answers);
  const test = primaryTestCommand(answers);
  const typeCmd = primaryTypeCheckCommand(answers);
  const build = resolveCommand(LANGUAGES[language].buildCommand, packageManager);

  const image =
    language === 'typescript'
      ? 'node:20'
      : language === 'python'
        ? 'python:3.12'
        : language === 'go'
          ? 'golang:1.22'
          : language === 'java'
            ? 'eclipse-temurin:21-jdk'
            : language === 'rust'
              ? 'rust:latest'
              : 'alpine:latest';

  const lintScript = [lint, typeCmd].filter(Boolean);
  const before =
    language === 'typescript'
      ? ['before_script:', '  - ' + tsInstallCmd(packageManager)]
      : language === 'python'
        ? ['before_script:', '  - ' + pythonInstallCmd(packageManager)]
        : language === 'go'
          ? ['before_script:', '  - go mod download']
          : language === 'rust'
            ? ['before_script:', '  - cargo fetch']
            : [];

  const buildScript = build ? [build] : language === 'python' ? ['pip install build', 'python -m build'] : ['echo "no build step"'];

  return `# GitLab CI — generated by create-harness-app
stages: [lint, test, build]

image: ${image}

${before.join('\n')}

lint:
  stage: lint
  script:
${lintScript.map((s) => '    - ' + s).join('\n')}

test:
  stage: test
  script:
    - ${test}

build:
  stage: build
  script:
${buildScript.map((s) => '    - ' + s).join('\n')}
`;
}

function tsInstallCmd(packageManager) {
  switch (packageManager) {
    case 'pnpm':
      return 'pnpm install --frozen-lockfile';
    case 'yarn':
      return 'yarn install --frozen-lockfile';
    case 'bun':
      return 'bun install --frozen-lockfile';
    default:
      return 'npm ci';
  }
}

function pythonInstallCmd(packageManager) {
  switch (packageManager) {
    case 'uv':
      return 'uv sync';
    case 'poetry':
      return 'poetry install --no-interaction';
    default:
      return 'pip install -e ".[dev]"';
  }
}

// ─────────────────────────────────────────────────
// 7. .editorconfig
// ─────────────────────────────────────────────────

/**
 * generateEditorconfig — language-agnostic .editorconfig. Takes no arguments:
 * the single file covers all languages via section overrides.
 */
export function generateEditorconfig() {
  return {
    filepath: '.editorconfig',
    content: `# EditorConfig — generated by create-harness-app
root = true

[*]
charset = utf-8
end_of_line = lf
insert_final_newline = true
trim_trailing_whitespace = true
indent_style = space
indent_size = 2

[*.go]
indent_style = tab
indent_size = 4

[*.{rs,py}]
indent_size = 4

[*.md]
trim_trailing_whitespace = false
max_line_length = off

[Makefile]
indent_style = tab
`,
  };
}

// ─────────────────────────────────────────────────
// 8. .gitignore
// ─────────────────────────────────────────────────

/**
 * generateGitignore — language patterns from config plus universal ignores.
 */
export function generateGitignore(answers) {
  const { language } = answers;
  const langPatterns = (LANGUAGES[language] && LANGUAGES[language].gitignorePatterns) || [];

  const common = [
    '# --- Secrets & env ---',
    '.env',
    '.env.*',
    '!.env.example',
    '',
    '# --- OS ---',
    '.DS_Store',
    'Thumbs.db',
    'desktop.ini',
    '',
    '# --- Editors / IDEs ---',
    '.idea/',
    '.vscode/',
    '!.vscode/settings.json',
    '!.vscode/extensions.json',
    '*.swp',
    '*.swo',
    '*~',
    '',
    '# --- Logs & caches ---',
    '*.log',
    'npm-debug.log*',
    'yarn-debug.log*',
    'yarn-error.log*',
    '.cache/',
    '.eslintcache',
    'coverage/',
    '',
    '# --- Tooling ---',
    '.tool-versions',
    '.node-version',
    '.python-version',
  ];

  const unique = Array.from(new Set([...langPatterns]));
  const content = `# .gitignore — generated by create-harness-app
# Language (${language}) specifics
${unique.join('\n')}

${common.join('\n')}
`;

  return { filepath: '.gitignore', content };
}

// ─────────────────────────────────────────────────
// 9. docs/architecture.md
// ─────────────────────────────────────────────────

/**
 * generateArchitectureMd — living architecture document scaffold.
 */
export function generateArchitectureMd(answers) {
  const { projectName, description, language, framework } = answers;
  const cfg = LANGUAGES[language];
  const fMeta = frameworkMeta(language, framework);
  const dirs = (FRAMEWORK_DIRS[language] && FRAMEWORK_DIRS[language][framework]) || [];

  const moduleBoundaries = dirs
    .map((d) => {
      const clean = d.replace(/\/$/, '');
      return `### \`${d}\`\n${dirPurpose(clean, framework, language)}. _Document the public surface and consumers here._`;
    })
    .join('\n\n');

  const content = `<!-- AUTO-GENERATED by create-harness-app. This is a scaffold — fill it in as the project evolves. -->

# ${projectName} — Architecture

> ${description || 'Describe what this system does and for whom.'}

> **This document is living.** Update it whenever a significant decision is made
> or a module boundary shifts. Stale architecture docs are worse than none.

## 1. Overview

- **What it is:** ${cfg.label} ${fMeta.label} application.
- **What it does:** _(describe the primary user / system journeys)_
- **Who uses it:** _(end users, downstream services, teams)_
- **Why it exists:** _(the problem it solves; link to any product brief)_

## 2. Tech Stack & Rationale

| Concern | Choice | Why |
| --- | --- | --- |
| Language | ${cfg.label} | _reason_ |
| Framework | ${fMeta.label} | _reason_ |
| Testing | ${cfg.testFramework} | _reason_ |
| Linting | ${cfg.lintTool} | _reason_ |

## 3. Module Boundaries

${moduleBoundaries}

### Rules
- Dependencies point _inward_ toward the core domain. Core must not import from
  routes/handlers/infrastructure.
- Side effects (I/O, time, randomness) live at the edges; keep the core pure and
  testable in isolation.
- One responsibility per module. If a module's name needs "and", split it.

## 4. Key Decisions (ADRs)

Record decisions as Architecture Decision Records under \`docs/adr/\`.

- **ADR-0001 — _(placeholder)_** _(State the decision.)_
  - **Status:** Proposed
  - **Context:** _(the problem & forces)_
  - **Decision:** _(what we chose)_
  - **Consequences:** _(trade-offs accepted)_

## 5. Agent Notes

Things an AI coding agent must know before touching this codebase:

- _(list runtime/infra assumptions: databases, queues, external APIs)_
- _(list gotchas: non-obvious invariants, ordering constraints, ownership rules)_
- _(list "do not touch" areas or files that require human review)_
- The single source of truth for conventions is \`AGENTS.md\`; read it first.

## 6. Diagrams

_(Add a C4 or Mermaid diagram of the major components and their interactions.)_

---

_Last updated: _(date)_. Maintained by the team. Generated by **create-harness-app**.
`;

  return { filepath: 'docs/architecture.md', content };
}

// ─────────────────────────────────────────────────
// 10. README.md
// ─────────────────────────────────────────────────

/**
 * generateProjectReadme — project README with quick start and a harness section.
 */
export function generateProjectReadme(answers) {
  const { projectName, description, language, framework, packageManager } = answers;
  const cfg = LANGUAGES[language];
  const fMeta = frameworkMeta(language, framework);
  const pMeta = pmMeta(language, packageManager);
  const dirs = (FRAMEWORK_DIRS[language] && FRAMEWORK_DIRS[language][framework]) || [];
  const commands = buildCommands(answers);
  const installCmd = commands.find(([l]) => /install/i.test(l))?.[1] || 'echo "see docs"';
  const devCmd = commands.find(([l]) => /dev/i.test(l))?.[1];
  const testCmd = primaryTestCommand(answers);
  const lint = lintCommand(answers);
  const typeCmd = primaryTypeCheckCommand(answers);

  const badges = `**${cfg.label}** · **${fMeta.label}** · **${pMeta.label}** · **${cfg.testFramework}** · **${cfg.lintTool}**`;

  const quickStart = [
    '```sh',
    `# Clone`,
    `git clone <repo-url> ${kebab(projectName)} && cd ${kebab(projectName)}`,
    '',
    `# Install dependencies`,
    installCmd,
  ];
  if (devCmd) quickStart.push('', `# Start dev server`, devCmd);
  quickStart.push(
    '',
    `# Run tests`,
    testCmd,
    '',
    `# Lint`,
    lint,
  );
  if (typeCmd) quickStart.push('', `# Type check`, typeCmd);
  quickStart.push('```');

  const structure = dirs.map((d, idx) => `${idx === dirs.length - 1 ? '└─' : '├─'} ${d}`).join('\n');

  const content = `# ${projectName}

> ${description || '_Add a one-line description of the project._'}

${badges}

## Quick start

${quickStart.join('\n')}

## Project structure

\`\`\`
${kebab(projectName)}/
${structure}
\`\`\`

See [\`AGENTS.md\`](./AGENTS.md) for the full conventions and command reference,
and [\`docs/architecture.md\`](./docs/architecture.md) for the system design.

## Harness engineering

This project is **harness-engineering-ready** for AI coding agents:

- **[\`AGENTS.md\`](./AGENTS.md)** — the single source of truth for any coding
  agent: tech stack, commands, conventions, and structure. Agents read this first.
${agentFileLine(answers)}
- **Git hooks** — a pre-commit hook (\`${answers.language === 'typescript' || answers.language === 'python' ? '.husky/pre-commit' : '.githooks/pre-commit'}\`)
  runs lint, type-check, and tests before every commit. Set it up with
  \`scripts/setup-hooks.sh\` after cloning.
- **CI** — ${
    answers.ciProvider === 'github'
      ? 'GitHub Actions (`.github/workflows/ci.yml`)'
      : answers.ciProvider === 'gitlab'
        ? 'GitLab CI (`.gitlab-ci.yml`)'
        : '_(CI not configured)_'
  } runs the same gate on every push and PR.

### Philosophy
- **Conventions are explicit, not tribal.** They live in config the agent reads.
- **The gate is automatic.** Hooks + CI enforce it; agents should never bypass it.
- **Docs are living.** \`architecture.md\` and ADRs capture _why_, not just _what_.

## License

MIT
`;

  return { filepath: 'README.md', content };
}

function agentFileLine(answers) {
  const lines = [];
  if (answers.codingAgent === 'claude-code' || answers.codingAgent === 'multiple') {
    lines.push('- **[`CLAUDE.md`](./CLAUDE.md)** — Claude Code specific guidance.');
  }
  if (answers.codingAgent === 'cursor' || answers.codingAgent === 'multiple') {
    lines.push('- **[`.cursor/rules/project.mdc`](./.cursor/rules/project.mdc)** — Cursor rule file.');
  }
  return lines.join('\n');
}

// ─────────────────────────────────────────────────
// 11. Language project config (package.json / pyproject.toml / go.mod / pom.xml / Cargo.toml)
// ─────────────────────────────────────────────────

/**
 * generateProjectConfig — the language-native project manifest.
 */
export function generateProjectConfig(answers) {
  switch (answers.language) {
    case 'typescript':
      return { filepath: 'package.json', content: tsPackageJson(answers) };
    case 'python':
      return { filepath: 'pyproject.toml', content: pythonPyproject(answers) };
    case 'go':
      return { filepath: 'go.mod', content: goMod(answers) };
    case 'java':
      return answers.framework === 'quarkus'
        ? { filepath: 'build.gradle.kts', content: gradleBuild(answers) }
        : { filepath: 'pom.xml', content: pomXml(answers) };
    case 'rust':
      return { filepath: 'Cargo.toml', content: cargoToml(answers) };
    default:
      return null;
  }
}

function tsPackageJson(answers) {
  const { projectName, description, framework } = answers;
  const name = kebab(projectName);
  const isNext = framework === 'nextjs';
  const isNest = framework === 'nest';

  const devDeps = {
    '@biomejs/biome': '^1.9.4',
    typescript: '^5.6.0',
    tsx: '^4.19.0',
    vitest: '^2.1.0',
  };
  if (isNext) {
    devDeps.next = '^15.0.0';
    devDeps['@types/node'] = '^22.0.0';
  }
  if (isNest) {
    devDeps['@nestjs/cli'] = '^10.4.0';
  }

  const scripts = {
    test: 'vitest --run',
    'test:watch': 'vitest',
    'test:fast': 'vitest --run --reporter=verbose',
    'test:changed': 'vitest --run --changed',
    lint: 'biome check .',
    format: 'biome format --write .',
    typecheck: 'tsc --noEmit',
  };
  if (isNext) {
    scripts.dev = 'next dev';
    scripts.build = 'next build';
    scripts.start = 'next start';
  } else if (isNest) {
    scripts.dev = 'nest start --watch';
    scripts.build = 'nest build';
    scripts.start = 'node dist/main.js';
  } else {
    scripts.dev = 'tsx watch src/index.ts';
    scripts.build = 'tsc';
    scripts.start = 'node dist/index.js';
  }

  const pkg = {
    name,
    version: '0.1.0',
    private: true,
    type: 'module',
    description: description || '',
    scripts,
    devDependencies: sortObj(devDeps),
  };

  if (isNext || isNest) {
    pkg.dependencies = isNext ? { react: '^18.3.0', 'react-dom': '^18.3.0' } : { '@nestjs/common': '^10.4.0', '@nestjs/core': '^10.4.0' };
  }

  return JSON.stringify(pkg, null, 2) + '\n';
}

function sortObj(obj) {
  return Object.keys(obj)
    .sort()
    .reduce((acc, k) => {
      acc[k] = obj[k];
      return acc;
    }, {});
}

function pythonPyproject(answers) {
  const { projectName, description, framework } = answers;
  const name = kebab(projectName);
  const pyName = pyPkg(projectName);

  const deps = [];
  const depComments = [];
  switch (framework) {
    case 'fastapi':
      deps.push('"fastapi>=0.115.0"', '"uvicorn[standard]>=0.30.0"');
      depComments.push('# Web framework');
      break;
    case 'django':
      deps.push('"django>=5.0.0"');
      depComments.push('# Web framework');
      break;
    case 'flask':
      deps.push('"flask>=3.0.0"');
      depComments.push('# Web framework');
      break;
    default:
      break;
  }

  const depsBlock = deps.length ? deps.join(',\n  ') : '';

  return `# pyproject.toml — generated by create-harness-app (uv-style)
[project]
name = "${name}"
version = "0.1.0"
description = "${description || ''}"
readme = "README.md"
requires-python = ">=3.12"
dependencies = [
  ${depsBlock}
]

[dependency-groups]
dev = [
  "ruff>=0.6.0",
  "pyright>=1.1.380",
  "pytest>=8.0.0",
  "pytest-cov>=5.0.0",
]

[build-system]
requires = ["hatchling"]
build-backend = "hatchling.build"

[tool.hatch.build.targets.wheel]
packages = ["src/${pyName}"]

# ─── Ruff (lint + format) ───
[tool.ruff]
line-length = 100
target-version = "py312"
src = ["src"]
extend-exclude = ["migrations", ".venv"]

[tool.ruff.lint]
# E/pycodestyle errors, F/pyflakes, W/warnings, I/isort, UP/pyupgrade
select = ["E", "F", "W", "I", "UP"]
ignore = ["E501"]  # line length is enforced by the formatter

[tool.ruff.lint.isort]
known-first-party = ["${pyName}"]

[tool.ruff.format]
quote-style = "double"
indent-style = "space"

# ─── Pyright (type checking) ───
[tool.pyright]
include = ["src"]
exclude = ["**/__pycache__", ".venv"]
pythonVersion = "3.12"
typeCheckingMode = "standard"
venvPath = "."
venv = ".venv"

# ─── pytest ───
[tool.pytest.ini_options]
testpaths = ["tests"]
addopts = "-ra --strict-markers"
`;
}

function goMod(answers) {
  const { projectName, framework } = answers;
  const module = `github.com/user/${kebab(projectName)}`;
  const reqs = [];
  switch (framework) {
    case 'gin':
      reqs.push('\tgithub.com/gin-gonic/gin v1.10.0');
      break;
    case 'fiber':
      reqs.push('\tgithub.com/gofiber/fiber/v2 v2.52.0');
      break;
    default:
      break;
  }
  const requireBlock = reqs.length ? `\nrequire (\n${reqs.join('\n')}\n)` : '\nrequire ()';
  return `// go.mod — generated by create-harness-app
module ${module}

go 1.22
${requireBlock}
`;
}

function pomXml(answers) {
  const { projectName, description } = answers;
  const artifact = kebab(projectName);
  const group = javaBasePackage();
  return `<?xml version="1.0" encoding="UTF-8"?>
<project xmlns="http://maven.apache.org/POM/4.0.0"
         xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
         xsi:schemaLocation="http://maven.apache.org/POM/4.0.0 https://maven.apache.org/xsd/maven-4.0.0.xsd">
  <modelVersion>4.0.0</modelVersion>

  <parent>
    <groupId>org.springframework.boot</groupId>
    <artifactId>spring-boot-starter-parent</artifactId>
    <version>3.3.4</version>
    <relativePath/>
  </parent>

  <groupId>${group}</groupId>
  <artifactId>${artifact}</artifactId>
  <version>0.1.0-SNAPSHOT</version>
  <name>${projectName}</name>
  <description>${description || ''}</description>

  <properties>
    <java.version>21</java.version>
    <project.build.sourceEncoding>UTF-8</project.build.sourceEncoding>
    <checkstyle.config.location>checkstyle.xml</checkstyle.config.location>
  </properties>

  <dependencies>
    <dependency>
      <groupId>org.springframework.boot</groupId>
      <artifactId>spring-boot-starter-web</artifactId>
    </dependency>
    <dependency>
      <groupId>org.springframework.boot</groupId>
      <artifactId>spring-boot-starter-test</artifactId>
      <scope>test</scope>
    </dependency>
  </dependencies>

  <build>
    <plugins>
      <plugin>
        <groupId>org.springframework.boot</groupId>
        <artifactId>spring-boot-maven-plugin</artifactId>
      </plugin>
      <plugin>
        <groupId>org.apache.maven.plugins</groupId>
        <artifactId>maven-checkstyle-plugin</artifactId>
        <version>3.5.0</version>
        <dependencies>
          <dependency>
            <groupId>com.puppycrawl.tools</groupId>
            <artifactId>checkstyle</artifactId>
            <version>10.18.1</version>
          </dependency>
        </dependencies>
        <configuration>
          <configLocation>checkstyle.xml</configLocation>
          <consoleOutput>true</consoleOutput>
          <failsOnError>true</failsOnError>
        </configuration>
        <executions>
          <execution>
            <phase>validate</phase>
            <goals><goal>check</goal></goals>
          </execution>
        </executions>
      </plugin>
    </plugins>
  </build>
</project>
`;
}

function gradleBuild(answers) {
  const { projectName, description } = answers;
  return `// build.gradle.kts — generated by create-harness-app (Quarkus)
plugins {
  java
  id("io.quarkus") version "3.15.1"
  id("checkstyle")
}

group = "${javaBasePackage()}"
version = "0.1.0-SNAPSHOT"
description = "${description || ''}"

repositories {
  mavenCentral()
}

val quarkusVersion = "3.15.1"

dependencies {
  implementation(enforcedPlatform("io.quarkus.platform:quarkus-bom:\${quarkusVersion}"))
  implementation("io.quarkus:quarkus-rest")
  implementation("io.quarkus:quarkus-rest-jackson")

  testImplementation("io.quarkus:quarkus-junit5")
  testImplementation("io.rest-assured:rest-assured")
}

java {
  sourceCompatibility = JavaVersion.VERSION_21
  targetCompatibility = JavaVersion.VERSION_21
}

checkstyle {
  toolVersion = "10.18.1"
  configFile = file("checkstyle.xml")
}

tasks.withType<JavaCompile> {
  options.encoding = "UTF-8"
}

tasks.withType<Test> {
  useJUnitPlatform()
  systemProperty("java.util.logging.manager", "org.jboss.logmanager.LogManager")
}
`;
}

function cargoToml(answers) {
  const { projectName, description, framework } = answers;
  const name = kebab(projectName);
  const deps = [];
  switch (framework) {
    case 'actix':
      deps.push('actix-web = "4"');
      deps.push('tokio = { version = "1", features = ["full"] }');
      break;
    case 'axum':
      deps.push('axum = "0.7"');
      deps.push('tokio = { version = "1", features = ["full"] }');
      break;
    default:
      break;
  }

  return `# Cargo.toml — generated by create-harness-app
[package]
name = "${name}"
version = "0.1.0"
edition = "2021"
description = "${description || ''}"
license = "MIT"

# The primary binary. Create \`src/main.rs\` to enable it.
[[bin]]
name = "app"
path = "src/main.rs"

[dependencies]
${deps.length ? deps.join('\n') : '# (add runtime dependencies here)'}

[dev-dependencies]
# (add test dependencies here)

[profile.release]
lto = true
codegen-units = 1
strip = true
`;
}

// ─────────────────────────────────────────────────
// 12. Test skeleton
// ─────────────────────────────────────────────────

/**
 * generateTestSkeleton — a minimal, passing smoke test so the gate is green
 * out of the box.
 */
// ─────────────────────────────────────────────────
// 11b. TypeScript compiler config
// ─────────────────────────────────────────────────

/**
 * generateTsConfig — strict tsconfig.json so `tsc --noEmit` (the typecheck
 * step) has a config to consume. TypeScript only; null otherwise. Bundler
 * module resolution stays lenient for tsx/vitest and bare relative imports.
 */
export function generateTsConfig(answers) {
  if (answers.language !== 'typescript') return null;
  // Authored in Biome's canonical format (short arrays collapsed) so
  // `biome check .` passes on the generated file itself. Bundler resolution
  // stays lenient for tsx/vitest and bare relative imports.
  const content = `{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "lib": ["ES2022"],
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "esModuleInterop": true,
    "forceConsistentCasingInFileNames": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "outDir": "dist"
  },
  "include": ["src/**/*.ts", "tests/**/*.ts"],
  "exclude": ["node_modules", "dist"]
}
`;
  return { filepath: 'tsconfig.json', content };
}

// ─────────────────────────────────────────────────
// 11c. Language source entry
// ─────────────────────────────────────────────────

/**
 * generateSourceSkeleton — the minimal source file each stack needs so its
 * gate (compile / type-check) succeeds on an unmodified generated project.
 * Returns null for stacks/frameworks that need no entry file. (Issue #5.)
 */
export function generateSourceSkeleton(answers) {
  const { language, framework, projectName } = answers;

  switch (language) {
    case 'typescript':
      // express/none reference src/index.ts in dev/build; nextjs/nest have
      // their own entry conventions and need no placeholder file.
      if (framework !== 'express' && framework !== 'none') return null;
      return {
        filepath: 'src/index.ts',
        content: `// Entry point for ${projectName}. Add your application code here.\nexport {};\n`,
      };

    case 'python':
      return {
        filepath: `src/${pyPkg(projectName)}/__init__.py`,
        content: `"""${projectName}."""\n`,
      };

    case 'go':
      return {
        filepath: 'internal/app.go',
        content: '// Package app holds the application logic.\npackage app\n',
      };

    case 'java':
      return {
        filepath: 'src/main/java/com/example/App.java',
        content: javaAppSource(projectName),
      };

    case 'rust':
      return {
        filepath: 'src/main.rs',
        content: `// Entry point for ${projectName}.\nfn main() {}\n`,
      };

    default:
      return null;
  }
}

/** Google-checkstyle-compliant minimal application class. */
function javaAppSource(projectName) {
  return `package com.example;

/**
 * Application entry point for ${projectName}.
 */
public final class App {

  private App() {
  }

  /**
   * Starts the application.
   *
   * @param args command-line arguments
   */
  public static void main(String[] args) {
  }
}
`;
}

export function generateTestSkeleton(answers) {
  const { projectName } = answers;
  switch (answers.language) {
    case 'typescript':
      return {
        filepath: 'tests/index.test.ts',
        content: `import { describe, expect, it } from 'vitest';

// Smoke test — verifies the test runner is wired up.
// Replace with real tests as you build out ${projectName}.

describe('scaffold', () => {
  it('runs vitest', () => {
    expect(1 + 1).toBe(2);
  });

  it('handles strings', () => {
    expect('hello'.length).toBe(5);
  });
});
`,
      };

    case 'python':
      return {
        filepath: 'tests/test_main.py',
        content: `"""Smoke tests — verifies pytest is wired up.

Replace these with real tests as you build out ${projectName}.
"""


def test_pytest_runs() -> None:
    assert 1 + 1 == 2


def test_strings() -> None:
    assert len("hello") == 5
`,
      };

    case 'go':
      return {
        filepath: 'internal/app_test.go',
        content: `package app

import "testing"

// Smoke tests — verifies \`go test\` is wired up.
// Replace with real table-driven tests as the package grows.

func TestScaffoldRuns(t *testing.T) {
	if got, want := 1+1, 2; got != want {
		t.Fatalf("got %d, want %d", got, want)
	}
}

func TestStringLength(t *testing.T) {
	if got, want := len("hello"), 5; got != want {
		t.Fatalf("got %d, want %d", got, want)
	}
}
`,
      };

    case 'java':
      return {
        filepath: 'src/test/java/com/example/AppTest.java',
        content: `package com.example;

import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.assertEquals;

/**
 * Smoke test — verifies JUnit 5 is wired up.
 * Replace with real tests as you build out ${projectName}.
 */
class AppTest {

    @Test
    void scaffoldRuns() {
        assertEquals(2, 1 + 1, "junit is wired up");
    }

    @Test
    void stringLength() {
        assertEquals(5, "hello".length());
    }
}
`,
      };

    case 'rust':
      return {
        filepath: 'tests/integration_test.rs',
        content: `//! Smoke tests — verifies \`cargo test\` is wired up.
//! Replace with real tests as the crate grows.

#[test]
fn scaffold_runs() {
    assert_eq!(1 + 1, 2);
}

#[test]
fn string_length() {
    assert_eq!("hello".len(), 5);
}
`,
      };

    default:
      return null;
  }
}

// ─────────────────────────────────────────────────
// 13. Husky / hooks setup script
// ─────────────────────────────────────────────────

/**
 * generateHuskySetup — a one-shot script to activate git hooks after a fresh
 * clone. Uses husky for Node-aware stacks (TS, Python) and core.hooksPath for
 * the rest.
 */
export function generateHuskySetup(answers) {
  const { language } = answers;
  const hasNode = language === 'typescript' || language === 'python';

  let content;
  if (hasNode) {
    content = `#!/usr/bin/env sh
# Activate git hooks via husky (or core.hooksPath as a fallback).
# Generated by create-harness-app. Run once after cloning.
set -e

if command -v npx >/dev/null 2>&1; then
  echo "→ Initialising husky..."
  # husky v9: 'husky' wires core.hooksPath to .husky; 'husky init' also bootstraps package.json.
  npx --yes husky init 2>/dev/null || npx --yes husky 2>/dev/null || true
fi

# Ensure our pre-commit hook is executable (it may have been regenerated).
chmod +x .husky/pre-commit 2>/dev/null || true

# Fallback: point git straight at .husky even without husky the package.
git config core.hooksPath .husky 2>/dev/null || true

echo "✓ Git hooks active at .husky/pre-commit"
echo "  Re-run this script after a fresh clone."
`;
  } else {
    content = `#!/usr/bin/env sh
# Activate git hooks via core.hooksPath (no Node / husky required).
# Generated by create-harness-app. Run once after cloning.
set -e

echo "→ Configuring git to use .githooks"
git config core.hooksPath .githooks

chmod +x .githooks/pre-commit 2>/dev/null || true

echo "✓ Git hooks active at .githooks/pre-commit"
echo "  Each contributor must run this script after cloning."
`;
  }

  return { filepath: 'scripts/setup-hooks.sh', content };
}

// ─────────────────────────────────────────────────
// Convenience: build the full file list for the CLI
// ─────────────────────────────────────────────────

/**
 * generateAll — collect every applicable artefact for the given answers.
 * Filters out nulls and the language-specific lint fallback so the CLI can
 * just iterate and write. Exported for testing / direct use.
 */
// ─────────────────────────────────────────────────
// 14. Optional extra sensors (issue #8)
// ─────────────────────────────────────────────────
// Each returns null unless its key is in answers.sensors, so the default
// generated project is unchanged when no sensors are selected.

function selectedSensors(answers) {
  return Array.isArray(answers.sensors) ? answers.sensors : [];
}

/** .github/dependabot.yml — weekly update PRs for the stack + github-actions. */
export function generateDependabot(answers) {
  if (!selectedSensors(answers).includes('dependabot')) return null;
  const ecosystem = DEPENDABOT_ECOSYSTEM[answers.language] || 'npm';
  return {
    filepath: '.github/dependabot.yml',
    content: `# Dependabot — automated dependency update PRs (issue #8).
version: 2
updates:
  - package-ecosystem: "${ecosystem}"
    directory: "/"
    schedule:
      interval: "weekly"
    open-pull-requests-limit: 5
  - package-ecosystem: "github-actions"
    directory: "/"
    schedule:
      interval: "weekly"
`,
  };
}

/** .gitleaks.toml — extends the built-in secret-detection ruleset. */
export function generateGitleaks(answers) {
  if (!selectedSensors(answers).includes('gitleaks')) return null;
  return {
    filepath: '.gitleaks.toml',
    content: `# gitleaks — secret scanning (issue #8).
# Install: https://github.com/gitleaks/gitleaks
# Run:     gitleaks detect --source . --report-path findings.json
title = "${answers.projectName} secret scanning"

[extend]
useDefault = true
`,
  };
}

/** commitlint.config.cjs — enforce Conventional Commits. */
export function generateCommitlint(answers) {
  if (!selectedSensors(answers).includes('commitlint')) return null;
  return {
    filepath: 'commitlint.config.cjs',
    content: `// commitlint — enforce Conventional Commits (issue #8).
// Install (Node):  npm add -D @commitlint/cli @commitlint/config-conventional
// Then add a commit-msg hook, e.g.:  npx commitlint --edit
module.exports = {
  extends: ['@commitlint/config-conventional'],
};
`,
  };
}

/** Dockerfile — minimal multi-stage container build, per stack. */
export function generateDockerfile(answers) {
  if (!selectedSensors(answers).includes('docker')) return null;
  return { filepath: 'Dockerfile', content: dockerfileFor(answers) };
}

function dockerfileFor(answers) {
  const { language, framework, projectName } = answers;
  switch (language) {
    case 'typescript':
      if (framework === 'nextjs') {
        return `# Dockerfile — ${projectName} (Next.js)
FROM node:20-slim AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:20-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app ./
EXPOSE 3000
CMD ["npm", "start"]
`;
      }
      return `# Dockerfile — ${projectName} (Node.js)
FROM node:20-slim AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:20-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/package*.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
EXPOSE 3000
CMD ["node", "dist/index.js"]
`;
    case 'python':
      return `# Dockerfile — ${projectName} (Python)
FROM python:3.12-slim AS runtime
WORKDIR /app
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1
COPY pyproject.toml ./
RUN pip install --no-cache-dir .
COPY . .
EXPOSE 8000
# Point this at your ASGI/WSGI app object.
CMD ["uvicorn", "src.main:app", "--host", "0.0.0.0", "--port", "8000"]
`;
    case 'go':
      return `# Dockerfile — ${projectName} (Go)
FROM golang:1.22 AS build
WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 go build -o /app ./...

FROM gcr.io/distroless/static-debian12 AS runtime
COPY --from=build /app /app
CMD ["/app"]
`;
    case 'java':
      if (framework === 'quarkus') {
        return `# Dockerfile — ${projectName} (Quarkus / Gradle)
FROM gradle:8-jdk21 AS build
WORKDIR /src
COPY . .
RUN gradle --no-daemon build

FROM eclipse-temurin:21-jre AS runtime
WORKDIR /app
COPY --from=build /src/build/quarkus-app /app
CMD ["java", "-jar", "quarkus-run.jar"]
`;
      }
      return `# Dockerfile — ${projectName} (Java / Maven)
FROM maven:3-eclipse-temurin-21 AS build
WORKDIR /src
COPY . .
RUN mvn -B -ntp package -DskipTests

FROM eclipse-temurin:21-jre AS runtime
WORKDIR /app
COPY --from=build /src/target/*.jar /app/app.jar
CMD ["java", "-jar", "app.jar"]
`;
    case 'rust':
      return `# Dockerfile — ${projectName} (Rust)
FROM rust:1-slim AS build
WORKDIR /src
COPY . .
RUN cargo build --release

FROM debian:bookworm-slim AS runtime
COPY --from=build /src/target/release/app /app
CMD ["/app"]
`;
    default:
      return `# Dockerfile — ${projectName}\n# (No starter for this stack; add your build steps.)\n`;
  }
}

// SENSORS is re-exported for completeness / future validation.
void SENSORS;

export function generateAll(answers) {
  const artefacts = [
    generateAgentsMd(answers),
    generateClaudeMd(answers),
    generateCursorRules(answers),
    generateCopilotInstructions(answers),
    generateLintConfig(answers),
    generatePreCommit(answers),
    generateCI(answers),
    generateEditorconfig(),
    generateGitignore(answers),
    generateArchitectureMd(answers),
    generateProjectReadme(answers),
    generateProjectConfig(answers),
    generateTsConfig(answers),
    generateSourceSkeleton(answers),
    generateTestSkeleton(answers),
    generateHuskySetup(answers),
    generateDependabot(answers),
    generateGitleaks(answers),
    generateCommitlint(answers),
    generateDockerfile(answers),
  ].filter(Boolean);

  // Deduplicate by filepath, keeping the LAST occurrence. This resolves the
  // Python overlap (generateLintConfig and generateProjectConfig both emit
  // pyproject.toml — the full project config wins) and any other collisions.
  const byPath = new Map();
  for (const a of artefacts) byPath.set(a.filepath, a);
  return Array.from(byPath.values());
}

// CI_PROVIDERS is imported for completeness / future validation hooks.
void CI_PROVIDERS;
