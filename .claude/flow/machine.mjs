/**
 * What a ladder asks of the machine before it runs, so that a comparison between arms is not a comparison between
 * machines (J5: the trees declared Node 24 and ran on Node 22, where one tree's own test cannot load an ES module;
 * four ladders at once ran the machine out of memory, and the kernel killed agents and gradings).
 *
 * - The Node the trees declare: a ladder refuses to start on a Node older than the project's `engines.node`, and
 *   every command it runs (the agent's checks, the gate, the grader) finds that same Node first on its PATH.
 * - A slot: at most `ladders` ladders run at once on the machine; another waits for a slot to free.
 */
import { mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
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
