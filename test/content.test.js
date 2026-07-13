// Representative content spot-checks. Where the matrix test locks the file
// SET, these lock the INTENT of key files: the right test command, the right
// lint tool, valid manifests, and the agent/team/CI conditionals. These assert
// structure, not localised strings, so issue #3 (EN/ZH conventions) won't
// break them.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateAll } from '../lib/templates.js';
import { baseAnswers, languageDefaults } from './fixtures.js';

/** Content of one file from generateAll's output (throws if absent). */
function file(answers, filepath) {
  const a = generateAll(answers).find((x) => x.filepath === filepath);
  if (!a) throw new Error(`expected "${filepath}" in generateAll output`);
  return a.content;
}

/** Whether a file is present in generateAll's output. */
function hasFile(answers, filepath) {
  return generateAll(answers).some((x) => x.filepath === filepath);
}

// ── AGENTS.md ──────────────────────────────────────────────────────────────

// The canonical "run the tests" command per stack (mirrors primaryTestCommand).
const TEST_CMD = {
  typescript: 'npx vitest --run',
  python: 'python -m pytest',
  go: 'go test ./...',
  java: 'mvn -B -ntp test',
  rust: 'cargo test',
};

for (const [language, cmd] of Object.entries(TEST_CMD)) {
  test(`AGENTS.md [${language}] embeds the test command "${cmd}"`, () => {
    const md = file(baseAnswers({ language, ...languageDefaults(language) }), 'AGENTS.md');
    assert.ok(md.includes(cmd), `AGENTS.md missing "${cmd}"`);
  });
}

test('AGENTS.md carries the project name', () => {
  const md = file(baseAnswers({ projectName: 'my-cool-app' }), 'AGENTS.md');
  assert.ok(md.includes('my-cool-app'));
});

test('AGENTS.md includes a Pull Request Workflow section only for large teams', () => {
  const solo = file(baseAnswers({ teamMode: 'solo' }), 'AGENTS.md');
  const large = file(baseAnswers({ teamMode: 'large' }), 'AGENTS.md');
  assert.ok(!solo.includes('## Pull Request Workflow'), 'solo should not have PR workflow');
  assert.ok(large.includes('## Pull Request Workflow'), 'large should have PR workflow');
});

// ── CLAUDE.md / agent conditionals ─────────────────────────────────────────

for (const agent of ['claude-code', 'multiple']) {
  test(`CLAUDE.md is emitted for agent=${agent}`, () => {
    assert.ok(hasFile(baseAnswers({ codingAgent: agent }), 'CLAUDE.md'));
  });
}
for (const agent of ['cursor', 'codex', 'copilot']) {
  test(`CLAUDE.md is NOT emitted for agent=${agent}`, () => {
    assert.ok(!hasFile(baseAnswers({ codingAgent: agent }), 'CLAUDE.md'));
  });
}
for (const agent of ['cursor', 'multiple']) {
  test(`.cursor/rules are emitted for agent=${agent}`, () => {
    assert.ok(hasFile(baseAnswers({ codingAgent: agent }), '.cursor/rules/project.mdc'));
  });
}

// ── Pre-commit: right lint/type/test tool per language ─────────────────────

const PRECOMMIT = {
  typescript: { path: '.husky/pre-commit', marker: 'npx biome check --write' },
  python: { path: '.husky/pre-commit', marker: 'ruff check --fix' },
  go: { path: '.githooks/pre-commit', marker: 'gofmt' },
  rust: { path: '.githooks/pre-commit', marker: 'cargo clippy' },
};

for (const [language, { path, marker }] of Object.entries(PRECOMMIT)) {
  test(`pre-commit [${language}] runs ${marker}`, () => {
    const body = file(baseAnswers({ language, ...languageDefaults(language) }), path);
    assert.ok(body.includes(marker), `pre-commit missing "${marker}"`);
  });
}

test('pre-commit [java/maven] runs checkstyle via mvn', () => {
  const body = file(
    baseAnswers({ language: 'java', framework: 'spring-boot', packageManager: 'maven' }),
    '.githooks/pre-commit'
  );
  assert.ok(body.includes('checkstyle:check'));
});

test('pre-commit [java/gradle] runs checkstyleMain', () => {
  const body = file(
    baseAnswers({ language: 'java', framework: 'spring-boot', packageManager: 'gradle' }),
    '.githooks/pre-commit'
  );
  assert.ok(body.includes('checkstyleMain'));
});

