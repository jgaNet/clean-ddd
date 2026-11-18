/**
 * What `run-ladder.mjs` gives an agent and what it holds an attempt to, as functions its tests reach without a ladder
 * (ladder.test.mjs, run-ladder.test.mjs). Decided by the maintainer before J6 (docs/evaluations/benchmark/three-arms/
 * registration.md):
 *
 * - **The API as data (D3).** With each request, the agent is given the request's API fragment and those of the
 *   requests before it (`api/<n>-<id>.yaml` of the kit), in every arm alike: `apiFragments`, `apiBrief`.
 * - **A storm as a tree held to Lite reads it.** A context whose profile does not use the command bus answers its
 *   commands at once, and its storm says so (`answered: at-once`, ADR 40); the kit's storms are written once for every
 *   arm, so the ladder marks each such command in the copy it gives the agent and in the copy it holds the code to:
 *   `answeredAtOnce`, `markAnsweredAtOnce`.
 * - **Leakage voids an attempt.** An attempt whose transcript reads or lists a path of the kit is void, and run again
 *   once: `transcriptsOf`, `kitLeakage` (K4's scan, `k4-measures.mjs`, held to the paths given).
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { isDeepStrictEqual } from 'node:util';

import { readTranscript, scanLeakage, toolCalls } from './k4-measures.mjs';

// ---------------------------------------------------------------------------------------------------------------
// The API as data.

/** The kit's API fragments up to request `upto`, in the order of their requests: `{ n, file, text }`. */
export function apiFragments(kit, upto) {
  const dir = join(kit, 'api');
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .map(file => ({ file, n: Number(file.match(/^(\d+)-[a-z0-9-]+\.ya?ml$/)?.[1]) }))
    .filter(each => Number.isInteger(each.n) && each.n <= upto)
    .sort((a, b) => a.n - b.n)
    .map(({ file, n }) => ({ n, file, text: readFileSync(join(dir, file), 'utf8').trimEnd() }));
}

/** The lines of a brief that give the fragments; none when the kit has none. */
export function apiBrief(fragments, n) {
  if (!fragments.length) return [];
  const own = fragments.some(each => each.n === n);
  return [
    '',
    `**The API as data.** ${own ? "This request's API fragment and those of the requests before it" : 'The API fragments of the requests before this one (this request has none of its own)'}, in their order: the API the requests give, as the product's owner wrote it down. Each fragment says what its request adds to the API: resources as JSON Schema (draft-07), and the routes that answer them, by status. A later fragment changes what an earlier one said: \`schema\` defines a resource or replaces it whole, \`gains\` adds properties to it (required from that request on), \`states\` adds values to an enum, \`conditions\` says when a field is \`null\`, and \`all_routes\` what any route may answer besides its own. They are the specification of the answers, given to you as they are; they are not files of this project.`,
    ...fragments.flatMap(each => [
      '',
      `Request ${each.n}'s fragment (\`${each.file}\`):`,
      '',
      '```yaml',
      each.text,
      '```',
    ]),
  ];
}

// ---------------------------------------------------------------------------------------------------------------
// A storm, as a tree held to Lite reads it.

/**
 * Which contexts answer their commands at once, from what the tree says of its profiles (`yarn architecture profiles
 * --json`): those held to a profile that does not use the command bus (Lite, ADR 40), as `storm validate` decides it.
 * A context the tree does not declare yet is held to `defaultProfile` (the binding's `default_profile`), else to the
 * contract's default. Answers a predicate on a context's id; undefined when the answer cannot be read.
 */
export function answeredAtOnce(profiles, defaultProfile) {
  if (!Array.isArray(profiles?.profiles) || !Array.isArray(profiles?.contexts)) return undefined;
  const atOnce = new Set(
    profiles.profiles
      .filter(profile => profile.mechanisms?.['command-bus']?.stance === 'not-used')
      .map(profile => profile.id),
  );
  const held = new Map(profiles.contexts.map(each => [each.context, each.profile]));
  const fallback = defaultProfile ?? profiles.profiles.find(profile => profile.default)?.id;
  return context => atOnce.has(held.get(context) ?? fallback);
}

const commandsOf = storm =>
  (Array.isArray(storm?.contexts) ? storm.contexts : []).flatMap(context =>
    (Array.isArray(context?.commands) ? context.commands : []).map(command => ({ context: context.id, command })),
  );

/**
 * The storm with `answered: at-once` on each command of a context `atOnce` names, its text otherwise kept as written
 * (comments, order, folding): a line is added under each such command's `- name:`. `load` and `dump` are js-yaml's; the
 * result is read back and must be the storm with exactly those fields added, or the storm is dumped whole instead.
 * Answers the text and the commands marked (`Context.Command`).
 */
