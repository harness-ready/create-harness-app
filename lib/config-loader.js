// config-loader.js — reproducible scaffolds (issue #7).
//
// Resolves a JSON config file (explicit --config, or an auto-discovered
// .harnessrc.json / harness.config.json in cwd) and returns validated answer
// values plus an optional `extraConventions` hook (team-specific bullets that
// generateAgentsMd appends to AGENTS.md).

import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { LANGUAGES, CODING_AGENTS, TEAM_MODES, CI_PROVIDERS } from './config.js';

const ANSWER_KEYS = [
  'projectName',
  'description',
  'language',
  'framework',
  'packageManager',
  'codingAgent',
  'teamMode',
  'ciProvider',
  'locale',
];
const AUTO_FILES = ['.harnessrc.json', '.harnessrc', 'harness.config.json'];

const VALID = {
  language: (v) => Object.prototype.hasOwnProperty.call(LANGUAGES, v),
  codingAgent: (v) => CODING_AGENTS.some((a) => a.value === v),
  teamMode: (v) => TEAM_MODES.some((t) => t.value === v),
  ciProvider: (v) => CI_PROVIDERS.some((p) => p.value === v),
  locale: (v) => v === 'en' || v === 'zh',
};

/** Resolve the config path: explicit `configPath`, else first auto-file in cwd. */
export function resolveConfigPath(configPath, cwd = process.cwd()) {
  if (configPath) return resolve(cwd, configPath);
  for (const f of AUTO_FILES) {
    const p = resolve(cwd, f);
    if (existsSync(p)) return p;
  }
  return null;
}

/**
 * Load and validate a config file.
 * @returns {{ values: object, extraConventions: string[], path: string|null }}
 */
export function loadConfig({ configPath, cwd = process.cwd(), warn = (m) => console.warn(m) } = {}) {
  const path = resolveConfigPath(configPath, cwd);
  if (!path) return { values: {}, extraConventions: [], path: null };

  let raw;
  try {
    raw = JSON.parse(readFileSync(path, 'utf-8'));
  } catch (err) {
    warn('  Could not parse config ' + path + ': ' + err.message);
    return { values: {}, extraConventions: [], path };
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    warn('  Config ' + path + ' is not a JSON object; ignoring.');
    return { values: {}, extraConventions: [], path };
  }

  const values = {};
  for (const k of ANSWER_KEYS) {
    if (!Object.prototype.hasOwnProperty.call(raw, k)) continue;
    const v = raw[k];
    if (VALID[k] && !VALID[k](v)) {
      warn('  Config ' + path + ': ignoring invalid "' + k + '"=' + JSON.stringify(v) + '.');
      continue;
    }
    values[k] = v;
  }

  // framework / packageManager must be valid for the chosen language.
  if (values.language && VALID.language(values.language)) {
    const cfg = LANGUAGES[values.language];
    if (values.framework && !cfg.frameworks.some((f) => f.value === values.framework)) {
      warn('  Config ' + path + ': ignoring invalid framework "' + values.framework + '" for ' + values.language + '.');
      delete values.framework;
    }
    if (values.packageManager && !cfg.packageManagers.some((p) => p.value === values.packageManager)) {
      warn('  Config ' + path + ': ignoring invalid packageManager "' + values.packageManager + '" for ' + values.language + '.');
      delete values.packageManager;
    }
  }

  const extraConventions = Array.isArray(raw.extraConventions)
    ? raw.extraConventions.filter((s) => typeof s === 'string')
    : [];

  return { values, extraConventions, path };
}
