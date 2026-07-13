// Matrix test: for every valid input combo (driven by config.js), generateAll
// must (a) not throw, (b) return well-formed artefacts with no duplicate paths,
// and (c) emit exactly the filepath set declared by `expectedFiles`.
//
// Split per-language so a regression in one stack is reported on its own line.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateAll } from '../lib/templates.js';
import { LANGUAGES } from '../lib/config.js';
import { allCombos, expectedFiles, label } from './fixtures.js';

const COMBOS = allCombos();

for (const language of Object.keys(LANGUAGES)) {
  test(`generateAll [${language}]: exact expected file set across the matrix`, () => {
    const failures = [];

    for (const answers of COMBOS.filter((a) => a.language === language)) {
      // (a) no-throw
      let artefacts;
      try {
        artefacts = generateAll(answers);
      } catch (err) {
        failures.push(`${label(answers)}: threw -> ${err.message}`);
        continue;
      }

      // (b) well-formed artefacts
      for (const a of artefacts) {
        if (!a || typeof a.filepath !== 'string' || !a.filepath || typeof a.content !== 'string') {
          failures.push(`${label(answers)}: malformed artefact ${JSON.stringify(a)}`);
        }
      }

      const paths = artefacts.map((a) => a.filepath).sort();

      // (b) no duplicate paths (exercises the Python pyproject.toml dedup)
      const seen = new Set();
      for (const p of paths) {
        if (seen.has(p)) failures.push(`${label(answers)}: duplicate path ${p}`);
        else seen.add(p);
      }

      // (c) exact file-set match, reported as missing/extra for easy diagnosis
      const expected = expectedFiles(answers);
      if (paths.join('|') !== expected.join('|')) {
        const got = new Set(paths);
        const missing = expected.filter((p) => !got.has(p));
        const extra = paths.filter((p) => !expected.includes(p));
        failures.push(
          `${label(answers)}: missing=[${missing.join(',')}] extra=[${extra.join(',')}]`
        );
      }
    }

    assert.deepEqual(
      failures,
      [],
      failures.length
        ? `${failures.length} combo(s) failed for ${language}:\n` + failures.join('\n')
        : ''
    );
  });
}

test('generateAll: matrix covers every language declared in config', () => {
  const covered = new Set(COMBOS.map((a) => a.language));
  assert.deepEqual([...covered].sort(), Object.keys(LANGUAGES).sort());
});
