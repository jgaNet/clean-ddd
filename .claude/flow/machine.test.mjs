/**
 * What a ladder asks of the machine, tested without an agent: `node --test .claude/flow/`.
 */
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, describe, it } from 'node:test';

import {
  boundCache,
  minimumNodeMajor,
  nodeMismatch,
  pathWithThisNode,
  readRegistry,
  register,
  shortTmpDir,
  takeSlot,
  toResume,
} from './machine.mjs';

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

  it('takes over a slot that names its own pid, left before a restart that gave the same pid again', async () => {
    const dir = join(scratch, 'reused');
    mkdirSync(join(dir, 'slot-0'), { recursive: true });
    writeFileSync(join(dir, 'slot-0', 'pid'), String(process.pid));
    const taken = await Promise.race([
      takeSlot({ max: 1, dir, pollMs: 20 }).then(() => true),
      new Promise(done => setTimeout(() => done(false), 500)),
    ]);
    assert.equal(taken, true);
  });
});

describe("jest's cache, bounded in a run's own directory", () => {
  it('leaves a cache under its cap, and removes one above it whole, touching nothing else', () => {
    const dir = join(scratch, 'tmp-of-a-run');
    mkdirSync(join(dir, 'jest_0', 'a'), { recursive: true });
    writeFileSync(join(dir, 'jest_0', 'a', 'transformed.js'), 'x'.repeat(2048));
    writeFileSync(join(dir, 'not-jest.txt'), 'kept');
    assert.deepEqual(boundCache(dir, 4096), { bytes: 2048, removed: false });
    assert.ok(existsSync(join(dir, 'jest_0')));
    assert.deepEqual(boundCache(dir, 1024), { bytes: 2048, removed: true });
    assert.ok(!existsSync(join(dir, 'jest_0')));
    assert.ok(existsSync(join(dir, 'not-jest.txt')));
    assert.deepEqual(boundCache(join(scratch, 'nowhere'), 1), { bytes: 0, removed: false });
  });
});

describe('the register resume.mjs reads', () => {
  it('keeps one entry per project and run, the last one written', () => {
    const file = join(scratch, 'registry', 'ladders.json');
    register({ run: 'r1', project: '/p', plan: '/a.yaml', log: '/p.flow/r1.jsonl' }, file);
    register({ run: 'r2', project: '/p', plan: '/b.yaml', log: '/p.flow/r2.jsonl' }, file);
    register({ run: 'r1', project: '/p', plan: '/c.yaml', log: '/p.flow/r1.jsonl' }, file);
    assert.deepEqual(
      readRegistry(file).map(each => [each.run, each.plan]),
      [
        ['r2', '/b.yaml'],
        ['r1', '/c.yaml'],
      ],
    );
    assert.deepEqual(readRegistry(join(scratch, 'registry', 'missing.json')), []);
  });

  it('resumes a run stopped mid-way or cancelled, and not one running, held, finished or never started', () => {
    const entries = ['mid', 'cancelled', 'running', 'held', 'done', 'stopped', 'never'].map(run => ({ run }));
    const facts = {
      mid: { last: { event: 'agent-finished' } },
      cancelled: { last: { event: 'finished', state: 'CANCELLED' } },
      running: { running: true, last: { event: 'attempt' } },
      held: { held: true, last: { event: 'attempt' } },
      done: { last: { event: 'finished', state: 'COMPLETED' } },
      stopped: { last: { event: 'finished', state: 'STOPPED' } },
      never: {},
    };
    assert.deepEqual(
      toResume(entries, entry => facts[entry.run]).map(entry => entry.run),
      ['mid', 'cancelled'],
    );
  });
});

describe('shortTmpDir', () => {
  it('answers one short directory per key, the same each time, short enough for a socket under it', () => {
    const key = `/${'deep/'.repeat(30)}project.flow/tmp/run`;
    const dir = shortTmpDir(key);
    assert.equal(dir, shortTmpDir(key));
    assert.notEqual(dir, shortTmpDir(`${key}-other`));
    assert.ok(`${dir}/tsx-0/12345678.pipe`.length < 107);
    assert.ok(existsSync(dir));
  });
});
