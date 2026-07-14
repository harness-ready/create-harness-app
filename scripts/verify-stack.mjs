#!/usr/bin/env node
// Self-verification harness for create-harness-app (issue #5).
//
// Generates a project for one stack, installs its dependencies, and runs that
// stack's gate (lint -> type-check -> test). Used by
// .github/workflows/verify.yml; also runnable locally when the toolchain is
// installed, e.g. `node scripts/verify-stack.mjs ts-express`.
//
// Usage:
//   node scripts/verify-stack.mjs <stack> [outDir]
//     stack: ts-express | py-fastapi | go-standard |
//            java-spring-boot | java-quarkus | rust-standard

import { generateAll } from '../lib/templates.js';
import { writeToFile } from '../lib/utils.js';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

const base = {
  projectName: 'verify-app',
  description: 'Self-verification fixture.',
  codingAgent: 'claude-code',
  teamMode: 'solo',
  ciProvider: 'github',
  locale: 'en',
};

const STACK_ANSWERS = {
  'ts-express': { ...base, language: 'typescript', framework: 'express', packageManager: 'npm' },
  'py-fastapi': { ...base, language: 'python', framework: 'fastapi', packageManager: 'uv' },
  'go-standard': { ...base, language: 'go', framework: 'standard', packageManager: 'go' },
  'java-spring-boot': { ...base, language: 'java', framework: 'spring-boot', packageManager: 'maven' },
  'java-quarkus': { ...base, language: 'java', framework: 'quarkus', packageManager: 'gradle' },
  'rust-standard': { ...base, language: 'rust', framework: 'standard', packageManager: 'cargo' },
};

// Each stack's gate: install then lint -> type-check -> test.
// java-quarkus uses system `gradle` (the generated project ships no wrapper).
const GATES = {
  'ts-express': [['npm', 'install'], ['npm', 'run', 'lint'], ['npm', 'run', 'typecheck'], ['npm', 'test']],
  'py-fastapi': [['uv', 'sync'], ['uv', 'run', 'ruff', 'check', '.'], ['uv', 'run', 'pyright'], ['uv', 'run', 'pytest']],
  'go-standard': [['golangci-lint', 'run', './...'], ['go', 'vet', './...'], ['go', 'test', './...']],
  'java-spring-boot': [['mvn', '-B', '-ntp', 'checkstyle:check'], ['mvn', '-B', '-ntp', 'test']],
  'java-quarkus': [['gradle', '--no-daemon', 'checkstyleMain'], ['gradle', '--no-daemon', 'test']],
  'rust-standard': [['cargo', 'fmt', '--check'], ['cargo', 'clippy', '--', '-D', 'warnings'], ['cargo', 'test']],
};

const stack = process.argv[2];
if (!stack || !STACK_ANSWERS[stack]) {
  console.error('Usage: node scripts/verify-stack.mjs <' + Object.keys(STACK_ANSWERS).join('|') + '> [outDir]');
  process.exit(2);
}

const outDir = resolve(process.argv[3] || './_verify-' + stack);

// 1. Generate the project into outDir.
const artefacts = generateAll(STACK_ANSWERS[stack]);
for (const a of artefacts) {
  await writeToFile(resolve(outDir, a.filepath), a.content);
}
console.log('Generated %d files into %s', artefacts.length, outDir);

// 2. Run the gate, streaming output. Stop on the first failing step.
for (const step of GATES[stack]) {
  const [cmd, ...args] = step;
  console.log('\n$ %s %s', cmd, args.join(' '));
  const res = spawnSync(cmd, args, { cwd: outDir, stdio: 'inherit', shell: process.platform === 'win32' });
  if (res.status !== 0) {
    console.error('\n✖ gate step failed: %s %s (exit %s)', cmd, args.join(' '), res.status);
    process.exit(res.status ?? 1);
  }
}

console.log('\n✔ %s gate passed', stack);
