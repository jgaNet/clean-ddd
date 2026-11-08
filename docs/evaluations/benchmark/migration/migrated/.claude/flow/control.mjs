#!/usr/bin/env node
/**
 * The projects the control arms start from (docs/evaluations/benchmark/control):
 *
 *   node .claude/flow/control.mjs plain <dir>   arm P: a TypeScript Fastify project, the same toolchain, no
 *                                               architecture and no clean-ddd tooling
 *   node .claude/flow/control.mjs prose <dir>   arm D: a project `clean-ddd create` made, with the tooling taken
 *                                               out — no contract, no generated import rules, no CLI, no skills —
 *                                               and the architecture given as a prose guide instead
 *
 *   --name <app>      the application's name (notes-app by default)
 *   --guide <file>    plain only: the CLAUDE.md the project starts with, in place of the control's (OpenStay's
 *                     simple arm: docs/evaluations/benchmark/openstay/pilot/simple-CLAUDE.md)
 *
 * Each is installed and committed, like the arms' created projects; the commit is printed.
 */
import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

const args = process.argv.slice(2);
const option = (name, fallback) => (args.includes(`--${name}`) ? args[args.indexOf(`--${name}`) + 1] : fallback);
const [kind, target] = args;
if (!['plain', 'prose'].includes(kind) || !target) {
  process.stderr.write('usage: node .claude/flow/control.mjs plain|prose <dir> [--name <app>] [--guide <file>]\n');
  process.exit(2);
}
const name = option('name', 'notes-app');
const guide = option('guide');
const repository = resolve(new URL('../..', import.meta.url).pathname);
const control = join(repository, 'docs/evaluations/benchmark/control');
const dir = resolve(target);
const run = (command, args, cwd = dir) => execFileSync(command, args, { cwd, encoding: 'utf8', stdio: 'pipe' });

rmSync(dir, { recursive: true, force: true });
rmSync(`${dir}.flow`, { recursive: true, force: true });
mkdirSync(dirname(dir), { recursive: true });

if (kind === 'plain') {
  cpSync(join(control, 'plain'), dir, { recursive: true });
  renameSync(join(dir, 'gitignore'), join(dir, '.gitignore'));
  if (guide) cpSync(resolve(guide), join(dir, 'CLAUDE.md'));
  for (const file of ['package.json', 'CLAUDE.md']) {
    const path = join(dir, file);
    writeFileSync(path, readFileSync(path, 'utf8').replaceAll('notes-app', name));
  }
} else {
  run(process.execPath, [join(repository, 'tools/dist/cli.js'), 'create', dir, '--name', name], dirname(dir));
  // The tooling out: the contract, the CLI and its scripts, the import rules generated from the contract.
  for (const path of ['conventions', '.claude', 'README.md']) rmSync(join(dir, path), { recursive: true, force: true });
  const manifest = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'));
  for (const script of ['check:conventions', 'conventions:write', 'architecture']) delete manifest.scripts[script];
  delete manifest.devDependencies['clean-ddd'];
  delete manifest.devDependencies['js-yaml'];
  manifest.scripts.verify = 'yarn -s typecheck && yarn -s lint && yarn -s format:check && yarn -s test';
  writeFileSync(join(dir, 'package.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  cpSync(join(control, 'plain/eslint.config.js'), join(dir, 'eslint.config.js'));
  // The architecture as prose: the contract's rules, in words, with nothing to hold the code to them.
  cpSync(join(control, 'prose/CLAUDE.md'), join(dir, 'CLAUDE.md'));
  cpSync(join(control, 'prose/Contexts-README.md'), join(dir, 'src/Contexts/README.md'));
  const events = join(dir, 'src/SharedKernel/Application/IntegrationEvents/README.md');
  if (existsSync(events))
    writeFileSync(events, readFileSync(events, 'utf8').replace(/^.*clean-ddd checklist.*\n/m, ''));
}

run('yarn', ['install', '--silent']);
if (!existsSync(join(dir, 'node_modules'))) throw new Error('yarn install left no node_modules');
run('git', ['init', '-q', '-b', 'main']);
run('git', ['add', '-A']);
run('git', [
  '-c',
  'user.name=architect',
  '-c',
  'user.email=architect@example.com',
  'commit',
  '-qm',
  `created: ${kind}`,
]);
process.stdout.write(`${run('git', ['rev-parse', '--short', 'HEAD']).trim()}\n`);
