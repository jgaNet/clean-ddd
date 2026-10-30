import { execFileSync } from 'child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

import { createApplication, describeGate, Executor, repositoryRoot, runGate, tail } from './index';

/**
 * The gate reads the commands, not an agent's report of them (RFC 0001). These specs run it on
 * an application `create` made, committed as its own repository, with the language's commands
 * replaced by a recorder: what is pinned is the order, the verdict and what a failure shows, not
 * whether pytest is installed on the machine running the specs.
 */

const root = repositoryRoot();
const directory = mkdtempSync(join(tmpdir(), 'gated-'));
createApplication(directory, 'my-app', root, 'python');
const git = (...args: string[]) => execFileSync('git', args, { cwd: directory, encoding: 'utf8' });
git('init', '-q');
git('-c', 'user.name=spec', '-c', 'user.email=spec@example.com', 'add', '-A');
git('-c', 'user.name=spec', '-c', 'user.email=spec@example.com', 'commit', '-q', '-m', 'created');
const base = git('rev-parse', 'HEAD').trim();

afterAll(() => rmSync(directory, { recursive: true, force: true }));

/** Every command passes, except those a test names, which print what they are told to. */
const recorder = (failing: Record<string, string> = {}) => {
  const ran: string[] = [];
  const exec: Executor = command => {
    ran.push(command);
    return command in failing ? { code: 1, output: failing[command] } : { code: 0, output: 'ok\n' };
  };
  return { ran, exec };
};

describe('the gate', () => {
  it('passes a change that leaves the architecture alone and passes every check, in CI order', async () => {
    const { ran, exec } = recorder();
    const report = await runGate({ root: directory, base, exec });

    expect(report.verdict).toBe('pass');
    expect(report.steps.map(step => [step.name, step.stage, step.status])).toEqual([
      ['mode feature', 'architecture', 'pass'],
      ['conventions (contract)', 'architecture', 'pass'],
      ['conventions', 'architecture', 'pass'],
      ['uv run ruff format --check .', 'quality', 'pass'],
      ['uv run ruff check .', 'quality', 'pass'],
      ['uv run mypy', 'quality', 'pass'],
      ['uv run pytest', 'tests', 'pass'],
    ]);
    expect(ran).toEqual([
      'uv run python -m tools.conventions',
      'uv run ruff format --check .',
      'uv run ruff check .',
      'uv run mypy',
      'uv run pytest',
    ]);
    expect(JSON.parse(JSON.stringify(report))).toMatchObject({ schemaVersion: 1, language: 'python', base });
  });

  it('stops at a failure of the architecture: nothing is tested on a tree the table refuses', async () => {
    const { ran, exec } = recorder({
      'uv run python -m tools.conventions': 'line 1\n✗ ARCH-INWARD: a domain imports its infrastructure\n',
    });
    const report = await runGate({ root: directory, base, exec });

    expect(report.verdict).toBe('fail');
    expect(ran).toEqual(['uv run python -m tools.conventions']);
    expect(report.steps.find(step => step.name === 'conventions')).toMatchObject({
      status: 'fail',
      lines: ['line 1', '✗ ARCH-INWARD: a domain imports its infrastructure'],
    });
    expect(report.steps.filter(step => step.status === 'skipped').map(step => step.name)).toEqual([
      'uv run ruff format --check .',
      'uv run ruff check .',
      'uv run mypy',
      'uv run pytest',
    ]);
  });

  it('runs every quality and test step past a failure there, so one gate shows everything left to fix', async () => {
    const { ran, exec } = recorder({
      'uv run mypy': 'error: Incompatible types\n',
      'uv run pytest': 'FAILED test_x\n',
    });
    const report = await runGate({ root: directory, base, exec });

    expect(report.verdict).toBe('fail');
    expect(ran).toHaveLength(5);
    expect(report.steps.filter(step => step.status === 'fail').map(step => step.name)).toEqual([
      'uv run mypy',
      'uv run pytest',
    ]);
    expect(describeGate(report)).toContain('✗ uv run mypy');
    expect(describeGate(report)).toContain('      error: Incompatible types');
  });

  it('refuses a change to the architecture, committed or not, before running anything', async () => {
    writeFileSync(
      join(directory, 'src/architecture/domain/added.py'),
      '"""A building block a feature may not add."""\n',
    );
    try {
      const { ran, exec } = recorder();
      const report = await runGate({ root: directory, base, exec });

      expect(report.verdict).toBe('fail');
      expect(ran).toEqual([]);
      expect(report.steps[0]).toMatchObject({ name: 'mode feature', status: 'fail' });
      expect(report.steps[0].lines?.[0]).toMatch(/^src\/architecture\/domain\/added\.py is part of the architecture/);
      expect(report.steps.slice(1).every(step => step.status === 'skipped')).toBe(true);
    } finally {
      rmSync(join(directory, 'src/architecture/domain/added.py'));
    }
  });

  it('holds an architecture task to the architecture mode: it may touch the architecture if it records why', async () => {
    writeFileSync(
      join(directory, 'src/architecture/domain/added.py'),
      '"""A building block an architecture task adds."""\n',
    );
    try {
      const unrecorded = await runGate({ root: directory, base, mode: 'architecture', exec: recorder().exec });
      expect(unrecorded.steps[0]).toMatchObject({ name: 'mode architecture', status: 'fail' });
      expect(unrecorded.steps[0].lines?.[0]).toMatch(/records no decision/);

      mkdirSync(join(directory, 'docs/adr'), { recursive: true });
      writeFileSync(join(directory, 'docs/adr/0099-a-building-block.md'), '# 99. A building block\n');
      const recorded = await runGate({ root: directory, base, mode: 'architecture', exec: recorder().exec });
      expect(recorded.steps[0]).toMatchObject({ name: 'mode architecture', status: 'pass' });
    } finally {
      rmSync(join(directory, 'src/architecture/domain/added.py'));
      rmSync(join(directory, 'docs/adr/0099-a-building-block.md'), { force: true });
    }
  });

  it('keeps the last lines a command printed, which is what a failure is read from', () => {
    expect(tail(Array.from({ length: 50 }, (_, index) => `line ${index}`).join('\n'), 3)).toEqual([
      'line 47',
      'line 48',
      'line 49',
    ]);
  });
});
