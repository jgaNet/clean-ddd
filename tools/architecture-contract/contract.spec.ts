import { mkdirSync, mkdtempSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

import { ContractError, loadArchitectureContract, validateContract, repositoryRoot } from './index';
import { getConcept, getRule, listConcepts, listRules, rulesOf } from './query';

const root = repositoryRoot();

/** A throwaway repository with just the two contract files, to test the loader's refusals. */
function contractDirectory(architecture: string, concepts = 'schemaVersion: 1\nconcepts: []\n'): string {
  return writeContract(mkdtempSync(join(tmpdir(), 'contract-')), architecture, concepts);
}
function writeContract(dir: string, architecture: string, concepts: string): string {
  const conventions = join(dir, 'conventions');
  mkdirSync(conventions, { recursive: true });
  writeFileSync(join(conventions, 'architecture.yaml'), architecture);
  writeFileSync(join(conventions, 'concepts.yaml'), concepts);
  return dir;
}

describe('the architecture contract', () => {
  const contract = loadArchitectureContract(root);

  it('loads architecture.yaml and concepts.yaml into one contract', () => {
    expect(contract.schemaVersion).toBe(1);
    expect(contract.contexts).toEqual(['Notes', 'Security', 'Notifications', 'Tracker']);
    expect(contract.layers).toEqual(['Domain', 'Application', 'Infrastructure', 'Presentation']);
    expect(listRules(contract).length).toBeGreaterThan(10);
    expect(listConcepts(contract).length).toBeGreaterThan(30);
  });

  it('is sound: unique ids, existing references, concepts naming real rules and files', () => {
    expect(validateContract(contract, root)).toEqual([]);
  });

  it('rejects an unsupported schema version', () => {
    const dir = contractDirectory('schemaVersion: 2\ncontexts: []\nlayers: {}\nrules: []\n');
    expect(() => loadArchitectureContract(dir)).toThrow(ContractError);
    expect(() => loadArchitectureContract(dir)).toThrow(/schemaVersion 2/);
  });

  it('rejects a malformed contract', () => {
    const dir = contractDirectory('schemaVersion: 1\ncontexts: [Notes]\n');
    expect(() => loadArchitectureContract(dir)).toThrow(/"layers" is missing/);
    const noVersion = writeContract(mkdtempSync(join(tmpdir(), 'contract-')), 'contexts: []\n', 'concepts: []\n');
    expect(() => loadArchitectureContract(noVersion)).toThrow(/no schemaVersion/);
  });

  it('reports, without throwing, a duplicate rule id and a concept naming an unknown rule or file', () => {
    const dir = writeContract(
      mkdtempSync(join(tmpdir(), 'contract-')),
      [
        'schemaVersion: 1',
        'contexts: []',
        "architecture: { alias: '@A', path: src/Architecture }",
        "kernel: { alias: '@K', path: src/SharedKernel }",
        'layers: {}',
        'rules:',
        '  - { id: X-ONE, name: a, statement: s, why: w, remediation: r, enforcement: review, references: [] }',
        '  - { id: X-ONE, name: b, statement: s, why: w, remediation: r, enforcement: nope, references: [missing.md] }',
      ].join('\n'),
      [
        'schemaVersion: 1',
        'concepts:',
        '  - { id: thing, name: Thing, layer: domain, canonical: [src/Nope.ts], description: d, rules: [X-TWO], references: [] }',
      ].join('\n'),
    );
    const problems = validateContract(loadArchitectureContract(dir), dir);
    expect(problems).toEqual(
      expect.arrayContaining([
        expect.stringContaining('duplicate id'),
        expect.stringContaining('enforcement must be one of'),
        expect.stringContaining('references missing.md'),
        expect.stringContaining('names src/Nope.ts, which does not exist'),
        expect.stringContaining('names the rule X-TWO'),
      ]),
    );
  });

  it('answers a rule by id, case-insensitively, and nothing for an unknown id', () => {
    const rule = getRule(contract, 'arch-domain');
    expect(rule?.id).toBe('ARCH-DOMAIN');
    expect(rule?.enforcement).toBe('eslint');
    expect(rule?.dependency?.mayImport).toEqual(['own.Domain', 'architecture.Domain', 'kernel.Domain']);
    expect(getRule(contract, 'ARCH-NOPE')).toBeUndefined();
  });

  it('answers a concept by id with its canonical files and resolved rules, and nothing for an unknown id', () => {
    const aggregate = getConcept(contract, 'aggregate-root');
    expect(aggregate?.canonical).toContain('src/Architecture/Domain/AggregateRoot.ts');
    expect(rulesOf(contract, aggregate!).map(rule => rule.id)).toEqual(['DOMAIN-RECORDS-EVENTS', 'CONC-OPTIMISTIC']);
    expect(getConcept(contract, 'saga')).toBeUndefined();
  });
});
