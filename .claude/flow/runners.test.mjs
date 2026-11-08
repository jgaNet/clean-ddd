/**
 * The runners' clean-up, tested without an agent: `node --test .claude/flow/`.
 */
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { reap } from './runners.mjs';

const alive = pid => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};
const exited = child =>
  new Promise(done => (child.exitCode !== null || child.signalCode ? done() : child.on('exit', done)));

test('reap kills what was left running under the directory, in a group of its own, and nothing outside it', async t => {
  if (!existsSync('/proc')) return t.skip('no /proc');
  const root = mkdtempSync(join(tmpdir(), 'reap-'));
  const tree = join(root, 'tree');
  const other = join(root, 'tree-other');
  mkdirSync(join(tree, 'src'), { recursive: true });
  mkdirSync(other);
  const left = spawn('sleep', ['60'], { cwd: join(tree, 'src'), detached: true, stdio: 'ignore' });
  const outside = spawn('sleep', ['60'], { cwd: other, detached: true, stdio: 'ignore' });
  try {
    assert.equal(reap(tree), 1);
    await exited(left);
    assert.equal(alive(left.pid), false);
    assert.equal(alive(outside.pid), true);
    assert.equal(reap(tree), 0);
  } finally {
    outside.kill('SIGKILL');
    rmSync(root, { recursive: true, force: true });
  }
});
