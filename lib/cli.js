// cli.js -- interactive CLI orchestrator for create-harness-app
import * as readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { basename, join, resolve } from 'node:path';
import { writeToFile, formatTree, fileExists } from './utils.js';
import { generateAll } from './templates.js';
import { LANGUAGES, CODING_AGENTS, TEAM_MODES, CI_PROVIDERS, SENSORS } from './config.js';
import { detectStackInDir } from './detect.js';
import { loadConfig } from './config-loader.js';

// -- ANSI colors (zero-dependency) --
const c = {
  bold: (s) => '\x1b[1m' + s + '\x1b[0m',
  cyan: (s) => '\x1b[36m' + s + '\x1b[0m',
  green: (s) => '\x1b[32m' + s + '\x1b[0m',
  yellow: (s) => '\x1b[33m' + s + '\x1b[0m',
  dim: (s) => '\x1b[2m' + s + '\x1b[0m',
  magenta: (s) => '\x1b[35m' + s + '\x1b[0m',
};

// -- Prompt helpers --

async function textPrompt(rl, message, defaultValue) {
  const suffix = defaultValue ? ' ' + c.dim('(' + defaultValue + ')') : '';
  const answer = await rl.question(c.cyan('?') + ' ' + message + suffix + ': ');
  return answer.trim() || defaultValue || '';
}

async function selectPrompt(rl, message, options, defaultValue) {
  console.log('\n' + c.cyan('?') + ' ' + message);
  options.forEach(function (opt, i) {
    const marker = opt.value === defaultValue ? c.green(' (default)') : '';
    console.log('  ' + c.dim(String(i + 1) + '.') + ' ' + opt.label + marker);
  });
  const answer = await rl.question('  ' + c.dim('Choose [1-' + options.length + ']') + ': ');
  const idx = parseInt(answer.trim(), 10) - 1;
  if (isNaN(idx) || idx < 0 || idx >= options.length) {
    if (defaultValue) {
      const found = options.find(function (o) { return o.value === defaultValue; });
      if (found) return found.value;
    }
    return options[0].value;
  }
  return options[idx].value;
}

async function multiSelectPrompt(rl, message, options, defaults) {
  const defSet = new Set(defaults || []);
  console.log('\n' + c.cyan('?') + ' ' + message + ' ' + c.dim('(comma-separated numbers/names, blank = [default])'));
  options.forEach(function (opt, i) {
    const mark = defSet.has(opt.value) ? c.green(' [x]') : c.dim(' [ ]');
    console.log('  ' + c.dim(String(i + 1) + '.') + ' ' + opt.label + mark);
  });
  const answer = await rl.question('  ' + c.dim('Choose') + ': ');
  const trimmed = answer.trim();
  if (!trimmed) return options.filter((o) => defSet.has(o.value)).map((o) => o.value);
  const picked = new Set();
  for (const tok of trimmed.split(/[,\s]+/)) {
    if (!tok) continue;
    const idx = parseInt(tok, 10) - 1;
    if (!isNaN(idx) && idx >= 0 && idx < options.length) {
      picked.add(options[idx].value);
    } else {
      const byName = options.find((o) => o.value === tok.toLowerCase());
      if (byName) picked.add(byName.value);
    }
  }
  return [...picked];
}

// Supported convention locales. English is the default; `--locale zh` opts in.
const SUPPORTED_LOCALES = ['en', 'zh'];

// Flags that consume the following argument as a value, so the value is not
// mistaken for a positional project name / target dir (issue #7).
const VALUE_FLAGS = new Set(['--locale', '--config', '--sensors']);