export function markAnsweredAtOnce(text, atOnce, { load, dump }) {
  const storm = load(text);
  const marked = commandsOf(storm)
    .filter(({ context, command }) => atOnce(context) && command?.answered !== 'at-once')
    .map(({ context, command }) => `${context}.${command.name}`);
  if (!marked.length) return { text, marked };
  const expected = load(text);
  for (const { context, command } of commandsOf(expected)) if (atOnce(context)) command.answered = 'at-once';

  const lines = text.split('\n');
  const out = [];
  let context;
  let contextIndent = -1;
  let commandsIndent = -1;
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index];
    const indent = line.match(/^ */)[0].length;
    const blank = !line.trim() || line.trim().startsWith('#');
    if (!blank) {
      if (indent <= contextIndent && !/^\s*- id:/.test(line)) {
        context = undefined;
        contextIndent = -1;
      }
      if (indent <= commandsIndent) commandsIndent = -1;
    }
    const id = line.match(/^(\s*)- id:\s*([A-Za-z0-9]+)\s*$/);
    if (id) {
      context = id[2];
      contextIndent = id[1].length;
      commandsIndent = -1;
    }
    if (context && /^\s*commands:\s*$/.test(line)) commandsIndent = indent;
    out.push(line);
    const item = commandsIndent >= 0 && indent > commandsIndent && line.match(/^(\s*)- name:\s*\S/);
    if (item && atOnce(context)) {
      const field = `${item[1]}  `;
      // The item's own lines, up to the next item or the end of the list: one that says `answered` already is left.
      let end = index + 1;
      while (end < lines.length && (!lines[end].trim() || lines[end].startsWith(`${field}`))) end++;
      if (!lines.slice(index + 1, end).some(each => each.startsWith(`${field}answered:`)))
        out.push(`${field}answered: at-once`);
    }
  }
  const written = out.join('\n');
  let same = false;
  try {
    same = isDeepStrictEqual(load(written), expected);
  } catch {
    same = false;
  }
  return { text: same ? written : dump(expected, { lineWidth: 120 }), marked };
}

// ---------------------------------------------------------------------------------------------------------------
// Leakage.

/** Claude Code's projects directory, where each conversation's transcript is written. */
export const claudeProjects = (env = process.env) =>
  join(env.CLAUDE_CONFIG_DIR ?? join(homedir(), '.claude'), 'projects');

/**
 * The transcripts of the conversations held in `cwd`, or in a directory whose path starts with it and a `-` (the
 * owners' worktrees of an attempt written in parallel), written to since `since` (ms). Claude Code keeps each in
 * `<projects>/<cwd, every character but a letter or a digit written as a dash>/<session>.jsonl`.
 */
export function transcriptsOf(cwd, since, projects = claudeProjects()) {
  if (!existsSync(projects)) return [];
  const slug = resolve(cwd).replace(/[^A-Za-z0-9]/g, '-');
  return readdirSync(projects)
    .filter(name => name === slug || name.startsWith(`${slug}-`))
    .flatMap(name =>
      readdirSync(join(projects, name))
        .filter(file => file.endsWith('.jsonl'))
        .map(file => join(projects, name, file)),
    )
    .filter(file => statSync(file).mtimeMs >= since)
    .sort();
}

/** The shapes a kit's files take wherever a kit is, beyond the plan's own paths: each voids an attempt that names it. */
export const RELATIVE_LEAKS = [
  { name: '*.acceptance.ts', pattern: /\.acceptance\.ts\b/ },
  { name: 'docs/evaluations', pattern: /docs\/evaluations\// },
  { name: 'a grade directory', pattern: /(?:\.flow\/|(?:\.\.\/)+)grade(?![\w.-])/ },
];

/**
 * Whether the transcripts read or list a path of `paths` (the kit, the grader's worktrees), or any file shaped like a
 * kit's (RELATIVE_LEAKS): a tool call whose input names one, as K4's scan finds it. A result that only mentions one
 * voids nothing (`seen`). K4's package patterns (`.k3/package`, Claude Code's own transcripts) are not this scan's.
 * `allowed`: paths of the kit the agent was given as they are (the current request's own file), which a call may name
 * without leaking anything — an agent that lost its request to a compaction and searched the disk for it read what it
 * had been given (lite-3, 18 November, twice at request 30); a call that names anything else of the kit beside it still
 * voids (the maintainer, 18 November).
 */
export function kitLeakage(files, paths, { allowed = [] } = {}) {
  const given = allowed.filter(Boolean);
  // The call's input with the given paths taken out, so that only what else it names is scanned.
  const scrubbed = input => {
    if (!given.length || input === undefined) return input;
    let text = JSON.stringify(input);
    for (const path of given) text = text.split(path).join('<the request>');
    return JSON.parse(text);
  };
  // Each path is its own pattern, named by the path (leakPatterns), and so are the shapes a kit's files take wherever
  // they are (RELATIVE_LEAKS): a hidden test's name, the reference's evaluations, the grader's worktrees named
  // relatively from an attempt's worktree, which a literal path would miss (J6 readiness, 16 November). A call counts
  // once: by the plan's path when it names one, else by the first shape it matches.
  const planNames = new Set(paths.filter(Boolean));
  const names = new Set([...planNames, ...RELATIVE_LEAKS.map(each => each.name)]);
  const found = files.map(file => {
    const calls = toolCalls(readTranscript(readFileSync(file, 'utf8'))).calls.map(call => ({
      ...call,
      input: scrubbed(call.input),
    }));
    const scanned = scanLeakage(calls, [...planNames]);
    const byCall = new Map();
    const hits = [
      ...scanned.touched.filter(each => names.has(each.matched)),
      ...calls.flatMap((call, index) =>
        RELATIVE_LEAKS.filter(each => each.pattern.test(JSON.stringify(call.input ?? {}))).map(each => ({
          call: index,
          tool: call.name,
          matched: each.name,
          input: JSON.stringify(call.input ?? {}).slice(0, 300),
        })),
      ),
    ];
    for (const hit of hits) {
      const kept = byCall.get(hit.call);
      if (!kept || (planNames.has(hit.matched) && !planNames.has(kept.matched))) byCall.set(hit.call, hit);
    }
    return {
      file,
      touched: [...byCall.values()].sort((a, b) => a.call - b.call),
      seen: scanned.seen.filter(each => names.has(each.matched)),
    };
  });
  const touched = found.flatMap(each => each.touched.map(hit => ({ transcript: each.file, ...hit })));
  return {
    void: touched.length > 0,
    touched,
    seen: found.flatMap(each => each.seen.map(hit => ({ transcript: each.file, ...hit }))),
  };
}
