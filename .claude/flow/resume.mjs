#!/usr/bin/env node
/**
 * Brings back the ladders a restart of the machine stopped (J5b: three container restarts and a stale slot cost
 * attempts and two hours). Every ladder registers itself when it starts (`machine.mjs`, `registryFile()`); this reads
 * the register and starts again, with `--resume`, each run that is not running, not held and not finished for good.
 *
 *   node .claude/flow/resume.mjs [--dry]
 *
 * For each run it resumes, from the plan:
 *   - `envFile` (relative to the plan) is sourced first, so the run has the variables it was started with;
 *   - `services.start` runs next (a database the hidden tests need);
 *   - the ladder starts detached in a session of its own, its output appended to the run's `.out` beside its log.
 * A run is held by a file `<project>.flow/hold`. `--dry` says what it would resume and starts nothing.
 *
 * Wire it where the machine starts: the environment's setup script, or a SessionStart hook.
 */
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';

import { readRegistry, toResume } from './machine.mjs';

const dry = process.argv.includes('--dry');
const ladder = join(dirname(new URL(import.meta.url).pathname), 'run-ladder.mjs');
const running = spawnSync('ps', ['-eo', 'args'], { encoding: 'utf8' }).stdout ?? '';
const lastEvent = file => {
  try {
    const lines = readFileSync(file, 'utf8').trim().split('\n');
    return JSON.parse(lines.at(-1));
  } catch {
    return undefined;
  }
};
const shellQuote = value => `'${String(value).replace(/'/g, `'\\''`)}'`;

const entries = readRegistry();
const resumed = toResume(entries, entry => ({
  running: running
    .split('\n')
    .some(line => line.includes('run-ladder.mjs') && line.includes(`--project ${entry.project} `)),
  held: existsSync(`${entry.project}.flow/hold`),
  last: lastEvent(entry.log),
}));

for (const entry of resumed) {
  let plan = {};
  try {
    plan = createRequire(join(entry.project, 'package.json'))('js-yaml').load(readFileSync(entry.plan, 'utf8')) ?? {};
  } catch {
    // a plan that cannot be read now is the ladder's to refuse, with its own message
  }
  const envFile = plan.envFile ? resolve(dirname(entry.plan), plan.envFile) : undefined;
  const steps = [
    envFile ? `set -a; . ${shellQuote(envFile)}; set +a` : '',
    plan.services?.start ?? '',
    `exec ${shellQuote(process.execPath)} ${shellQuote(ladder)} --resume --project ${shellQuote(entry.project)} --plan ${shellQuote(entry.plan)} >> ${shellQuote(entry.out)} 2>&1 < /dev/null`,
  ].filter(Boolean);
  process.stdout.write(`${dry ? 'would resume' : 'resuming'} ${entry.run} (${entry.project})\n`);
  if (dry) continue;
  const child = spawn('bash', ['-c', steps.join('\n')], { cwd: dirname(ladder), detached: true, stdio: 'ignore' });
  child.unref();
}
if (!resumed.length) process.stdout.write(`nothing to resume (${entries.length} run(s) registered)\n`);
