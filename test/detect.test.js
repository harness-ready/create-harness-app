// Unit tests for lib/detect.js — stack detection from a { has, read } context.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { detectStack } from '../lib/detect.js';

/** Build a detect context from a { filename: content } map. */
function ctxFrom(files) {
  return {
    has: (p) => Object.prototype.hasOwnProperty.call(files, p),
    read: (p) => (Object.prototype.hasOwnProperty.call(files, p) ? files[p] : ''),
  };
}

test('detect: empty repo returns null', () => {
  assert.equal(detectStack(ctxFrom({})), null);
});

// ── TypeScript ──────────────────────────────────────────────────────────────

test('detect: typescript + express + npm (lockfile)', () => {
  const ctx = ctxFrom({
    'package.json': JSON.stringify({ dependencies: { express: '^4.18' } }),
    'package-lock.json': '{}',
  });
  assert.deepEqual(detectStack(ctx), {
    language: 'typescript',
    framework: 'express',
    packageManager: 'npm',
  });
});

test('detect: typescript + nextjs + pnpm', () => {
  const ctx = ctxFrom({
    'package.json': JSON.stringify({ dependencies: { next: '^15' } }),
    'pnpm-lock.yaml': 'lockfileVersion: 6.0',
  });
  assert.deepEqual(detectStack(ctx), {
    language: 'typescript',
    framework: 'nextjs',
    packageManager: 'pnpm',
  });
});

test('detect: typescript + nest + yarn', () => {
  const ctx = ctxFrom({
    'package.json': JSON.stringify({ dependencies: { '@nestjs/core': '^10' } }),
    'yarn.lock': '# yarn',
  });
  assert.deepEqual(detectStack(ctx), {
    language: 'typescript',
    framework: 'nest',
    packageManager: 'yarn',
  });
});

test('detect: typescript + none + npm (no lockfile, no framework deps)', () => {
  const ctx = ctxFrom({ 'package.json': JSON.stringify({ name: 'x' }) });
  assert.deepEqual(detectStack(ctx), {
    language: 'typescript',
    framework: 'none',
    packageManager: 'npm',
  });
});

// ── Python ──────────────────────────────────────────────────────────────────

test('detect: python + fastapi + uv', () => {
  const ctx = ctxFrom({
    'pyproject.toml': '[project]\nname="x"\ndependencies=["fastapi"]\n',
    'uv.lock': 'version=1',
  });
  assert.deepEqual(detectStack(ctx), {
    language: 'python',
    framework: 'fastapi',
    packageManager: 'uv',
  });
});

test('detect: python + django + poetry', () => {
  const ctx = ctxFrom({
    'pyproject.toml': '[tool.poetry]\nname="x"\n[tool.poetry.dependencies]\ndjango="^5"\n',
  });
  assert.deepEqual(detectStack(ctx), {
    language: 'python',
    framework: 'django',
    packageManager: 'poetry',
  });
});

test('detect: python + flask + pip (requirements.txt)', () => {
  const ctx = ctxFrom({ 'requirements.txt': 'flask\n' });
  assert.deepEqual(detectStack(ctx), {
    language: 'python',
    framework: 'flask',
    packageManager: 'pip',
  });
});

// ── Go ──────────────────────────────────────────────────────────────────────

test('detect: go + gin', () => {
  const ctx = ctxFrom({ 'go.mod': 'module x\ngo 1.22\nrequire github.com/gin-gonic/gin v1.10\n' });
  assert.deepEqual(detectStack(ctx), {
    language: 'go',
    framework: 'gin',
    packageManager: 'go',
  });
});

test('detect: go + standard', () => {
  const ctx = ctxFrom({ 'go.mod': 'module x\ngo 1.22\n' });
  assert.deepEqual(detectStack(ctx), {
    language: 'go',
    framework: 'standard',
    packageManager: 'go',
  });
});

// ── Java ────────────────────────────────────────────────────────────────────

test('detect: java + spring-boot + maven', () => {
  const ctx = ctxFrom({ 'pom.xml': '<project><spring-boot></spring-boot></project>' });
  assert.deepEqual(detectStack(ctx), {
    language: 'java',
    framework: 'spring-boot',
    packageManager: 'maven',
  });
});

test('detect: java + quarkus + gradle', () => {
  const ctx = ctxFrom({ 'build.gradle.kts': 'plugins { id("io.quarkus") }\n' });
  assert.deepEqual(detectStack(ctx), {
    language: 'java',
    framework: 'quarkus',
    packageManager: 'gradle',
  });
});

// ── Rust ────────────────────────────────────────────────────────────────────

test('detect: rust + actix', () => {
  const ctx = ctxFrom({ 'Cargo.toml': '[package]\nname="x"\n[dependencies]\nactix-web = "4"\n' });
  assert.deepEqual(detectStack(ctx), {
    language: 'rust',
    framework: 'actix',
    packageManager: 'cargo',
  });
});

test('detect: rust + axum', () => {
  const ctx = ctxFrom({ 'Cargo.toml': '[package]\nname="x"\n[dependencies]\naxum = "0.7"\n' });
  assert.deepEqual(detectStack(ctx), {
    language: 'rust',
    framework: 'axum',
    packageManager: 'cargo',
  });
});

test('detect: rust + standard', () => {
  const ctx = ctxFrom({ 'Cargo.toml': '[package]\nname="x"\n' });
  assert.deepEqual(detectStack(ctx), {
    language: 'rust',
    framework: 'standard',
    packageManager: 'cargo',
  });
});
