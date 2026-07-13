// cli.js -- interactive CLI orchestrator for create-harness-app
import * as readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { join, resolve } from 'node:path';
import { writeToFile, formatTree } from './utils.js';
import { generateAll } from './templates.js';
import { LANGUAGES, CODING_AGENTS, TEAM_MODES, CI_PROVIDERS } from './config.js';

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

  console.log();
  console.log(c.magenta(c.bold('  create-harness-app')));
  console.log(c.dim('  Generate a harness-engineering-ready project for AI coding agents'));
  console.log();

  const rl = readline.createInterface({ input: input, output: output });

  try {
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