// ── Project config manifests ───────────────────────────────────────────────

test('package.json (typescript) is valid JSON with lint + test scripts', () => {
  const pkg = JSON.parse(file(baseAnswers({ language: 'typescript' }), 'package.json'));
  assert.equal(pkg.scripts.test, 'vitest --run');
  assert.equal(pkg.scripts.lint, 'biome check .');
  assert.equal(pkg.type, 'module');
});

test('pyproject.toml (python) embeds ruff + pyright config', () => {
  const t = file(baseAnswers({ language: 'python' }), 'pyproject.toml');
  assert.ok(t.includes('[tool.ruff]'));
  assert.ok(t.includes('[tool.pyright]'));
});

test('Cargo.toml (rust) has [package] and [dependencies]', () => {
  const t = file(baseAnswers({ language: 'rust' }), 'Cargo.toml');
  assert.ok(t.includes('[package]'));
  assert.ok(t.includes('[dependencies]'));
});

test('java project config is build.gradle.kts for quarkus, pom.xml otherwise', () => {
  assert.ok(
    hasFile(baseAnswers({ language: 'java', framework: 'quarkus' }), 'build.gradle.kts')
  );
  assert.ok(hasFile(baseAnswers({ language: 'java', framework: 'spring-boot' }), 'pom.xml'));
});

// ── CI conditionals ────────────────────────────────────────────────────────

test('CI file is emitted for github and gitlab, not none', () => {
  assert.ok(hasFile(baseAnswers({ ciProvider: 'github' }), '.github/workflows/ci.yml'));
  assert.ok(hasFile(baseAnswers({ ciProvider: 'gitlab' }), '.gitlab-ci.yml'));
  assert.ok(!hasFile(baseAnswers({ ciProvider: 'none' }), '.github/workflows/ci.yml'));
});

// ── Dedup: Python pyproject.toml must appear exactly once ──────────────────

test('python: pyproject.toml appears exactly once (generateAll dedup)', () => {
  const arts = generateAll(baseAnswers({ language: 'python' }));
  const count = arts.filter((a) => a.filepath === 'pyproject.toml').length;
  assert.equal(count, 1);
});

// ── Locale (issue #3): en default, zh opt-in ───────────────────────────────
// AGENTS.md and cursor rules embed the full convention set (style+imports+
// testing); CLAUDE.md embeds testing only. Markers below come from the
// typescript convention set in lib/config.js.

const EN_STYLE = 'Use TypeScript strict mode';
const ZH_STYLE = '使用 TypeScript 严格模式';
const ZH_TESTING = '使用 describe/it 组织测试';

test('default locale (en) emits English conventions in AGENTS.md', () => {
  const md = file(baseAnswers({ language: 'typescript' }), 'AGENTS.md');
  assert.ok(md.includes(EN_STYLE), 'expected English style marker');
  assert.ok(!md.includes(ZH_STYLE), 'did not expect Chinese marker in en locale');
});

test('--locale zh emits Chinese conventions in AGENTS.md', () => {
  const md = file(baseAnswers({ language: 'typescript', locale: 'zh' }), 'AGENTS.md');
  assert.ok(md.includes(ZH_STYLE), 'expected Chinese style marker');
  assert.ok(!md.includes(EN_STYLE), 'did not expect English marker in zh locale');
});

test('--locale zh flows through to cursor rules (full convention set)', () => {
  const md = file(
    baseAnswers({ language: 'typescript', locale: 'zh', codingAgent: 'multiple' }),
    '.cursor/rules/project.mdc'
  );
  assert.ok(md.includes(ZH_STYLE), 'cursor rules should carry the zh style marker');
});

test('--locale zh flows through to CLAUDE.md (testing conventions)', () => {
  const md = file(
    baseAnswers({ language: 'typescript', locale: 'zh', codingAgent: 'claude-code' }),
    'CLAUDE.md'
  );
  assert.ok(md.includes(ZH_TESTING), 'CLAUDE.md should carry the zh testing marker');
});

test('unknown locale falls back to English', () => {
  const md = file(baseAnswers({ language: 'typescript', locale: 'xx' }), 'AGENTS.md');
  assert.ok(md.includes(EN_STYLE), 'unknown locale should fall back to en');
  assert.ok(!md.includes(ZH_STYLE));
});