function parseCliArgs(args) {
  const positionals = [];
  const flags = new Set();
  const values = {};
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '-y') {
      flags.add('--yes');
      continue;
    }
    if (a.startsWith('--')) {
      const eq = a.indexOf('=');
      if (eq !== -1) {
        const key = a.slice(0, eq);
        if (VALUE_FLAGS.has(key)) values[key.slice(2)] = a.slice(eq + 1);
        else flags.add(key);
      } else if (VALUE_FLAGS.has(a)) {
        const next = args[i + 1];
        if (next !== undefined && !next.startsWith('--')) {
          values[a.slice(2)] = next;
          i++;
        } else {
          flags.add(a);
        }
      } else {
        flags.add(a);
      }
    } else {
      positionals.push(a);
    }
  }
  return { positionals, flags, values };
}

function resolveLocale(values) {
  const raw = values.locale;
  if (!raw) return 'en';
  if (SUPPORTED_LOCALES.includes(raw)) return raw;
  console.warn(
    c.yellow(
      '  Unknown locale "' +
        raw +
        '", falling back to "en". Supported: ' +
        SUPPORTED_LOCALES.join(', ') +
        '.'
    )
  );
  return 'en';
}

// Built-in answer defaults for the create flow.
function builtinCreateDefaults(initialName) {
  const lang = 'typescript';
  return {
    projectName: initialName || 'my-project',
    description: '',
    language: lang,
    framework: LANGUAGES[lang].defaultFramework,
    packageManager: LANGUAGES[lang].packageManagers[0].value,
    codingAgent: 'claude-code',
    teamMode: 'solo',
    ciProvider: 'github',
  };
}

// -- Main --

