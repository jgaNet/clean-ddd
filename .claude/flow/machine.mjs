/**
 * What a ladder asks of the machine before it runs, so that a comparison between arms is not a comparison between
 * machines (J5: the trees declared Node 24 and ran on Node 22, where one tree's own test cannot load an ES module;
 * four ladders at once ran the machine out of memory, and the kernel killed agents and gradings).
 *
 * - The Node the trees declare: a ladder refuses to start on a Node older than the project's `engines.node`, and
 *   every command it runs (the agent's checks, the gate, the grader) finds that same Node first on its PATH.
 * - A slot: at most `ladders` ladders run at once on the machine; another waits for a slot to free.
 */
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

/** The lowest major version `engines.node` admits (`>=24`, `^24.9`, `24.x`), or undefined if it names none. */
export function minimumNodeMajor(range) {
  const majors = String(range ?? '')
    .split('||')
    .map(part => Number(part.match(/(\d+)/)?.[1]))
    .filter(Number.isFinite);
  return majors.length ? Math.min(...majors) : undefined;
}

/** Why this Node cannot run the project, or undefined when it can. */
export function nodeMismatch(projectDir, version = process.versions.node) {
  let range;
  try {
    range = JSON.parse(readFileSync(join(projectDir, 'package.json'), 'utf8')).engines?.node;
  } catch {
    return undefined;
  }
  const minimum = minimumNodeMajor(range);
  const major = Number(version.split('.')[0]);
  if (minimum === undefined || major >= minimum) return undefined;
  return (
    `the project declares node ${range} and this ladder runs on node ${version}: start it with a node of at least ` +
    `${minimum} first on the PATH (the trees' own tests may need it: J5 found one that cannot load an ES module on 22)`
  );
}

/** The environment's PATH with this process's Node first, so every child runs the Node the ladder checked. */
export const pathWithThisNode = (path = process.env.PATH ?? '') => `${dirname(process.execPath)}:${path}`;

const alive = pid => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};

/**
 * Takes one of `max` slots in `dir` (a directory per slot, made atomically, holding the owner's pid); a slot whose
 * owner is gone, or is this very process (a pid reused after a restart), is taken over. Waits, polling every `pollMs`, while every slot is held, and calls `onWait` once.
 * Returns the function that frees the slot; the slot is also freed when the process exits.
 */
/** The slots this process took: one that names this pid and is not among them was left before a restart. */
const held = new Set();

export async function takeSlot({
  max,
  dir = join(tmpdir(), 'clean-ddd-ladder-slots'),
  pollMs = 60_000,
  onWait = () => {},
}) {
  mkdirSync(dir, { recursive: true });
  let waited = false;
  for (;;) {
    for (let index = 0; index < max; index++) {
      const slot = join(dir, `slot-${index}`);
      try {
        mkdirSync(slot);
      } catch {
        let owner;
        try {
          owner = Number(readFileSync(join(slot, 'pid'), 'utf8')) || NaN; // an empty file is no owner, not pid 0
        } catch {
          owner = NaN; // being written, or left half-made by a crash
        }
        // A slot that names this process was left by a ladder killed with its machine: after a restart, the resumed
        // ladder can get the same pid, and would wait for itself (J5b, 13 November: two hours).
        if (Number.isFinite(owner) && (owner === process.pid ? held.has(slot) : alive(owner))) continue;
        // Just made by another ladder, which writes its pid next; left empty for a minute, it was a crash.
        if (!Number.isFinite(owner) && readdirSync(slot).length === 0 && Date.now() - statSync(slot).mtimeMs < 60_000)
          continue;
        rmSync(slot, { recursive: true, force: true });
        continue;
      }
      writeFileSync(join(slot, 'pid'), String(process.pid));
      held.add(slot);
      const free = () => {
        held.delete(slot);
        rmSync(slot, { recursive: true, force: true });
      };
      process.once('exit', free);
      return free;
    }
    if (!waited) onWait();
    waited = true;
    await new Promise(done => setTimeout(done, pollMs));
  }
}

/** The bytes a file or a directory holds, everything under it included; 0 for what is not there. */
export function sizeOf(path) {
  let stat;
  try {
    stat = statSync(path);
  } catch {
    return 0;
  }
  if (!stat.isDirectory()) return stat.size;
  return readdirSync(path).reduce((total, name) => total + sizeOf(join(path, name)), 0);
}

/**
 * Jest's cache in a ladder's own temporary directory (`jest_*`, where jest puts it under TMPDIR), removed whole once it
 * holds more than `capBytes`: J5b's shared cache reached 11 GB and took the disk to 1.4 GB free. The ladder calls it
 * between two features, when none of its own processes reads the cache, and no other ladder shares the directory.
 * Answers `{ bytes, removed }`.
 */
export function boundCache(dir, capBytes) {
  let names = [];
  try {
    names = readdirSync(dir).filter(name => name.startsWith('jest_'));
  } catch {
    return { bytes: 0, removed: false };
  }
  const bytes = names.reduce((total, name) => total + sizeOf(join(dir, name)), 0);
  if (bytes <= capBytes) return { bytes, removed: false };
  for (const name of names) rmSync(join(dir, name), { recursive: true, force: true });
  return { bytes, removed: true };
}

/**
 * The ladders this machine started, for `resume.mjs` to bring back after a restart: one entry per run, its project,
 * its plan and its log. `FLOW_REGISTRY` names the file; by default it is in the home directory, which a restart keeps.
 */
export const registryFile = () => process.env.FLOW_REGISTRY ?? join(homedir(), '.clean-ddd-flow', 'ladders.json');

export function readRegistry(file = registryFile()) {
  try {
    const entries = JSON.parse(readFileSync(file, 'utf8'));
    return Array.isArray(entries) ? entries : [];
  } catch {
    return [];
  }
}

/** Adds or replaces a run's entry (a run is one project and one plan's `run`). */
export function register(entry, file = registryFile()) {
  const entries = readRegistry(file).filter(each => !(each.project === entry.project && each.run === entry.run));
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify([...entries, entry], null, 2)}\n`);
}

/**
 * Which registered runs to bring back: not running now, not held (`<project>.flow/hold`), and not finished for good. A
 * run whose log ends with `finished` is over unless its state is CANCELLED (a stop asked for, or a machine that went
 * away mid-run leaves no `finished` at all). `facts(entry)` answers `{ running, held, last }`, the log's last event.
 */
export function toResume(entries, facts) {
  return entries.filter(entry => {
    const { running, held, last } = facts(entry);
    if (running || held) return false;
    if (!last) return false;
    return last.event !== 'finished' || last.state === 'CANCELLED';
  });
}

/**
 * A temporary directory of one's own, at a short path: `/tmp/cdd-<hash of key>`, made if missing. A process's TMPDIR
 * ends up in Unix socket paths (tsx opens one under it), and a socket path longer than 107 bytes cannot be bound: a
 * TMPDIR under a project's `.flow` directory in a deep tree stopped every server of J6's dry run from starting. The
 * same key gives the same directory, so a ladder resumed bounds the cache it left.
 */
export function shortTmpDir(key) {
  const dir = join('/tmp', `cdd-${createHash('sha256').update(String(key)).digest('hex').slice(0, 10)}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}
