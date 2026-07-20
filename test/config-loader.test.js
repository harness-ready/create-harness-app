// Tests for lib/config-loader.js — reproducible scaffolds (issue #7).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadConfig } from '../lib/config-loader.js';

test('loadConfig: no config file returns empty', () => {
  const dir = mkdtempSync(join(tmpdir(), 'cfg-'));
  const r = loadConfig({ cwd: dir });
  assert.deepEqual(r.values, {});
  assert.deepEqual(r.extraConventions, []);
  assert.equal(r.path, null);
});

test('loadConfig: explicit configPath parses values + extraConventions', () => {
  const dir = mkdtempSync(join(tmpdir(), 'cfg-'));
  const file = join(dir, 'team.json');
  writeFileSync(
    file,
    JSON.stringify({
      projectName: 'team-app',
      language: 'typescript',
      framework: 'express',
      packageManager: 'pnpm',
      codingAgent: 'cursor',
      teamMode: 'small',
      ciProvider: 'gitlab',
      locale: 'zh',
      extraConventions: ['Use dayjs', 'Version all endpoints'],
    })
  );
  const r = loadConfig({ configPath: file });
  assert.equal(r.values.language, 'typescript');
  assert.equal(r.values.framework, 'express');
  assert.equal(r.values.packageManager, 'pnpm');
  assert.equal(r.values.codingAgent, 'cursor');
  assert.equal(r.values.locale, 'zh');
  assert.deepEqual(r.extraConventions, ['Use dayjs', 'Version all endpoints']);
  assert.equal(r.path, file);
});

test('loadConfig: auto-discovers .harnessrc.json in cwd', () => {
  const dir = mkdtempSync(join(tmpdir(), 'cfg-'));
  writeFileSync(
    join(dir, '.harnessrc.json'),
    JSON.stringify({ language: 'python', framework: 'fastapi', packageManager: 'uv' })
  );
  const r = loadConfig({ cwd: dir });
  assert.equal(r.values.language, 'python');
  assert.equal(r.values.framework, 'fastapi');
  assert.ok(r.path && r.path.endsWith('.harnessrc.json'));
});

test('loadConfig: invalid enum values are ignored', () => {
  const dir = mkdtempSync(join(tmpdir(), 'cfg-'));
  const file = join(dir, 'c.json');
  writeFileSync(
    file,
    JSON.stringify({ language: 'klingon', ciProvider: 'bitbucket', teamMode: 'army' })
  );
  const r = loadConfig({ configPath: file, warn: () => {} });
  assert.equal(r.values.language, undefined);
  assert.equal(r.values.ciProvider, undefined);
  assert.equal(r.values.teamMode, undefined);
});

test('loadConfig: framework/packageManager invalid for the language are ignored', () => {
  const dir = mkdtempSync(join(tmpdir(), 'cfg-'));
  const file = join(dir, 'c.json');
  writeFileSync(
    file,
    JSON.stringify({ language: 'typescript', framework: 'django', packageManager: 'cargo' })
  );
  const r = loadConfig({ configPath: file, warn: () => {} });
  assert.equal(r.values.language, 'typescript'); // valid, kept
  assert.equal(r.values.framework, undefined); // not a TS framework
  assert.equal(r.values.packageManager, undefined); // not a TS package manager
});

test('loadConfig: malformed JSON returns empty and warns', () => {
  const dir = mkdtempSync(join(tmpdir(), 'cfg-'));
  const file = join(dir, 'bad.json');
  writeFileSync(file, '{not json');
  let warned = false;
  const r = loadConfig({ configPath: file, warn: () => { warned = true; } });
  assert.deepEqual(r.values, {});
  assert.equal(warned, true);
  assert.equal(r.path, file);
});

test('loadConfig: non-array extraConventions becomes []', () => {
  const dir = mkdtempSync(join(tmpdir(), 'cfg-'));
  const file = join(dir, 'c.json');
  writeFileSync(file, JSON.stringify({ extraConventions: 'not an array' }));
  const r = loadConfig({ configPath: file, warn: () => {} });
  assert.deepEqual(r.extraConventions, []);
});