export async function main() {
  const args = process.argv.slice(2);
  const { positionals, flags, values } = parseCliArgs(args);
  const useDefaults = flags.has('--yes');
  const locale = resolveLocale(values);
  const config = loadConfig({ configPath: values.config });
  if (config.path) {
    console.log(c.dim('  Using config: ' + config.path));
  }
  // Extra sensors (issue #8): --sensors flag wins, else config, else none.
  const sensorKeys = new Set(SENSORS.map((s) => s.value));
  const flagSensors = values.sensors
    ? values.sensors.split(',').map((s) => s.trim()).filter((s) => sensorKeys.has(s))
    : [];
  const sensorsDefault = flagSensors.length ? flagSensors : (config.sensors || []);
  const mcpDefault = flags.has('--mcp') || config.mcp;

  if (positionals[0] !== 'init') {
    console.log();
    console.log(c.magenta(c.bold('  create-harness-app')));
    console.log(c.dim('  Generate a harness-engineering-ready project for AI coding agents'));
    console.log();
  }

  const rl = readline.createInterface({ input: input, output: output });

  try {
    if (positionals[0] === 'init') {
      await runInit(rl, positionals.slice(1), locale, config, useDefaults, sensorsDefault, mcpDefault);
      return;
    }

    // Defaults: built-in, overlaid with --config / .harnessrc values.
    const defaults = builtinCreateDefaults(positionals[0]);
    Object.assign(defaults, config.values);
    defaults.locale = locale;
    defaults.sensors = sensorsDefault;
    defaults.mcp = mcpDefault;

    const answers = {};

    if (useDefaults) {
      Object.assign(answers, defaults);
    } else {
      answers.projectName = await textPrompt(rl, 'Project name', defaults.projectName);
      answers.description = await textPrompt(rl, 'Description (optional)', defaults.description);

      const langOptions = Object.entries(LANGUAGES).map(function (entry) {
        return { value: entry[0], label: entry[1].label };
      });
      answers.language = await selectPrompt(rl, 'Choose language', langOptions, defaults.language);

      var langCfg = LANGUAGES[answers.language];
      var fwDefault = langCfg.frameworks.some(function (f) {
        return f.value === defaults.framework;
      })
        ? defaults.framework
        : langCfg.defaultFramework;
      answers.framework = await selectPrompt(rl, 'Choose framework', langCfg.frameworks, fwDefault);

      if (langCfg.packageManagers.length > 1) {
        var pmDefault = langCfg.packageManagers.some(function (p) {
          return p.value === defaults.packageManager;
        })
          ? defaults.packageManager
          : langCfg.packageManagers[0].value;
        answers.packageManager = await selectPrompt(
          rl,
          'Choose package manager',
          langCfg.packageManagers.map(function (p) {
            return { value: p.value, label: p.label };
          }),
          pmDefault
        );
      } else {
        answers.packageManager = langCfg.packageManagers[0].value;
      }

      answers.codingAgent = await selectPrompt(rl, 'Primary AI coding agent', CODING_AGENTS, defaults.codingAgent);
      answers.teamMode = await selectPrompt(rl, 'Team mode', TEAM_MODES, defaults.teamMode);
      answers.ciProvider = await selectPrompt(rl, 'CI provider', CI_PROVIDERS, defaults.ciProvider);
      answers.sensors = await multiSelectPrompt(rl, 'Extra sensors (optional)', SENSORS, defaults.sensors);
      var mcpAns = await textPrompt(rl, 'Generate starter MCP server config? (y/N)', defaults.mcp ? 'Y' : 'N');
      answers.mcp = mcpAns.trim().toLowerCase().startsWith('y');
    }

    answers.locale = locale;
    answers.extraConventions = config.extraConventions;

    // -- Config summary --
    console.log();
    console.log(c.dim('  ---------------------------------------'));
    console.log('  ' + c.bold('Configuration'));
    console.log(c.dim('  ---------------------------------------'));
    console.log('  Name:    ' + answers.projectName);
    console.log('  Lang:    ' + LANGUAGES[answers.language].label);
    var fw = LANGUAGES[answers.language].frameworks.find(function (f) { return f.value === answers.framework; });
    console.log('  Frame:   ' + (fw ? fw.label : answers.framework));
    console.log('  PM:      ' + answers.packageManager);
    var agent = CODING_AGENTS.find(function (a) { return a.value === answers.codingAgent; });
    console.log('  Agent:   ' + (agent ? agent.label : answers.codingAgent));
    var team = TEAM_MODES.find(function (t) { return t.value === answers.teamMode; });
    console.log('  Team:    ' + (team ? team.label : answers.teamMode));
    var ci = CI_PROVIDERS.find(function (p) { return p.value === answers.ciProvider; });
    console.log('  CI:      ' + (ci ? ci.label : answers.ciProvider));
    console.log('  Locale:  ' + answers.locale);
    console.log(c.dim('  ---------------------------------------'));
    console.log();

    if (!useDefaults) {
      var confirm = await textPrompt(rl, 'Confirm? (Y/n)', 'Y');
      if (confirm.toLowerCase() === 'n') {
        console.log(c.yellow('  Cancelled.'));
        return;
      }
    }

    // -- Generate --
    // The positional arg is the target directory; fall back to projectName so
    // `--config` (which sets projectName) still works without a positional.
    var targetDir = resolve(positionals[0] || answers.projectName);
    var artefacts = generateAll(answers);
    var createdFiles = [];

    console.log();
    console.log(c.cyan('  Generating files...'));
    console.log();

    for (var artefact of artefacts) {
      var fullPath = join(targetDir, artefact.filepath);
      await writeToFile(fullPath, artefact.content);
      createdFiles.push(fullPath);
    }

    // Create directory placeholders
    var dirList = (await import('./config.js')).FRAMEWORK_DIRS[answers.language] &&
                  (await import('./config.js')).FRAMEWORK_DIRS[answers.language][answers.framework] || [];
    for (var dir of dirList) {
      var placeholderPath = join(targetDir, dir, '.gitkeep');
      try {
        await writeToFile(placeholderPath, '');
        createdFiles.push(placeholderPath);
      } catch (e) {
        // directory may already have files
      }
    }

    // -- Summary --
    console.log(c.green(c.bold('\n  Done! Generated ' + artefacts.length + ' files in ' + answers.projectName + '/\n')));
    console.log(c.dim('  Files:'));
    console.log(formatTree(targetDir, createdFiles));
    console.log();

    // -- Next steps --
    console.log(c.bold('  Next steps:'));
    console.log();
    console.log('  ' + c.dim('1.') + ' Enter the project directory');
    console.log('     ' + c.cyan('cd ' + answers.projectName));
    console.log();
    console.log('  ' + c.dim('2.') + ' Install dependencies');
    var installCmd = LANGUAGES[answers.language].installCommand(answers.packageManager);
    if (installCmd) {
      console.log('     ' + c.cyan(installCmd));
    } else if (answers.language === 'java') {
      console.log('     ' + c.cyan(answers.packageManager === 'gradle' ? './gradlew build' : 'mvn install'));
    }
    console.log();
    console.log('  ' + c.dim('3.') + ' Activate Git hooks');
    console.log('     ' + c.cyan('sh scripts/setup-hooks.sh'));
    console.log();
    console.log('  ' + c.dim('4.') + ' Initialize Git');
    console.log('     ' + c.cyan('git init && git add -A && git commit -m "feat: initial harness-ready scaffold"'));
    console.log();
    console.log('  ' + c.dim('5.') + ' Start building with your AI coding agent!');
    console.log('     ' + c.dim('AGENTS.md has all the project context your agent needs.'));
    console.log();

    // -- Tips --
    if (answers.codingAgent === 'claude-code' || answers.codingAgent === 'multiple') {
      console.log(c.magenta('  >> ') + c.dim('Tip: open this dir with Claude Code, it auto-reads CLAUDE.md.'));
    }
    if (answers.codingAgent === 'cursor' || answers.codingAgent === 'multiple') {
      console.log(c.magenta('  >> ') + c.dim('Tip: open this dir with Cursor, it auto-reads .cursor/rules/.'));
    }
    console.log();
  } finally {
    rl.close();
  }
}

