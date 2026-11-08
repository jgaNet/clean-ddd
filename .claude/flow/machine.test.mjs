/**
 * What a ladder asks of the machine, tested without an agent: `node --test .claude/flow/`.
 */
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, describe, it } from 'node:test';

import { minimumNodeMajor, nodeMismatch, pathWithThisNode, takeSlot } from './machine.mjs';

const scratch = mkdtempSync(join(tmpdir(), 'machine-'));
after(() => rmSync(scratch, { recursive: true, force: true }));

describe('the Node a project declares', () => {
  it('reads the lowest major an engines range admits', () => {
    assert.equal(minimumNodeMajor('>=24'), 24);
    assert.equal(minimumNodeMajor('^24.9.0'), 24);
    assert.equal(minimumNodeMajor('22.x || >=24'), 22);
    assert.equal(minimumNodeMajor(undefined), undefined);
  });

  it('refuses an older Node, names both versions, and accepts the declared one', () => {
    const project = join(scratch, 'declares-24');
    mkdirSync(project);
    writeFileSync(join(project, 'package.json'), JSON.stringify({ engines: { node: '>=24' } }));
    assert.match(nodeMismatch(project, '22.22.0'), /node >=24 .* node 22\.22\.0/);
    assert.equal(nodeMismatch(project, '24.21.0'), undefined);
  });

  it('says nothing for a project that declares no Node', () => {
    const project = join(scratch, 'declares-none');
    mkdirSync(project);
    writeFileSync(join(project, 'package.json'), '{}');
    assert.equal(nodeMismatch(project, '18.0.0'), undefined);
  });

  it("puts this process's Node first on the PATH", () => {
    assert.ok(pathWithThisNode('/usr/bin').endsWith(':/usr/bin'));
    assert.ok(pathWithThisNode('/usr/bin').startsWith(process.execPath.replace(/\/node$/, '')));
  });
});

describe('the slots ladders share', () => {
  it('gives at most max slots, and the next one when a slot is freed', async () => {
    const dir = join(scratch, 'slots');
    const first = await takeSlot({ max: 2, dir, pollMs: 20 });
    await takeSlot({ max: 2, dir, pollMs: 20 });
    let waited = false;
    const third = takeSlot({ max: 2, dir, pollMs: 20, onWait: () => (waited = true) });
    await new Promise(done => setTimeout(done, 60));
    assert.equal(waited, true);
    first();
    const free = await third;
    assert.equal(typeof free, 'function');
  });

  it('takes over a slot whose ladder is gone, and one left empty by a crash', async () => {
    const dir = join(scratch, 'stale');
    const gone = spawn(process.execPath, ['-e', '']);
    await new Promise(done => gone.on('close', done));
    mkdirSync(join(dir, 'slot-0'), { recursive: true });
    writeFileSync(join(dir, 'slot-0', 'pid'), String(gone.pid));
    await takeSlot({ max: 1, dir, pollMs: 20 });
    assert.equal(readFileSync(join(dir, 'slot-0', 'pid'), 'utf8'), String(process.pid));

    const crashed = join(scratch, 'crashed');
    mkdirSync(join(crashed, 'slot-0'), { recursive: true });
    const old = (Date.now() - 120_000) / 1000;
    utimesSync(join(crashed, 'slot-0'), old, old);
    await takeSlot({ max: 1, dir: crashed, pollMs: 20 });
    assert.ok(existsSync(join(crashed, 'slot-0', 'pid')));
  });
});
