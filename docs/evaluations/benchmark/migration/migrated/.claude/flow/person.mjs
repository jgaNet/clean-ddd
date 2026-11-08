#!/usr/bin/env node
/**
 * The person's time in arms C and C′ of the benchmark (RFC 0001 §10): each architecture task and
 * each contract stage, from start to end, appended to the run's person log so that it is counted
 * against the arm.
 *
 *   node .claude/flow/person.mjs --log <run>.person.jsonl start <feature> <task>
 *   node .claude/flow/person.mjs --log <run>.person.jsonl end <feature> <task> [note…]
 *   node .claude/flow/person.mjs --log <run>.person.jsonl total
 */
import { appendFileSync, existsSync, readFileSync } from 'node:fs';

const args = process.argv.slice(2);
const log = args[args.indexOf('--log') + 1];
const [verb, feature, task, ...note] = args.filter(
  (_, index) => index !== args.indexOf('--log') && index !== args.indexOf('--log') + 1,
);
const lines = existsSync(log)
  ? readFileSync(log, 'utf8')
      .split('\n')
      .filter(Boolean)
      .map(line => JSON.parse(line))
  : [];

if (verb === 'start' || verb === 'end') {
  appendFileSync(
    log,
    `${JSON.stringify({ event: `person-${verb}`, feature, task, at: new Date().toISOString(), ...(note.length && { note: note.join(' ') }) })}\n`,
  );
} else if (verb === 'total') {
  let total = 0;
  const open = new Map();
  for (const line of lines) {
    const key = `${line.feature}/${line.task}`;
    if (line.event === 'person-start') open.set(key, Date.parse(line.at));
    if (line.event === 'person-end' && open.has(key)) {
      const ms = Date.parse(line.at) - open.get(key);
      total += ms;
      process.stdout.write(`${key}: ${Math.round(ms / 1000)} s\n`);
      open.delete(key);
    }
  }
  process.stdout.write(
    `total: ${Math.round(total / 1000)} s${open.size ? ` (still open: ${[...open.keys()].join(', ')})` : ''}\n`,
  );
} else {
  process.stderr.write('usage: person.mjs --log <file> start|end <feature> <task> [note…] | total\n');
  process.exit(2);
}
