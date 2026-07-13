// Shared test helpers for the create-harness-app generator test suite.
//
// `expectedFiles` is the independent SPEC for what generateAll must emit.
// When it and lib/templates.js disagree, the matrix test fails and names the
// offending combo. Helpers here are driven by config.js so coverage extends
// automatically as new stacks / options are added.

import { LANGUAGES, CODING_AGENTS, TEAM_MODES, CI_PROVIDERS } from '../lib/config.js';

/** A valid `answers` object with sensible defaults, merged with overrides. */
export function baseAnswers(overrides = {}) {
  return {
    projectName: 'test-app',
    description: 'A generated test fixture project.',
    language: 'typescript',
    framework: 'express',
    packageManager: 'pnpm',
    codingAgent: 'claude-code',
    teamMode: 'solo',
    ciProvider: 'github',
    ...overrides,
  };
}

/** The default framework + package manager for a language (first usable combo). */
export function languageDefaults(language) {
  const cfg = LANGUAGES[language];
  return { framework: cfg.defaultFramework, packageManager: cfg.packageManagers[0].value };
}

/**
 * Enumerate the full cross-product of valid input combos from config.js.
 * Used to drive the matrix test (no-throw + exact file set for every combo).
 */
export function allCombos() {
  const combos = [];
  for (const [language, cfg] of Object.entries(LANGUAGES)) {
    for (const fw of cfg.frameworks) {
      for (const pm of cfg.packageManagers) {
        for (const agent of CODING_AGENTS) {
          for (const team of TEAM_MODES) {
            for (const ci of CI_PROVIDERS) {
              combos.push(
                baseAnswers({
                  language,
                  framework: fw.value,
                  packageManager: pm.value,
                  codingAgent: agent.value,
                  teamMode: team.value,
                  ciProvider: ci.value,
                })
              );
            }
          }
        }
      }
    }
  }
  return combos;
}

/** Human-readable combo label for failure messages. */
export function label(a) {
  return `${a.language}/${a.framework}/${a.packageManager}/${a.codingAgent}/${a.teamMode}/${a.ciProvider}`;
}

/**
 * The spec: the exact sorted filepath set generateAll must emit for an input.
 * Mirrors the per-generator rules in lib/templates.js:
 *   - 6 always-present files
 *   - language → project config + lint config + pre-commit + test skeleton
 *   - java framework → build.gradle.kts (quarkus) vs pom.xml
 *   - codingAgent → CLAUDE.md / .cursor/rules/project.mdc
 *   - ciProvider → .github/workflows/ci.yml / .gitlab-ci.yml
 * teamMode and packageManager do not change the file *set*.
 */
export function expectedFiles(answers) {
  const { language, framework, codingAgent, ciProvider } = answers;
  const files = new Set([
    'AGENTS.md',
    '.editorconfig',
    '.gitignore',
    'docs/architecture.md',
    'README.md',
    'scripts/setup-hooks.sh',
  ]);

  const langFiles = {
    typescript: ['package.json', 'biome.json', '.husky/pre-commit', 'tests/index.test.ts'],
    python: ['pyproject.toml', '.husky/pre-commit', 'tests/test_main.py'],
    go: ['go.mod', '.golangci.yml', '.githooks/pre-commit', 'internal/app_test.go'],
    java: [
      'checkstyle.xml',
      '.githooks/pre-commit',
      'src/test/java/com/example/AppTest.java',
    ],
    rust: ['Cargo.toml', '.githooks/pre-commit', 'tests/integration_test.rs'],
  };
  for (const f of langFiles[language] || []) files.add(f);

  // Java project config depends on framework: Quarkus → Gradle, else Maven.
  if (language === 'java') {
    files.add(framework === 'quarkus' ? 'build.gradle.kts' : 'pom.xml');
  }

  if (codingAgent === 'claude-code' || codingAgent === 'multiple') files.add('CLAUDE.md');
  if (codingAgent === 'cursor' || codingAgent === 'multiple') {
    files.add('.cursor/rules/project.mdc');
  }

  if (ciProvider === 'github') files.add('.github/workflows/ci.yml');
  else if (ciProvider === 'gitlab') files.add('.gitlab-ci.yml');

  return [...files].sort();
}
