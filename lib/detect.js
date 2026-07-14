// detect.js — best-effort detection of an existing project's stack.
//
// `detectStack` is pure: it takes a { has, read } context so it can be unit
// tested without the filesystem. `detectStackInDir` wires that context to a
// real directory for use by the CLI's `init` mode.

import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Detect the stack of an existing project.
 * @param {{ has: (p: string) => boolean, read: (p: string) => string }} ctx
 * @returns {{ language: string, framework: string, packageManager: string } | null}
 */
export function detectStack(ctx) {
  return (
    detectTypescript(ctx) ||
    detectPython(ctx) ||
    detectGo(ctx) ||
    detectJava(ctx) ||
    detectRust(ctx) ||
    null
  );
}

/** Detect against a real directory on disk. */
export function detectStackInDir(dir) {
  return detectStack({
    has: (p) => existsSync(resolve(dir, p)),
    read: (p) => {
      try {
        return readFileSync(resolve(dir, p), 'utf-8');
      } catch {
        return '';
      }
    },
  });
}

function detectTypescript({ has, read }) {
  if (!has('package.json')) return null;
  let pkg = {};
  try {
    pkg = JSON.parse(read('package.json') || '{}');
  } catch {
    pkg = {};
  }
  const deps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
  let framework = 'none';
  if (deps.next) framework = 'nextjs';
  else if (deps['@nestjs/core']) framework = 'nest';
  else if (deps.express) framework = 'express';
  let packageManager = 'npm';
  if (has('pnpm-lock.yaml')) packageManager = 'pnpm';
  else if (has('yarn.lock')) packageManager = 'yarn';
  else if (has('bun.lockb') || has('bun.lock')) packageManager = 'bun';
  else if (has('package-lock.json')) packageManager = 'npm';
  return { language: 'typescript', framework, packageManager };
}

function detectPython({ has, read }) {
  if (!has('pyproject.toml') && !has('requirements.txt')) return null;
  const text =
    (has('pyproject.toml') ? read('pyproject.toml') : '') +
    '\n' +
    (has('requirements.txt') ? read('requirements.txt') : '');
  let framework = 'none';
  if (/fastapi/i.test(text)) framework = 'fastapi';
  else if (/django/i.test(text)) framework = 'django';
  else if (/flask/i.test(text)) framework = 'flask';
  let packageManager = 'pip';
  if (has('uv.lock')) packageManager = 'uv';
  else if (/^\[tool\.poetry\]/m.test(text)) packageManager = 'poetry';
  return { language: 'python', framework, packageManager };
}

function detectGo({ has, read }) {
  if (!has('go.mod')) return null;
  const text = read('go.mod') + '\n' + (has('go.sum') ? read('go.sum') : '');
  let framework = 'standard';
  if (/github\.com\/gin-gonic\/gin/.test(text)) framework = 'gin';
  else if (/github\.com\/gofiber\/fiber/.test(text)) framework = 'fiber';
  return { language: 'go', framework, packageManager: 'go' };
}

function detectJava({ has, read }) {
  const isMaven = has('pom.xml');
  const isGradle = has('build.gradle') || has('build.gradle.kts');
  if (!isMaven && !isGradle) return null;
  const text =
    (isMaven ? read('pom.xml') : '') +
    '\n' +
    (has('build.gradle.kts') ? read('build.gradle.kts') : read('build.gradle'));
  let framework = 'none';
  if (/spring-boot/i.test(text)) framework = 'spring-boot';
  else if (/quarkus/i.test(text)) framework = 'quarkus';
  const packageManager = isGradle ? 'gradle' : 'maven';
  return { language: 'java', framework, packageManager };
}

function detectRust({ has, read }) {
  if (!has('Cargo.toml')) return null;
  const text = read('Cargo.toml');
  let framework = 'standard';
  if (/^actix-web\s*=/m.test(text)) framework = 'actix';
  else if (/^axum\s*=/m.test(text)) framework = 'axum';
  return { language: 'rust', framework, packageManager: 'cargo' };
}
