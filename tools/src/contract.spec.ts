import { mkdirSync, mkdtempSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

import { ContractError, loadArchitectureContract, validateContract, repositoryRoot } from './index';
import { getChecklist, getConcept, getRule, getVerbs, listConcepts, listRules, rulesOf } from './query';

const root = repositoryRoot();

/** The smallest binding the loader accepts: a language alone in its repository, with nothing in it yet. */
const MINIMAL_BINDING = [
  'schemaVersion: 1',
  'language: typescript',
  'name: TypeScript',
  'root: .',
  'contexts: []',
  "contexts_tree: { alias: '@Contexts', path: src/Contexts }",
  "architecture: { alias: '@A', path: src/Architecture }",
  "kernel: { alias: '@K', path: src/SharedKernel }",
  "bootstrap: { alias: '@B', path: src/Bootstrap }",
  'enforcers: { linter: l, check: c, types: t, tests: s, review: r, evaluations: e }',
  '',
].join('\n');

/** A throwaway repository with just the contract files, to test the loader's refusals. */
function writeContract(
  dir: string,
  architecture: string,
  concepts = 'schemaVersion: 1\nconcepts: []\n',
  binding = MINIMAL_BINDING,
): string {
  const conventions = join(dir, 'conventions');
  mkdirSync(conventions, { recursive: true });
  writeFileSync(join(conventions, 'architecture.yaml'), architecture);
  writeFileSync(join(conventions, 'concepts.yaml'), concepts);
  writeFileSync(join(conventions, 'typescript.yaml'), binding);
  return dir;
}
const contractDirectory = (architecture: string, concepts?: string, binding?: string) =>
  writeContract(mkdtempSync(join(tmpdir(), 'contract-')), architecture, concepts, binding);

const EMPTY_TABLE = 'schemaVersion: 1\nlanguages: [typescript]\nlayers: {}\nrules: []\n';

describe('the architecture contract', () => {
  const contract = loadArchitectureContract(root);

  it('loads architecture.yaml, concepts.yaml and the binding into one contract', () => {
    expect(contract.schemaVersion).toBe(1);
    expect(contract.languages).toEqual(['typescript', 'rust', 'python', 'go']);
    expect(contract.language).toEqual({ id: 'typescript', name: 'TypeScript', root: 'typescript' });
    expect(contract.contexts).toEqual(['Notes', 'Security', 'Notifications', 'Tracker']);
    expect(contract.layers).toEqual(['Domain', 'Application', 'Infrastructure', 'Presentation']);
    expect(listRules(contract).length).toBeGreaterThan(10);
    expect(listConcepts(contract).length).toBeGreaterThan(30);
  });

  it('finds the repository root from where the command is typed, and the language under it', () => {
    expect(repositoryRoot(join(root, 'typescript/src/Contexts'))).toBe(root);
    expect(repositoryRoot(join(root, 'rust'))).toBe(root);
    expect(join(root, contract.language.root)).toBe(join(root, 'typescript'));
    expect(() => repositoryRoot('/')).toThrow('conventions/architecture.yaml not found');
  });

  it('speaks repository-relative paths, whichever file they came from', () => {
    expect(contract.architecture).toEqual({ alias: '@Architecture', path: 'typescript/src/Architecture' });
    expect(getRule(contract, 'CONC-OPTIMISTIC')?.references).toEqual([
      'docs/adr/0008-optimistic-concurrency-on-the-aggregate.md',
    ]);
    expect(getRule(contract, 'CONC-OPTIMISTIC')?.examples).toEqual([
      'typescript/src/Contexts/Notes/Infrastructure/NotePersistence.contract.spec.ts',
    ]);
    expect(getConcept(contract, 'aggregate-root')?.example).toContain(
      '](typescript/src/Contexts/Notes/Domain/Note/Note.ts)',
    );
    expect(contract.modes.feature.protected).toEqual(
      expect.arrayContaining(['conventions', 'docs/adr', 'tools', 'typescript/src/Architecture']),
    );
  });

  it('is sound: unique ids, existing references, concepts naming real rules and files', () => {
    expect(validateContract(contract, root)).toEqual([]);
  });

  it('rejects an unsupported schema version', () => {
    const dir = contractDirectory('schemaVersion: 2\nlayers: {}\nrules: []\n');
    expect(() => loadArchitectureContract(dir)).toThrow(ContractError);
    expect(() => loadArchitectureContract(dir)).toThrow(/schemaVersion 2/);
  });

  it('rejects a malformed contract', () => {
    const dir = contractDirectory('schemaVersion: 1\nlanguages: [typescript]\n');
    expect(() => loadArchitectureContract(dir)).toThrow(/"layers" is missing/);
    const noVersion = contractDirectory('layers: {}\n');
    expect(() => loadArchitectureContract(noVersion)).toThrow(/no schemaVersion/);
    const noBinding = contractDirectory(EMPTY_TABLE, undefined, 'schemaVersion: 1\n');
    expect(() => loadArchitectureContract(noBinding)).toThrow(/"contexts" is missing/);
  });

  it('reports, without throwing, a duplicate rule id and a concept naming an unknown rule or file', () => {
    const dir = contractDirectory(
      [
        'schemaVersion: 1',
        'languages: [typescript]',
        'layers: {}',
        'rules:',
        '  - { id: X-ONE, name: a, statement: s, why: w, remediation: r, enforcement: review, references: [] }',
        '  - { id: X-ONE, name: b, statement: s, why: w, remediation: r, enforcement: nope, references: [missing.md] }',
      ].join('\n'),
      [
        'schemaVersion: 1',
        'concepts:',
        '  - { id: thing, name: Thing, layer: domain, description: d, rules: [X-TWO], references: [] }',
      ].join('\n'),
      `${MINIMAL_BINDING}concepts: { thing: { canonical: [src/Nope.ts] } }\n`,
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

  it('refuses a rule in a binding, and a file named by the contract: one contract for every language', () => {
    const dir = contractDirectory(
      [
        'schemaVersion: 1',
        'languages: [typescript]',
        'layers: {}',
        'rules:',
        '  - { id: X-ONE, name: a, statement: s, why: w, remediation: r, enforcement: review, references: [src/Thing.ts] }',
      ].join('\n'),
      undefined,
      `${MINIMAL_BINDING}rules: { X-MINE: { references: [] } }\n`,
    );
    mkdirSync(join(dir, 'src'));
    writeFileSync(join(dir, 'src/Thing.ts'), '');
    const problems = validateContract(loadArchitectureContract(dir), dir);
    expect(problems).toEqual(
      expect.arrayContaining([
        expect.stringContaining('names the rule X-MINE, which conventions/architecture.yaml does not define'),
        expect.stringContaining('references src/Thing.ts, a file of one language'),
      ]),
    );
  });

  it('reports a binding the map does not know, and one that does not say what holds a rule', () => {
    const dir = contractDirectory(
      'schemaVersion: 1\nlanguages: [rust]\nlayers: {}\nrules: []\n',
      undefined,
      MINIMAL_BINDING.replace(/enforcers:.*\n/, 'enforcers: { linter: l }\n'),
    );
    const problems = validateContract(loadArchitectureContract(dir, 'typescript'), dir);
    expect(problems).toEqual(
      expect.arrayContaining([
        expect.stringContaining('the language typescript is not in "languages"'),
        expect.stringContaining('does not say what holds "check"'),
      ]),
    );
  });

  it('answers a rule by id, case-insensitively, and nothing for an unknown id', () => {
    const rule = getRule(contract, 'arch-domain');
    expect(rule?.id).toBe('ARCH-DOMAIN');
    expect(rule?.enforcement).toBe('linter');
    expect(rule?.dependency?.mayImport).toEqual(['own.Domain', 'architecture.Domain', 'kernel.Domain']);
    expect(getRule(contract, 'ARCH-NOPE')).toBeUndefined();
  });

  it('answers the verb of an intent, or of a method, and nothing for an unknown one', () => {
    expect(getVerbs(contract, 'remove').map(verb => verb.verb)).toEqual(['DELETE']);
    expect(getVerbs(contract, 'read')[0].shape).toBe('GET /notes/:id');
    expect(getVerbs(contract, 'read')[0].example).toBe(
      'typescript/src/Contexts/Notes/Presentation/API/REST/Routes/note.routes.ts',
    );
    expect(getVerbs(contract, 'POST').map(verb => verb.intent)).toEqual(['create', 'act', 'create-under']);
    expect(getVerbs(contract, 'TRACE')).toEqual([]);
  });

  it('answers what a new thing of a kind is made of, and where it goes', () => {
    const aggregate = getChecklist(contract, 'aggregate');
    expect(aggregate?.place).toBe('typescript/src/Contexts/<Context>/Domain/<Aggregate>/<Aggregate>.ts');
    expect(aggregate?.concept).toBe('aggregate-root');
    expect(aggregate?.parts.join(' ')).toMatch(/fromSnapshot/);
    expect(getChecklist(contract, 'saga')).toBeUndefined();
  });

  it('every checklist names a concept the map defines, and every verb an example that exists', () => {
    const conceptIds = listConcepts(contract).map(concept => concept.id);
    for (const checklist of contract.checklists) expect(conceptIds).toContain(checklist.concept);
    expect(contract.verbs.length).toBeGreaterThan(5);
  });

  it('answers a concept by id with its canonical files and resolved rules, and nothing for an unknown id', () => {
    const aggregate = getConcept(contract, 'aggregate-root');
    expect(aggregate?.canonical).toContain('typescript/src/Architecture/Domain/AggregateRoot.ts');
    expect(rulesOf(contract, aggregate!).map(rule => rule.id)).toEqual(['DOMAIN-RECORDS-EVENTS', 'CONC-OPTIMISTIC']);
    expect(getConcept(contract, 'saga')).toBeUndefined();
  });
});
