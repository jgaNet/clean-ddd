#!/usr/bin/env node
/**
 * K4's transcript measures (docs/evaluations/knowledge/k4-pilot/README.md, "Measures"), with K1's method (RFC 0006,
 * §9b): from one Claude Code session file, each tool call classed, the bytes its result brought in, the files read
 * before the first edit and the files read that the run did not need; and the leakage scan that voids a run.
 *
 *   node .claude/flow/k4-measures.mjs --transcript <session.jsonl> --root <the agent's tree>
 *        [--tracked <file of paths, one a line>] [--ground-truth <ground-truth.yaml>] [--changed <file of paths>]
 *        [--leak <path>]... [--json]
 *
 * - **Classes.** `explore`: Read, Grep, Glob; a Bash command whose verbs read or list (`cat`, `sed -n`, `head`, `tail`,
 *   `less`, `grep`, `rg`, `find`, `ls`, `tree`, `wc`, `git log/show/diff/grep/blame`, `yarn architecture …`,
 *   `npx clean-ddd …`, `clean-ddd knowledge …`). `edit`: Edit, Write; a Bash command that writes into the tree (a
 *   redirection into it, `sed -i`, `tee`, `git apply`, `patch`, `mv`, `cp`, `rm` of a path in it, or a script that
 *   opens a file for writing). `verify`: the tests, the linter, the type checker, the formatter, the conventions
 *   check, the gate. `other`: the rest (a commit, `mkdir`, `echo`, a server started, Skill). A Bash call whose commands
 *   fall in several classes takes the first of edit, verify, explore. `Skill` and `clean-ddd knowledge` are also
 *   counted on their own.
 * - **Bytes.** The size of each call's result (text; anything else as its JSON), summed per class, with each class's
 *   share of all the results.
 * - **Files read.** Distinct tracked files: a Read's `file_path`, and a tracked path an explore command prints (`cat`,
 *   `head`, `tail`, `less`, `more`, `nl`, `sed` without `-i`, `awk`, `git show <ref>:<path>`), its globs expanded
 *   against the tracked files; a search (`grep`, `rg`, `find`, `ls`, Grep, Glob) reads none. Before the first edit,
 *   and in the whole run; `unnecessary` is the whole run's, less what the run's diff changes and what the task's
 *   ground truth names.
 * - **Leakage.** A tool call whose input names a path under `docs/evaluations/`, a file `*.acceptance.ts`, the K3
 *   package's source (`.k3/package`), Claude Code's own transcripts (`.claude/projects`), or any `--leak` path (the
 *   OpenStay repository, the J5b directory, the kits, the grading trees, the records) voids the run. A result that
 *   mentions one is listed apart (`seen`) for the operator, and voids nothing: a listing is not a read.
 */
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { isAbsolute, normalize, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const CLASSES = ['explore', 'edit', 'verify', 'other'];
const PRECEDENCE = ['edit', 'verify', 'explore', 'other'];

/** The session file's lines, parsed; a line that is not JSON is skipped. */
export function readTranscript(text) {
  return String(text)
    .split('\n')
    .filter(Boolean)
    .flatMap(line => {
      try {
        return [JSON.parse(line)];
      } catch {
        return [];
      }
    });
}

const resultBytes = content => {
  if (content === undefined || content === null) return 0;
  if (typeof content === 'string') return Buffer.byteLength(content);
  if (Array.isArray(content))
    return content.reduce(
      (sum, part) =>
        sum +
        (part?.type === 'text' ? Buffer.byteLength(String(part.text ?? '')) : Buffer.byteLength(JSON.stringify(part))),
      0,
    );
  return Buffer.byteLength(JSON.stringify(content));
};
const resultText = content =>
  typeof content === 'string'
    ? content
    : Array.isArray(content)
      ? content.map(part => (part?.type === 'text' ? String(part.text ?? '') : '')).join('\n')
      : '';

/**
 * The tool calls of the main conversation, in order, each with its result: `{ id, name, input, bytes, result,
 * isError }`; and the last text the agent wrote. Lines of a sidechain (a subagent) are left out.
 */
export function toolCalls(lines) {
  const calls = [];
  const byId = new Map();
  let finalText;
  for (const line of lines) {
    if (line.isSidechain) continue;
    const content = line.message?.content;
    if (!Array.isArray(content)) continue;
    if (line.type === 'assistant') {
      for (const block of content) {
        if (block.type === 'tool_use' && !byId.has(block.id)) {
          const call = { id: block.id, name: block.name, input: block.input ?? {}, bytes: 0, result: '' };
          byId.set(block.id, call);
          calls.push(call);
        } else if (block.type === 'text' && block.text?.trim()) finalText = block.text;
      }
    } else if (line.type === 'user') {
      for (const block of content) {
        if (block.type !== 'tool_result') continue;
        const call = byId.get(block.tool_use_id);
        if (!call) continue;
        call.bytes += resultBytes(block.content);
        call.result += resultText(block.content);
        if (block.is_error) call.isError = true;
      }
    }
  }
  return { calls, finalText };
}

// ---------------------------------------------------------------------------------------------------------------
// A small shell reader: enough of bash to find the commands of a call, their words and their redirections.

/** The command without its here-documents' bodies (they hold code, not commands). */
export function stripHeredocs(command) {
  const lines = String(command).split('\n');
  const out = [];
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index];
    out.push(line);
    const delimiters = [...line.matchAll(/<<-?\s*(['"]?)([A-Za-z_][\w-]*)\1/g)].map(match => match[2]);
    for (const delimiter of delimiters) {
      index++;
      while (index < lines.length && lines[index].trim() !== delimiter) index++;
    }
  }
  return out.join('\n');
}

/**
 * The commands of a shell line: a list of `{ words, redirections }`, one per simple command, across `;`, `&&`, `||`,
 * `|`, `&` and new lines; a subshell's or a `$( … )`'s commands are read as commands too.
 */
export function parseShell(command) {
  const text = stripHeredocs(command);
  const commands = [];
  let words = [];
  let redirections = [];
  let word = '';
  let inWord = false;
  let pendingRedirect;
  const endWord = () => {
    if (!inWord) return;
    if (pendingRedirect) {
      redirections.push({ op: pendingRedirect, target: word });
      pendingRedirect = undefined;
    } else words.push(word);
    word = '';
    inWord = false;
  };
  const endCommand = () => {
    endWord();
    if (words.length || redirections.length) commands.push({ words, redirections });
    words = [];
    redirections = [];
  };
  for (let index = 0; index < text.length; index++) {
    const char = text[index];
    const next = text[index + 1];
    if (char === '\\' && index + 1 < text.length) {
      if (next !== '\n') {
        word += next;
        inWord = true;
      }
      index++;
    } else if (char === "'") {
      const end = text.indexOf("'", index + 1);
      word += text.slice(index + 1, end === -1 ? undefined : end);
      inWord = true;
      index = end === -1 ? text.length : end;
    } else if (char === '"') {
      let end = index + 1;
      while (end < text.length && text[end] !== '"') end += text[end] === '\\' ? 2 : 1;
      word += text.slice(index + 1, end);
      inWord = true;
      index = end;
    } else if (char === '$' && next === '(') {
      // A command substitution: its commands are commands of the call; the word keeps a placeholder.
      let depth = 1;
      let end = index + 2;
      while (end < text.length && depth > 0) {
        if (text[end] === '(') depth++;
        else if (text[end] === ')') depth--;
        end++;
      }
      commands.push(...parseShell(text.slice(index + 2, end - 1)));
      word += '$()';
      inWord = true;
      index = end - 1;
    } else if (char === '#' && !inWord) {
      while (index < text.length && text[index] !== '\n') index++;
      endCommand();
    } else if (/\s/.test(char)) {
      endWord();
      if (char === '\n') endCommand();
    } else if (char === ';' || char === '(' || char === ')' || char === '{' || char === '}') {
      if ((char === '{' || char === '}') && inWord) {
        word += char;
        continue;
      }
      endCommand();
    } else if (char === '|' || char === '&') {
      if (char === '&' && next === '>') {
        endWord();
        pendingRedirect = next === '>' && text[index + 2] === '>' ? '&>>' : '&>';
        index += pendingRedirect.length - 1;
      } else if (char === '&' && word.endsWith('>')) {
        // `2>&1`: a descriptor duplicated, not a file.
        word += char;
      } else {
        if (next === char) index++;
        endCommand();
      }
    } else if (char === '>' || char === '<') {
      const fd = /^\d+$/.test(word) ? word : '';
      if (fd) {
        word = '';
        inWord = false;
      } else endWord();
      let op = char;
      if (next === char) {
        op += char;
        index++;
      }
      if (text[index + 1] === '&') {
        // `>&2`, `2>&1`: descriptors.
        index++;
        while (/\d|-/.test(text[index + 1] ?? '')) index++;
        continue;
      }
      if (char === '<' && text[index + 1] === '<') {
        index++;
        continue;
      }
      pendingRedirect = `${fd}${op}`;
    } else {
      word += char;
      inWord = true;
    }
  }
  endCommand();
  return commands;
}

const NEUTRAL = new Set([
  'cd',
  'echo',
  'printf',
  'true',
  'false',
  'export',
  'set',
  'unset',
  'sleep',
  'pwd',
  ':',
  'wait',
  'test',
  '[',
  '[[',
  'source',
  '.',
  'then',
  'else',
  'fi',
  'do',
  'done',
  'if',
  'for',
  'while',
  'in',
  'which',
  'type',
  'command',
  'date',
]);
const EXPLORE_VERBS = new Set([
  'cat',
  'head',
  'tail',
  'less',
  'more',
  'nl',
  'grep',
  'egrep',
  'fgrep',
  'rg',
  'ag',
  'find',
  'fd',
  'ls',
  'tree',
  'wc',
  'awk',
  'sed',
  'stat',
  'file',
  'du',
  'jq',
  'diff',
  'sort',
  'uniq',
  'cut',
  'tr',
  'column',
  'realpath',
  'basename',
  'dirname',
  'readlink',
  'xxd',
  'od',
  'strings',
  'bat',
]);
const PRINTS_A_FILE = new Set(['cat', 'head', 'tail', 'less', 'more', 'nl', 'sed', 'awk', 'bat']);
const GIT_EXPLORE = new Set([
  'log',
  'show',
  'diff',
  'grep',
  'blame',
  'status',
  'ls-files',
  'ls-tree',
  'rev-parse',
  'branch',
  'cat-file',
]);
const VERIFY_SCRIPTS =
  /^(test|test:.*|lint|lint:.*|typecheck|format|format:check|check:conventions|verify|jest|tsc|eslint|prettier)$/;
const VERIFY_TOOLS = new Set(['jest', 'tsc', 'eslint', 'prettier', 'vitest']);
const WRITES =
  /\b(writeFileSync|appendFileSync|writeFile|appendFile|createWriteStream|open\([^)]*['"][wa]\+?['"]|write_text|renameSync|unlinkSync|rmSync|copyFileSync)\b/;

const basename = word => word.split('/').pop();
/** The words after leading assignments and wrappers (`FOO=1 timeout 60 npx …`). */
function effective(words) {
  let rest = words;
  for (;;) {
    if (!rest.length) return rest;
    const first = rest[0];
    if (/^[A-Za-z_][A-Za-z0-9_]*=/.test(first)) rest = rest.slice(1);
    else if (['sudo', 'time', 'nice', 'nohup', 'env', 'exec'].includes(first)) rest = rest.slice(1);
    else if (first === 'timeout') {
      rest = rest.slice(1);
      while (rest.length && rest[0].startsWith('-')) rest = rest.slice(1);
      rest = rest.slice(1); // the duration
    } else if (first === 'xargs') {
      rest = rest.slice(1);
      while (rest.length && rest[0].startsWith('-'))
        rest = rest[1] && /^-[nIPL]$/.test(rest[0]) ? rest.slice(2) : rest.slice(1);
    } else return rest;
  }
}

/** Inside the tree: a relative path, or an absolute one under the root. */
const inTree = (path, root) => {
  if (!path || path.startsWith('-') || path.startsWith('$')) return false;
  if (!isAbsolute(path)) return !path.startsWith('~');
  const rel = relative(root, path);
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel));
};

/** One simple command's class, and what it is: `{ class, verb, knowledge?, skill? }`. */
export function classifyCommand({ words: allWords, redirections }, root = '/') {
  const words = effective(allWords);
  const intoTree = redirections.some(
    each => /^(\d?>>?|&>>?)$/.test(each.op) && inTree(each.target, root) && each.target !== '/dev/null',
  );
  if (!words.length) return { class: intoTree ? 'edit' : 'neutral', verb: '' };
  const verb = basename(words[0]);
  const args = words.slice(1);
  const result = cls => ({ class: intoTree ? 'edit' : cls, verb });
  if (NEUTRAL.has(verb)) return { class: intoTree ? 'edit' : 'neutral', verb };
  if (verb === 'sed')
    return args.some(arg => /^-[a-zA-Z]*i/.test(arg) || arg.startsWith('--in-place'))
      ? { class: 'edit', verb }
      : result('explore');
  if (verb === 'perl') return args.some(arg => /^-[a-zA-Z]*i/.test(arg)) ? { class: 'edit', verb } : result('other');
  if (verb === 'tee')
    return args.some(arg => !arg.startsWith('-') && inTree(arg, root) && !arg.startsWith('/dev/'))
      ? { class: 'edit', verb }
      : result('other');
  if (['mv', 'cp', 'rm', 'patch'].includes(verb))
    return verb === 'patch' || args.some(arg => !arg.startsWith('-') && inTree(arg, root))
      ? { class: 'edit', verb }
      : result('other');
  if (verb === 'git') {
    let rest = args;
    while (rest.length && rest[0].startsWith('-'))
      rest = ['-C', '-c'].includes(rest[0]) ? rest.slice(2) : rest.slice(1);
    const sub = rest[0] ?? '';
    if (sub === 'apply') return { class: 'edit', verb: 'git apply' };
    if (GIT_EXPLORE.has(sub)) return result('explore');
    return result('other');
  }
  if (['yarn', 'npm', 'pnpm'].includes(verb)) {
    let rest = args.filter(arg => !arg.startsWith('-'));
    if (rest[0] === 'run') rest = rest.slice(1);
    const script = rest[0] ?? '';
    if (script === 'architecture' || script === 'clean-ddd') {
      const sub = rest[1] ?? '';
      return result(['gate', 'check'].includes(sub) ? 'verify' : 'explore');
    }
    if (VERIFY_SCRIPTS.test(script)) return result('verify');
    return result('other');
  }
  if (verb === 'npx' || verb === 'clean-ddd') {
    const rest = (verb === 'npx' ? args : words).filter(arg => !arg.startsWith('-'));
    const tool = basename(rest[0] ?? '');
    if (tool === 'clean-ddd') {
      const sub = rest[1] ?? '';
      if (['gate', 'check'].includes(sub)) return result('verify');
      return { ...result('explore'), ...(sub === 'knowledge' && { knowledge: true }) };
    }
    if (VERIFY_TOOLS.has(tool)) return result('verify');
    return result('other');
  }
  if (VERIFY_TOOLS.has(verb)) return result('verify');
  if (verb === 'node' || verb === 'tsx' || /^python3?$/.test(verb)) {
    const script = args.join(' ');
    if (/\b(jest|tsc|eslint|prettier)\b/.test(args[0] ?? '') || /--test\b/.test(script)) return result('verify');
    if (WRITES.test(script)) return { class: 'edit', verb };
    return result('other');
  }
  if (EXPLORE_VERBS.has(verb)) return result('explore');
  return result('other');
}

/** A Bash call's class: the first of edit, verify, explore that one of its commands has; `other` otherwise. */
export function classifyBash(command, root = '/') {
  const commands = parseShell(command).map(each => classifyCommand(each, root));
  const classes = new Set(commands.map(each => each.class));
  const cls = PRECEDENCE.find(each => classes.has(each)) ?? 'other';
  return { class: cls, knowledge: commands.some(each => each.knowledge) };
}

/** A tool call's class, and whether it is a knowledge query or a skill. */
export function classifyCall(call, root = '/') {
  switch (call.name) {
    case 'Read':
    case 'Grep':
    case 'Glob':
    case 'LS':
      return { class: 'explore' };
    case 'Edit':
    case 'Write':
    case 'MultiEdit':
    case 'NotebookEdit':
      return { class: 'edit' };
    case 'Bash':
      return classifyBash(call.input?.command ?? '', root);
    case 'Skill':
      return { class: 'other', skill: true };
    default:
      return { class: 'other' };
  }
}

// ---------------------------------------------------------------------------------------------------------------
// Files read.

const globToRegExp = glob =>
  new RegExp(
    `^${glob
      .split('')
      .map((char, index, all) => {
        if (char === '*') return all[index + 1] === '*' ? '' : all[index - 1] === '*' ? '.*' : '[^/]*';
        if (char === '?') return '[^/]';
        return /[\\^$+.()|[\]{}]/.test(char) ? `\\${char}` : char;
      })
      .join('')}$`,
  );

/** A path as the tree names it (relative to its root), or undefined when it is outside the tree. */
export function treePath(path, root, cwd = '') {
  if (!path) return undefined;
  const absolute = isAbsolute(path) ? normalize(path) : resolve(root, cwd, path);
  const rel = relative(root, absolute);
  if (rel === '' || rel.startsWith('..') || isAbsolute(rel)) return undefined;
  return rel.split('\\').join('/');
}

/** The tracked files a word names: itself, or what its glob matches. */
function matchTracked(word, root, cwd, tracked) {
  if (!word || word.startsWith('-')) return [];
  const rel = treePath(word, root, cwd);
  if (!rel) return [];
  if (/[*?]/.test(rel)) {
    const pattern = globToRegExp(rel);
    return [...tracked].filter(each => pattern.test(each));
  }
  return tracked.has(rel) ? [rel] : [];
}

/** The tracked files a Bash call prints (not those it searches), following its `cd`s. */
export function filesPrinted(command, root, tracked) {
  const files = new Set();
  let cwd = '';
  for (const parsed of parseShell(command)) {
    const words = effective(parsed.words);
    if (!words.length) continue;
    const verb = basename(words[0]);
    const args = words.slice(1);
    if (verb === 'cd') {
      const target = args[0];
      if (target && !target.startsWith('-')) {
        const rel = treePath(target, root, cwd);
        cwd = rel ?? cwd;
      }
      continue;
    }
    if (verb === 'git') {
      const index = args.indexOf('show');
      if (index >= 0)
        for (const arg of args.slice(index + 1)) {
          const path = arg.includes(':') ? arg.slice(arg.indexOf(':') + 1) : undefined;
          for (const file of matchTracked(path, root, '', tracked)) files.add(file);
        }
      continue;
    }
    if (!PRINTS_A_FILE.has(verb)) continue;
    if (verb === 'sed' && args.some(arg => /^-[a-zA-Z]*i/.test(arg))) continue;
    // The operands: past the options (and an option's value), past a sed or awk script.
    const operands = [];
    let scriptTaken = !['sed', 'awk'].includes(verb);
    for (let index = 0; index < args.length; index++) {
      const arg = args[index];
      if (arg.startsWith('-') && arg !== '-') {
        if (
          ['-n', '-c', '-e', '-f', '-F', '-v', '--lines', '--bytes'].includes(arg) &&
          !(verb === 'sed' && arg === '-n')
        ) {
          if (arg === '-e' || arg === '-f') scriptTaken = true;
          index++;
        }
        continue;
      }
      if (!scriptTaken) {
        scriptTaken = true;
        continue;
      }
      operands.push(arg);
    }
    for (const operand of operands) for (const file of matchTracked(operand, root, cwd, tracked)) files.add(file);
  }
  return [...files];
}

/** The tracked files one call reads: a Read's path, or what an explore Bash call prints. */
export function filesRead(call, root, tracked) {
  if (call.name === 'Read') return matchTracked(call.input?.file_path, root, '', tracked);
  if (call.name === 'Bash') return filesPrinted(call.input?.command ?? '', root, tracked);
  return [];
}

// ---------------------------------------------------------------------------------------------------------------
// The ground truth's paths, and leakage.

/** Every path a task's ground truth names: its reference changes, `lives_in`, `start_reads`, `half_done`, `expected`. */
export function groundTruthPaths(groundTruth = {}) {
  const paths = new Set();
  const add = list => (Array.isArray(list) ? list : []).forEach(each => typeof each === 'string' && paths.add(each));
  const changes = groundTruth.reference_solution?.changes ?? {};
  add(changes.source);
  add(changes.tests);
  add(groundTruth.rule?.lives_in);
  add(groundTruth.lives_in);
  add(groundTruth.start_reads);
  add(groundTruth.half_done);
  for (const kind of ['files', 'tests']) {
    add(groundTruth.expected?.[kind]?.required);
    add(groundTruth.expected?.[kind]?.tolerated);
  }
  return paths;
}

/**
 * A ground truth, loaded with `load` (js-yaml's): a line js-yaml refuses because a plain scalar's continuation holds
 * `: ` (task 5's `born`, "0.2.0, predates: nothing", as registered) is read with that `: ` written ` — `, in memory
 * only, and said in `repaired`; the registered file is never changed.
 */
export function loadGroundTruth(text, load) {
  const lines = String(text).split('\n');
  const repaired = [];
  for (let attempt = 0; attempt < 20; attempt++) {
    try {
      return { groundTruth: load(lines.join('\n')), repaired };
    } catch (error) {
      const line = error?.mark?.line;
      if (line === undefined || !/^\s+\S/.test(lines[line] ?? '') || !/\S: /.test(lines[line].trim())) throw error;
      repaired.push({ line: line + 1, was: lines[line].trim() });
      lines[line] = lines[line].replace(/(\S): /g, '$1 — ');
    }
  }
  throw new Error('the ground truth could not be read');
}

const escape = text => text.replace(/[\\^$.*+?()[\]{}|]/g, '\\$&');
/** The patterns a run's tool inputs must not name (README, "Leakage"), with the paths given. */
export function leakPatterns(paths = []) {
  return [
    { name: 'docs/evaluations', pattern: /docs\/evaluations\// },
    { name: '*.acceptance.ts', pattern: /[\w.-]\.acceptance\.ts\b/ },
    { name: 'the K3 package', pattern: /\.k3\/package\b/ },
    { name: 'transcripts', pattern: /\.claude\/projects\b/ },
    ...paths
      .filter(Boolean)
      .map(path => ({ name: path, pattern: new RegExp(`${escape(path.replace(/\/+$/, ''))}(?![\\w.-])`) })),
  ];
}

/** The calls whose input names a forbidden path (`touched`, the run is void) and whose result does (`seen`). */
export function scanLeakage(calls, paths = []) {
  const patterns = leakPatterns(paths);
  const touched = [];
  const seen = [];
  calls.forEach((call, index) => {
    const input = JSON.stringify(call.input ?? {});
    for (const { name, pattern } of patterns) {
      if (pattern.test(input))
        touched.push({ call: index, tool: call.name, matched: name, input: input.slice(0, 300) });
      else if (pattern.test(call.result ?? '')) seen.push({ call: index, tool: call.name, matched: name });
    }
  });
  return { void: touched.length > 0, touched, seen };
}

// ---------------------------------------------------------------------------------------------------------------

const share = (part, whole) => (whole > 0 ? Number((part / whole).toFixed(4)) : 0);

/**
 * The measures of one transcript. `root` is the agent's tree as the transcript names it; `tracked` the files git
 * tracks there at the start; `changed` the files the run's diff changes; `groundTruth` the task's.
 */
export function measure({ lines, root, tracked = [], changed = [], groundTruth, leakPaths = [] }) {
  const trackedSet = tracked instanceof Set ? tracked : new Set(tracked);
  const { calls, finalText } = toolCalls(lines);
  const classified = calls.map(call => ({ ...call, ...classifyCall(call, root) }));
  const firstEdit = classified.findIndex(call => call.class === 'edit');
  const totalBytes = classified.reduce((sum, call) => sum + call.bytes, 0);
  const classes = Object.fromEntries(
    CLASSES.map(cls => {
      const of = classified.filter(call => call.class === cls);
      const bytes = of.reduce((sum, call) => sum + call.bytes, 0);
      return [
        cls,
        {
          calls: of.length,
          callShare: share(of.length, classified.length),
          bytes,
          byteShare: share(bytes, totalBytes),
        },
      ];
    }),
  );
  const readAt = classified.map(call => filesRead(call, root, trackedSet));
  const before = new Set(readAt.slice(0, firstEdit === -1 ? undefined : firstEdit).flat());
  const all = new Set(readAt.flat());
  const needed = new Set([...changed, ...groundTruthPaths(groundTruth)]);
  const unnecessary = [...all].filter(file => !needed.has(file)).sort();
  const knowledge = classified.filter(call => call.knowledge);
  const skills = classified.filter(call => call.skill);
  return {
    calls: classified.length,
    classes,
    resultBytes: totalBytes,
    firstEdit: firstEdit === -1 ? null : firstEdit,
    exploreCallsBeforeFirstEdit: classified
      .slice(0, firstEdit === -1 ? undefined : firstEdit)
      .filter(call => call.class === 'explore').length,
    filesReadBeforeFirstEdit: before.size,
    filesRead: all.size,
    unnecessaryFilesRead: unnecessary.length,
    unnecessary,
    knowledge: {
      calls: knowledge.length,
      bytes: knowledge.reduce((sum, call) => sum + call.bytes, 0),
      beforeFirstEdit: knowledge.some((call, index) => firstEdit === -1 || classified.indexOf(call) < firstEdit),
    },
    skill: {
      calls: skills.length,
      bytes: skills.reduce((sum, call) => sum + call.bytes, 0),
      names: skills.map(call => call.input?.skill ?? call.input?.command ?? call.input?.name),
    },
    leakage: scanLeakage(calls, leakPaths),
    finalText,
  };
}

/** The measures from a session file on disk. */
export function measureFile(file, options) {
  return measure({ ...options, lines: readTranscript(readFileSync(file, 'utf8')) });
}

// The command line.
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const args = process.argv.slice(2);
  const option = name => (args.includes(`--${name}`) ? args[args.indexOf(`--${name}`) + 1] : undefined);
  const options = name => args.flatMap((arg, index) => (arg === `--${name}` ? [args[index + 1]] : []));
  const transcript = option('transcript');
  const root = option('root');
  if (!transcript || !root) {
    process.stderr.write(
      'usage: k4-measures.mjs --transcript <session.jsonl> --root <tree> [--tracked <file>] [--ground-truth <yaml>] [--changed <file>] [--leak <path>]... [--json]\n',
    );
    process.exit(2);
  }
  const listFile = file => (file ? readFileSync(file, 'utf8').split('\n').filter(Boolean) : []);
  const yaml = createRequire(fileURLToPath(new URL('../../package.json', import.meta.url)))('js-yaml');
  const groundTruth = option('ground-truth')
    ? loadGroundTruth(readFileSync(option('ground-truth'), 'utf8'), yaml.load).groundTruth
    : undefined;
  const result = measureFile(transcript, {
    root: resolve(root),
    tracked: listFile(option('tracked')),
    changed: listFile(option('changed')),
    groundTruth,
    leakPaths: options('leak'),
  });
  if (args.includes('--json')) process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  else {
    const { classes } = result;
    process.stdout.write(
      `${result.calls} calls; ${CLASSES.map(cls => `${cls} ${classes[cls].calls} (${Math.round(classes[cls].byteShare * 100)}% of ${result.resultBytes} B)`).join(', ')}\n` +
        `first edit at call ${result.firstEdit ?? 'none'}; files read before it ${result.filesReadBeforeFirstEdit}; in all ${result.filesRead}, unnecessary ${result.unnecessaryFilesRead}\n` +
        `clean-ddd knowledge: ${result.knowledge.calls} calls, ${result.knowledge.bytes} B${result.knowledge.calls ? `, before the first edit: ${result.knowledge.beforeFirstEdit}` : ''}; skills: ${result.skill.calls}\n` +
        `leakage: ${result.leakage.void ? `VOID (${result.leakage.touched.map(each => each.matched).join(', ')})` : 'none'}${result.leakage.seen.length ? `; seen in results: ${result.leakage.seen.length}` : ''}\n`,
    );
  }
}
