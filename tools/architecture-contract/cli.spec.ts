import { spawnSync } from 'child_process';
import { join } from 'path';

import { repositoryRoot } from './load';

/** The CLI as a tool would call it: a process, its stdout, its exit status. JSON must be JSON. */
const architecture = (...args: string[]) => {
  const result = spawnSync(
    join(repositoryRoot(), 'node_modules/.bin/tsx'),
    ['tools/architecture-contract/cli.ts', ...args],
    {
      cwd: repositoryRoot(),
      encoding: 'utf8',
    },
  );
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
};

describe('yarn architecture', () => {
  it('inspect describes the contract, and --json is valid JSON with no decoration', () => {
    expect(architecture('inspect').stdout).toContain('Contexts:');
    const { status, stdout } = architecture('inspect', '--json');
    expect(status).toBe(0);
    const parsed = JSON.parse(stdout);
    expect(parsed).toMatchObject({ schemaVersion: 1, contexts: ['Notes', 'Security', 'Notifications', 'Tracker'] });
    expect(typeof parsed.rules).toBe('number');
    expect(stdout).not.toMatch(/\x1b\[/);
  });

  it('rule <ID> explains a rule, in text and in JSON', () => {
    expect(architecture('rule', 'ARCH-DOMAIN').stdout).toMatch(/Remediation:/);
    const { status, stdout } = architecture('rule', 'CONC-OPTIMISTIC', '--json');
    expect(status).toBe(0);
    expect(JSON.parse(stdout)).toMatchObject({
      id: 'CONC-OPTIMISTIC',
      enforcement: 'tests',
      references: expect.arrayContaining(['docs/adr/0008-optimistic-concurrency-on-the-aggregate.md']),
    });
  });

  it('concept <id> explains a concept, in text and in JSON', () => {
    expect(architecture('concept', 'aggregate-root').stdout).toMatch(/Canonical:/);
    const { status, stdout } = architecture('concept', 'aggregate-root', '--json');
    expect(status).toBe(0);
    const parsed = JSON.parse(stdout);
    expect(parsed.canonical).toContain('src/Architecture/Domain/AggregateRoot.ts');
    expect(parsed.rules.map((rule: { id: string }) => rule.id)).toContain('CONC-OPTIMISTIC');
  });

  it('exits non-zero, with a structured error in JSON mode, for an unknown rule or concept', () => {
    expect(architecture('rule', 'ARCH-NOPE').status).toBe(1);
    const rule = architecture('rule', 'ARCH-NOPE', '--json');
    expect(rule.status).toBe(1);
    expect(JSON.parse(rule.stdout)).toMatchObject({ error: { code: 'unknown-rule' } });
    const concept = architecture('concept', 'saga', '--json');
    expect(concept.status).toBe(1);
    expect(JSON.parse(concept.stdout)).toMatchObject({ error: { code: 'unknown-concept' } });
  });

  it('can-import answers with the enforcement and names the rule that refuses', () => {
    const allowed = architecture(
      'can-import',
      'src/Contexts/Notes/Domain/Note/Probe.ts',
      '@Architecture/Domain',
      '--json',
    );
    expect(allowed.status).toBe(0);
    expect(JSON.parse(allowed.stdout)).toMatchObject({ allowed: true });
    const refused = architecture('can-import', 'src/Contexts/Notes/Domain/Note/Probe.ts', 'fastify', '--json');
    expect(refused.status).toBe(1);
    expect(JSON.parse(refused.stdout)).toMatchObject({ allowed: false, rule: 'ARCH-DOMAIN' });
  });
});
