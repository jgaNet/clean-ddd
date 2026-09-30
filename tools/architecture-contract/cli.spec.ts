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

  it('verb <intent> answers with the shape and when to use it', () => {
    expect(architecture('verb', 'remove').stdout).toContain('DELETE /notes/:id/bookmark');
    const { status, stdout } = architecture('verb', 'create-under', '--json');
    expect(status).toBe(0);
    expect(JSON.parse(stdout).verbs[0]).toMatchObject({ verb: 'POST', shape: 'POST /notes/:id/comments' });
    expect(architecture('verb', 'TRACE', '--json').status).toBe(1);
  });

  it('checklist <kind> lists the parts, place <kind> answers the path alone', () => {
    expect(architecture('checklist', 'command').stdout).toMatch(/publishDomainEvents/);
    expect(architecture('place', 'domain-service').stdout.trim()).toBe(
      'src/Contexts/<Context>/Domain/<Aggregate>/<Rule>.ts',
    );
    const { status, stdout } = architecture('checklist', 'aggregate', '--json');
    expect(status).toBe(0);
    expect(JSON.parse(stdout)).toMatchObject({ kind: 'aggregate', concept: 'aggregate-root' });
    expect(architecture('place', 'saga', '--json').status).toBe(1);
  });

  it('plan validate says whether an intended change is legal, and exits non-zero when it is not', () => {
    const ok = architecture('plan', 'validate', 'conventions/plans/share-a-note.yaml', '--json');
    expect(ok.status).toBe(0);
    expect(JSON.parse(ok.stdout)).toMatchObject({ feature: 'share-a-note', valid: true, problems: [] });
    const missing = architecture('plan', 'validate', 'conventions/plans/nope.yaml', '--json');
    expect(missing.status).toBe(1);
    expect(JSON.parse(missing.stdout)).toMatchObject({ error: { code: 'malformed' } });
  });

  it('plan explain expands a plan into files, rules and examples', () => {
    const { status, stdout } = architecture('plan', 'explain', 'conventions/plans/share-a-note.yaml', '--json');
    expect(status).toBe(0);
    const explained = JSON.parse(stdout);
    expect(explained.changes[0]).toMatchObject({ kind: 'aggregate', place: 'src/Contexts/Notes/Domain/Note/Note.ts' });
    expect(explained.rules.map((rule: { id: string }) => rule.id)).toContain('CTX-CONTRACTS');
    expect(architecture('plan', 'explain').status).toBe(1);
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

  it('can-import takes several pairs at once and refuses if any is refused', () => {
    const { status, stdout } = architecture(
      'can-import',
      'src/Contexts/Notes/Domain/Note/Probe.ts',
      '@Architecture/Domain',
      'src/Contexts/Notes/Domain/Note/Probe.ts',
      'fastify',
      '--json',
    );
    expect(status).toBe(1);
    const { imports } = JSON.parse(stdout);
    expect(imports.map((verdict: { allowed: boolean }) => verdict.allowed)).toEqual([true, false]);
    expect(imports[1]).toMatchObject({ rule: 'ARCH-DOMAIN', remediation: expect.any(String) });
  });
});
