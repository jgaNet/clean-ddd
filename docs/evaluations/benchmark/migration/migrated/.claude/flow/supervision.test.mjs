/**
 * The supervision the drivers rely on, tested without an agent: `node --test .claude/flow/`.
 */
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { appendFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, describe, it } from 'node:test';

import { budget, fingerprint, freePort, portHolders, provideDependencies } from './supervision.mjs';

const scratch = mkdtempSync(join(tmpdir(), 'supervision-'));
after(() => rmSync(scratch, { recursive: true, force: true }));

function project(name) {
  const root = join(scratch, name);
  mkdirSync(join(root, 'node_modules', 'left-pad'), { recursive: true });
  writeFileSync(join(root, 'node_modules', 'left-pad', 'index.js'), 'module.exports = 1;\n');
  return root;
}

describe('dependencies', () => {
  it('copies by default: writing into a package in the worktree leaves the project untouched', () => {
    const source = project('copy-source');
    const tree = join(scratch, 'copy-tree');
    mkdirSync(tree);
    provideDependencies(source, tree);
    appendFileSync(join(tree, 'node_modules', 'left-pad', 'index.js'), '// changed by an agent\n');
    assert.equal(readFileSync(join(source, 'node_modules', 'left-pad', 'index.js'), 'utf8'), 'module.exports = 1;\n');
  });

  it('links on request, and the fingerprint catches a file written in place through the link', async () => {
    const source = project('link-source');
    const tree = join(scratch, 'link-tree');
    mkdirSync(tree);
    provideDependencies(source, tree, 'link');
    const before = fingerprint(join(source, 'node_modules'));
    assert.equal(fingerprint(join(source, 'node_modules')), before, 'reading changes nothing');
    await new Promise(resolve => setTimeout(resolve, 20));
    appendFileSync(join(tree, 'node_modules', 'left-pad', 'index.js'), '// changed by an agent\n');
    assert.notEqual(fingerprint(join(source, 'node_modules')), before);
  });

  it('refuses a mode it does not know', () => {
    assert.throws(() => provideDependencies(project('mode'), scratch, 'symlink'), /not one of/);
  });
});

describe('the budget', () => {
  it('caps each agent at its share and starts none it could not pay for', () => {
    const run = budget({ totalUsd: 10, perAgentUsd: 4, minimumUsd: 1 });
    assert.equal(run.reserve('a'), 4);
    assert.equal(run.reserve('b'), 4, 'an agent running at the same time reserves its own share');
    assert.equal(run.reserve('c'), 2, 'the last one gets what is left');
    assert.equal(run.reserve('d'), undefined, 'nothing is left while three hold their reservations');
    run.settle('a', 1.5);
    assert.equal(run.spent(), 1.5);
    assert.equal(run.reserve('d'), 2.5, 'a settled agent frees what it did not spend');
  });

  it('counts a continued conversation once, at its running total', () => {
    const run = budget({ totalUsd: 10 });
    run.reserve('conversation');
    run.settle('conversation', 3);
    run.reserve('conversation');
    run.settle('conversation', 5);
    assert.equal(run.spent(), 5);
    assert.equal(run.reserve('next'), 5);
  });
});

describe('the port an agent leaves behind', () => {
  it('stops the process still listening on it, with its group, and answers what it stopped', async () => {
    const listener = createServer();
    const port = await new Promise(resolve => listener.listen(0, () => resolve(listener.address().port)));
    await new Promise(resolve => listener.close(resolve));
    // A server an agent started in the background, in a process group of its own.
    const server = spawn(
      process.execPath,
      ['-e', `require('net').createServer().listen(${port}); setInterval(() => {}, 1000);`],
      { detached: true, stdio: 'ignore' },
    );
    const exited = new Promise(resolve => server.once('exit', resolve));
    for (let attempt = 0; attempt < 100 && !portHolders(port).length; attempt++)
      await new Promise(resolve => setTimeout(resolve, 50));
    assert.deepEqual(portHolders(port), [server.pid]);
    assert.deepEqual(freePort(port), [server.pid]);
    await exited;
    assert.deepEqual(portHolders(port), []);
    assert.deepEqual(freePort(port), [], 'a free port has nothing to stop');
  });
});
