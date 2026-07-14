// Tests for `init` mode: the project-owned filter (isProjectOwned) and an
// end-to-end `init --yes` into a temp dir (inject harness files, leave
// existing manifest/README/source untouched).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { isProjectOwned, main } from '../lib/cli.js';

// ── isProjectOwned: what init must never inject ────────────────────────────

test('isProjectOwned: manifests are project-owned', () => {
  for (const f of ['package.json', 'pyproject.toml', 'go.mod', 'pom.xml', 'build.gradle.kts', 'Cargo.toml']) {
    assert.equal(isProjectOwned(f), true, f);
  }
});

test('isProjectOwned: source under src/ is project-owned', () => {
  for (const f of ['src/index.ts', 'src/main.rs', 'src/main/java/com/example/App.java', 'src/test/java/com/example/AppTest.java', 'src/my_app/__init__.py']) {
    assert.equal(isProjectOwned(f), true, f);
  }
});

test('isProjectOwned: go sources + test skeletons are project-owned', () => {
  for (const f of ['internal/app.go', 'internal/app_test.go', 'tests/index.test.ts', 'tests/test_main.py', 'tests/integration_test.rs']) {
    assert.equal(isProjectOwned(f), true, f);
  }
});

test('isProjectOwned: harness artefacts are NOT project-owned', () => {
  for (const f of ['AGENTS.md', 'CLAUDE.md', '.cursor/rules/project.mdc', '.github/copilot-instructions.md', 'biome.json', '.golangci.yml', 'checkstyle.xml', '.husky/pre-commit', '.githooks/pre-commit', '.github/workflows/ci.yml', '.editorconfig', 'docs/architecture.md', 'scripts/setup-hooks.sh', 'tsconfig.json']) {
    assert.equal(isProjectOwned(f), false, f);
  }
});

// ── End-to-end: init --yes into an existing TS project ─────────────────────

test('init --yes injects harness files and leaves the existing project intact', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'init-'));
  // An existing project with a manifest, a README, and a pre-existing AGENTS.md.
  writeFileSync(
    join(dir, 'package.json'),
    JSON.stringify({ name: 'existing-app', dependencies: { express: '^4.18' } })
  );
  writeFileSync(join(dir, 'AGENTS.md'), '# existing agents (do not overwrite)');

  const origArgv = process.argv;
  process.argv = ['node', 'create-harness-app', 'init', dir, '--yes'];
  try {
    await main();
  } finally {
    process.argv = origArgv;
  }

  // Harness files injected (did not exist):
  assert.ok(existsSync(join(dir, 'biome.json')), 'biome.json should be added');
  assert.ok(existsSync(join(dir, '.husky/pre-commit')), 'pre-commit hook should be added');
  assert.ok(existsSync(join(dir, '.github/workflows/ci.yml')), 'CI should be added');
  assert.ok(existsSync(join(dir, 'AGENTS.md')) || true);
  assert.ok(existsSync(join(dir, 'scripts/setup-hooks.sh')), 'setup-hooks.sh should be added');

  // Existing manifest untouched (never overwritten):
  const pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf-8'));
  assert.equal(pkg.name, 'existing-app');

  // Pre-existing AGENTS.md skipped, not overwritten:
  assert.equal(
    readFileSync(join(dir, 'AGENTS.md'), 'utf-8'),
    '# existing agents (do not overwrite)'
  );

  // Project-owned files NOT injected:
  assert.ok(!existsSync(join(dir, 'src/index.ts')), 'must not inject source skeleton');
  assert.ok(!existsSync(join(dir, 'tests/index.test.ts')), 'must not inject test skeleton');
});
