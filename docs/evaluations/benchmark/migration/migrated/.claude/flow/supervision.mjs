/**
 * What keeps unattended agents from harming each other, the project or the budget (ADR 31: the
 * robustness campaign waits for it). The drivers use three things from here:
 *
 * - `provideDependencies`: how a worktree gets its `node_modules`. `copy`, the default, gives it a
 *   copy of its own, so an agent that writes into a package changes nothing another tree sees.
 *   `link` hard-links the project's (cheap on disk); a file written in place would then be written
 *   in every tree that links it, so `fingerprint` the project's before an agent starts and compare
 *   after it finishes.
 * - `budget`: the run's budget, reserved before an agent starts. An agent is started with a cap,
 *   its reservation, that it may not spend past; the run never starts an agent it could not pay
 *   for, and reservations held by agents running at the same time count as spent.
 * - `freePort`: after an agent finishes, whatever still listens on its port (a server it started
 *   in the background) is stopped, and the driver records what was.
 *
 * Processes are found by the port they hold, through /proc, never by name.
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, readlinkSync, statSync } from 'node:fs';
import { join } from 'node:path';

export const DEPENDENCY_MODES = ['copy', 'link'];

/** Gives `target` the dependencies of `source`, as `mode` says; nothing when `source` has none. */
export function provideDependencies(source, target, mode = 'copy') {
  if (!DEPENDENCY_MODES.includes(mode)) throw new Error(`dependencies: ${mode} is not one of ${DEPENDENCY_MODES}`);
  const from = join(source, 'node_modules');
  if (!existsSync(from)) return;
  execFileSync('cp', [mode === 'link' ? '-al' : '-a', from, join(target, 'node_modules')]);
}

/**
 * What a directory's files are, in one string: each file's path, size and modification time. A
 * file written in place changes it, and so does one added or removed; reading a file does not.
 */
export function fingerprint(directory) {
  const hash = createHash('sha256');
  if (!existsSync(directory)) return hash.digest('hex');
  for (const entry of readdirSync(directory, { recursive: true, withFileTypes: true })
    .filter(each => each.isFile())
    .map(each => join(each.parentPath, each.name))
    .sort()) {
    const { size, mtimeMs } = statSync(entry);
    hash.update(`${entry}\0${size}\0${mtimeMs}\n`);
  }
  return hash.digest('hex');
}

/**
 * A run's budget. `reserve(conversation)` answers the cap the next agent in that conversation is
 * started with, or `undefined` when what is left is below `minimumUsd`; `settle(conversation,
 * reportedUsd)` records what the conversation has cost so far (a continued conversation reports
 * its running total) and frees the reservation.
 */
export function budget({ totalUsd, perAgentUsd = totalUsd, minimumUsd = 0.5 }) {
  const conversations = new Map();
  const reservations = new Map();
  const spent = () => [...conversations.values()].reduce((sum, cost) => sum + cost, 0);
  const reserved = () => [...reservations.values()].reduce((sum, cap) => sum + cap, 0);
  return {
    spent: () => Number(spent().toFixed(4)),
    reserved: () => Number(reserved().toFixed(4)),
    reserve(conversation) {
      const available = totalUsd - spent() - reserved();
      const cap = Math.min(perAgentUsd, available);
      if (cap < minimumUsd) return undefined;
      reservations.set(conversation, Number(cap.toFixed(4)));
      return reservations.get(conversation);
    },
    settle(conversation, reportedUsd) {
      reservations.delete(conversation);
      if (reportedUsd !== undefined)
        conversations.set(conversation, Math.max(conversations.get(conversation) ?? 0, reportedUsd));
    },
  };
}

/** The socket inodes listening on `port`, from the kernel's tables. */
function listening(port) {
  const inodes = new Set();
  const hex = port.toString(16).toUpperCase().padStart(4, '0');
  for (const table of ['/proc/net/tcp', '/proc/net/tcp6']) {
    if (!existsSync(table)) continue;
    for (const line of readFileSync(table, 'utf8').split('\n').slice(1)) {
      const fields = line.trim().split(/\s+/);
      // local address, then state: 0A is LISTEN.
      if (fields[1]?.endsWith(`:${hex}`) && fields[3] === '0A') inodes.add(fields[9]);
    }
  }
  return inodes;
}

/** The processes holding a socket that listens on `port`. */
export function portHolders(port) {
  const inodes = listening(port);
  if (!inodes.size) return [];
  const holders = [];
  for (const pid of readdirSync('/proc').filter(name => /^\d+$/.test(name))) {
    let descriptors;
    try {
      descriptors = readdirSync(`/proc/${pid}/fd`);
    } catch {
      continue; // gone, or not ours to read
    }
    for (const descriptor of descriptors) {
      let target;
      try {
        target = readlinkSync(`/proc/${pid}/fd/${descriptor}`);
      } catch {
        continue;
      }
      const inode = /^socket:\[(\d+)\]$/.exec(target)?.[1];
      if (inode && inodes.has(inode)) {
        holders.push(Number(pid));
        break;
      }
    }
  }
  return holders;
}

/** A process's group, from /proc (the fifth field of its stat, after the parenthesised name). */
function processGroup(pid) {
  try {
    const stat = readFileSync(`/proc/${pid}/stat`, 'utf8');
    return Number(stat.slice(stat.lastIndexOf(')') + 2).split(' ')[2]);
  } catch {
    return undefined;
  }
}

/**
 * Stops whatever listens on `port`, with the process group it belongs to, so that a watcher
 * (nodemon, `npx`) does not start it again; never this driver's own group. Answers the processes
 * that held the port.
 */
export function freePort(port) {
  const own = processGroup(process.pid);
  const holders = portHolders(port).filter(pid => pid !== process.pid);
  for (const pid of holders) {
    const group = processGroup(pid);
    try {
      if (group && group !== own) process.kill(-group, 'SIGKILL');
      else process.kill(pid, 'SIGKILL');
    } catch {
      // already gone
    }
  }
  return holders;
}