// -- init mode: add harness config to an existing project --

// Artefacts that belong to the project itself (manifests, source, test
// skeletons). `init` never injects these — only the surrounding harness.
const PROJECT_MANIFESTS = new Set([
  'package.json',
  'pyproject.toml',
  'go.mod',
  'pom.xml',
  'build.gradle.kts',
  'Cargo.toml',
]);
const PROJECT_SOURCES = new Set([
  'internal/app.go',
  'internal/app_test.go',
  'tests/index.test.ts',
  'tests/test_main.py',
  'tests/integration_test.rs',
]);
export function isProjectOwned(filepath) {
  return (
    PROJECT_MANIFESTS.has(filepath) ||
    filepath.startsWith('src/') || // TS/Python/Java/Rust source + Java test live under src/
    PROJECT_SOURCES.has(filepath)
  );
}

async function runInit(rl, positional, locale, config, useDefaults, sensorsDefault, mcpDefault) {
  const targetDir = resolve(positional[0] || '.');

  console.log();
  console.log(c.magenta(c.bold('  create-harness-app init')));
  console.log(c.dim('  Add harness config to an existing project in ' + targetDir));
  console.log();

  const detected = detectStackInDir(targetDir);
  if (detected) {
    console.log(
      '  ' +
        c.green('Detected:') +
        ' ' +
        LANGUAGES[detected.language].label +
        ' / ' +
        detected.framework +
        ' / ' +
        detected.packageManager
    );
  } else {
    console.log(c.dim('  No stack detected — choose a stack below (or supply --config).'));
  }
  console.log();

  const answers = { projectName: basename(targetDir) || 'project', description: '', locale };

  // Defaults: detected stack, overlaid with --config / .harnessrc values.
  const defaults = {};
  if (detected) Object.assign(defaults, detected);
  Object.assign(defaults, config.values);
  if (!defaults.codingAgent) defaults.codingAgent = 'claude-code';
  if (!defaults.teamMode) defaults.teamMode = 'solo';
  if (!defaults.ciProvider) defaults.ciProvider = 'github';
  defaults.sensors = sensorsDefault || [];
  defaults.mcp = !!mcpDefault;

  if (useDefaults) {
    if (!defaults.language) {
      console.log(c.yellow('  Could not determine a stack for ' + targetDir + '.'));
      console.log(c.dim('  Run "create-harness-app init" without --yes, or supply --config.'));
      return;
    }
    Object.assign(answers, defaults);
  } else {
    const langOptions = Object.entries(LANGUAGES).map(function (e) {
      return { value: e[0], label: e[1].label };
    });
    answers.language = await selectPrompt(rl, 'Language', langOptions, defaults.language || 'typescript');
    var langCfg = LANGUAGES[answers.language];
    var fwDefault = langCfg.frameworks.some(function (f) {
      return f.value === defaults.framework;
    })
      ? defaults.framework
      : langCfg.defaultFramework;
    answers.framework = await selectPrompt(rl, 'Framework', langCfg.frameworks, fwDefault);
    if (langCfg.packageManagers.length > 1) {
      var pmDefault = langCfg.packageManagers.some(function (p) {
        return p.value === defaults.packageManager;
      })
        ? defaults.packageManager
        : langCfg.packageManagers[0].value;
      answers.packageManager = await selectPrompt(
        rl,
        'Choose package manager',
        langCfg.packageManagers.map(function (p) {
          return { value: p.value, label: p.label };
        }),
        pmDefault
      );
    } else {
      answers.packageManager = langCfg.packageManagers[0].value;
    }
    answers.codingAgent = await selectPrompt(rl, 'Primary AI coding agent', CODING_AGENTS, defaults.codingAgent);
    answers.teamMode = await selectPrompt(rl, 'Team mode', TEAM_MODES, defaults.teamMode);
    answers.ciProvider = await selectPrompt(rl, 'CI provider', CI_PROVIDERS, defaults.ciProvider);
    answers.sensors = await multiSelectPrompt(rl, 'Extra sensors (optional)', SENSORS, defaults.sensors);
    var mcpAns = await textPrompt(rl, 'Generate starter MCP server config? (y/N)', defaults.mcp ? 'Y' : 'N');
    answers.mcp = mcpAns.trim().toLowerCase().startsWith('y');

    var confirm = await textPrompt(
      rl,
      'Inject harness config? Existing files are skipped. (Y/n)',
      'Y'
    );
    if (confirm.toLowerCase() === 'n') {
      console.log(c.yellow('  Cancelled.'));
      return;
    }
  }

  answers.extraConventions = config.extraConventions;

  // Generate, keep only harness artefacts, and skip anything already present.
  const all = generateAll(answers);
  const harness = all.filter(function (a) {
    return !isProjectOwned(a.filepath);
  });
  const created = [];
  const skipped = [];

  console.log();
  console.log(c.cyan('  Injecting harness files...'));

  for (var artefact of harness) {
    var fullPath = join(targetDir, artefact.filepath);
    if (await fileExists(fullPath)) {
      skipped.push(artefact.filepath);
      continue;
    }
    await writeToFile(fullPath, artefact.content);
    created.push(artefact.filepath);
  }

  console.log();
  console.log(c.green(c.bold('  Done! init complete in ' + targetDir)));
  if (created.length) {
    console.log(c.dim('  Created:'));
    created.forEach(function (f) {
      console.log('  ' + c.green('+') + ' ' + f);
    });
  }
  if (skipped.length) {
    console.log(c.dim('  Skipped (already exist):'));
    skipped.forEach(function (f) {
      console.log('  ' + c.yellow('~') + ' ' + f);
    });
  }
  console.log();
  console.log(c.bold('  Next steps:'));
  console.log();
  console.log('  ' + c.dim('1.') + ' Activate Git hooks');
  console.log('     ' + c.cyan('sh scripts/setup-hooks.sh'));
  console.log();
  console.log('  ' + c.dim('2.') + ' Review AGENTS.md and commit');
  console.log('     ' + c.cyan('git add -A && git commit -m "chore: add harness config"'));
  console.log();
  console.log('  ' + c.dim('•') + ' Existing source, manifests, and README were left untouched.');
  console.log();
}
