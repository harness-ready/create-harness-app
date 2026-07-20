// cli.js -- interactive CLI orchestrator for create-harness-app
import * as readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { basename, join, resolve } from 'node:path';
import { writeToFile, formatTree, fileExists } from './utils.js';
import { generateAll } from './templates.js';
import { LANGUAGES, CODING_AGENTS, TEAM_MODES, CI_PROVIDERS } from './config.js';
import { detectStackInDir } from './detect.js';

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

// Supported convention locales. English is the default; `--locale zh` opts in.
const SUPPORTED_LOCALES = ['en', 'zh'];

function resolveLocale(args) {
  let raw = null;
  const i = args.indexOf('--locale');
  if (i !== -1 && args[i + 1]) raw = args[i + 1];
  if (!raw) {
    const prefix = '--locale=';
    const hit = args.find((a) => a.startsWith(prefix));
    if (hit) raw = hit.slice(prefix.length);
  }
  if (!raw) return 'en';
  if (SUPPORTED_LOCALES.includes(raw)) return raw;
  console.warn(
    c.yellow(
      '  Unknown locale "' + raw + '", falling back to "en". Supported: ' +
        SUPPORTED_LOCALES.join(', ') + '.'
    )
  );
  return 'en';
}

// -- Main --

export async function main() {
  const args = process.argv.slice(2);

  const nonFlagArgs = args.filter(function (a) { return !a.startsWith('--'); });
  const useDefaults = args.includes('--yes') || args.includes('-y');
  const initialName = nonFlagArgs[0] || '';
  const locale = resolveLocale(args);

  if (nonFlagArgs[0] !== 'init') {
    console.log();
    console.log(c.magenta(c.bold('  create-harness-app')));
    console.log(c.dim('  Generate a harness-engineering-ready project for AI coding agents'));
    console.log();
  }

  const rl = readline.createInterface({ input: input, output: output });

  try {
    if (nonFlagArgs[0] === 'init') {
      await runInit(rl, nonFlagArgs.slice(1), locale);
      return;
    }

    const answers = {};

    if (useDefaults) {
      answers.projectName = initialName || 'my-project';
      answers.description = '';
      const lang = 'typescript';
      answers.language = lang;
      answers.framework = LANGUAGES[lang].defaultFramework;
      answers.packageManager = LANGUAGES[lang].packageManagers[0].value;
      answers.codingAgent = 'claude-code';
      answers.teamMode = 'solo';
      answers.ciProvider = 'github';
    } else {
      answers.projectName = await textPrompt(rl, 'Project name', initialName || 'my-project');
      answers.description = await textPrompt(rl, 'Description (optional)', '');

      const langOptions = Object.entries(LANGUAGES).map(function (entry) {
        return { value: entry[0], label: entry[1].label };
      });
      answers.language = await selectPrompt(rl, 'Choose language', langOptions, 'typescript');

      var langCfg = LANGUAGES[answers.language];
      answers.framework = await selectPrompt(rl, 'Choose framework', langCfg.frameworks, langCfg.defaultFramework);

      if (langCfg.packageManagers.length > 1) {
        answers.packageManager = await selectPrompt(
          rl,
          'Choose package manager',
          langCfg.packageManagers.map(function (p) { return { value: p.value, label: p.label }; }),
          langCfg.packageManagers[0].value
        );
      } else {
        answers.packageManager = langCfg.packageManagers[0].value;
      }

      answers.codingAgent = await selectPrompt(rl, 'Primary AI coding agent', CODING_AGENTS, 'claude-code');
      answers.teamMode = await selectPrompt(rl, 'Team mode', TEAM_MODES, 'solo');
      answers.ciProvider = await selectPrompt(rl, 'CI provider', CI_PROVIDERS, 'github');
    }

    answers.locale = locale;

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
    var targetDir = resolve(answers.projectName);
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

async function runInit(rl, positional, locale) {
  const args = process.argv.slice(2);
  const useDefaults = args.includes('--yes') || args.includes('-y');
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
  } else if (useDefaults) {
    console.log(c.yellow('  Could not detect a stack in ' + targetDir + '.'));
    console.log(c.dim('  Run "create-harness-app init" without --yes to choose a stack.'));
    return;
  } else {
    console.log(c.dim('  No stack detected — choose one below.'));
  }
  console.log();

  const answers = { projectName: basename(targetDir) || 'project', description: '', locale };

  if (useDefaults && detected) {
    Object.assign(answers, detected, {
      codingAgent: 'claude-code',
      teamMode: 'solo',
      ciProvider: 'github',
    });
  } else {
    const langOptions = Object.entries(LANGUAGES).map(function (e) {
      return { value: e[0], label: e[1].label };
    });
    answers.language = await selectPrompt(
      rl,
      'Language',
      langOptions,
      (detected && detected.language) || 'typescript'
    );
    var langCfg = LANGUAGES[answers.language];
    answers.framework = await selectPrompt(
      rl,
      'Framework',
      langCfg.frameworks,
      (detected && detected.framework) || langCfg.defaultFramework
    );
    if (langCfg.packageManagers.length > 1) {
      answers.packageManager = await selectPrompt(
        rl,
        'Choose package manager',
        langCfg.packageManagers.map(function (p) {
          return { value: p.value, label: p.label };
        }),
        (detected && detected.packageManager) || langCfg.packageManagers[0].value
      );
    } else {
      answers.packageManager = langCfg.packageManagers[0].value;
    }
    answers.codingAgent = await selectPrompt(rl, 'Primary AI coding agent', CODING_AGENTS, 'claude-code');
    answers.teamMode = await selectPrompt(rl, 'Team mode', TEAM_MODES, 'solo');
    answers.ciProvider = await selectPrompt(rl, 'CI provider', CI_PROVIDERS, 'github');

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
