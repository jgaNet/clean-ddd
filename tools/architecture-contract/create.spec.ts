import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

import { createApplication, loadArchitectureContract, repositoryRoot, validateContract } from './index';

/**
 * What `yarn architecture create` promises: an application with this repository's architecture
 * and none of its business, whose own contract is sound and whose files all exist.
 *
 * What these specs cannot prove is the last claim — that the generated project passes its own
 * six checks — because that needs an install. The claim is checked by hand against a real
 * `yarn install` when the scaffolder changes; what is mechanical here is everything the tree
 * and the contract can answer: nothing copied is missing, nothing kept points at a file that
 * was not, and no business leaked in.
 */

const root = repositoryRoot();
const reference = loadArchitectureContract(root);

describe('yarn architecture create', () => {
  const directory = mkdtempSync(join(tmpdir(), 'created-'));
  const created = createApplication(directory, 'my-app', root);
  const generated = loadArchitectureContract(directory);
  const read = (path: string) => readFileSync(join(directory, path), 'utf8');

  afterAll(() => rmSync(directory, { recursive: true, force: true }));

  it('copies the architecture, the shared kernel and the tooling, and writes the documents', () => {
    for (const path of [
      'src/Architecture/Domain/AggregateRoot.ts',
      'src/Architecture/Application/CommandHandler.ts',
      'src/SharedKernel/Domain/Email.ts',
      'tools/architecture-contract/cli.ts',
      'tools/check-conventions.ts',
      'eslint.config.js',
      'jest.config.js',
      'tsconfig.json',
      'conventions/architecture.yaml',
      'conventions/concepts.yaml',
      'README.md',
      'CLAUDE.md',
      'package.json',
      '.gitignore',
    ]) {
      expect(existsSync(join(directory, path))).toBe(true);
    }
    expect(created.files).toBeGreaterThan(50);
  });

  it('keeps the building blocks’ specs, which describe them, and leaves the tooling’s behind', () => {
    // The tooling's specs assert on this repository's contract; elsewhere they would fail
    // while saying nothing about the project.
    expect(existsSync(join(directory, 'src/Architecture/Application/CommandHandler.spec.ts'))).toBe(true);
    expect(existsSync(join(directory, 'tools/architecture-contract/create.spec.ts'))).toBe(false);
    expect(readdirSync(join(directory, 'tools/architecture-contract')).some(f => f.endsWith('.spec.ts'))).toBe(false);
  });

  it('gives no business: no context, no composition root, no route', () => {
    expect(generated.contexts).toEqual([]);
    expect(readdirSync(join(directory, 'src/Contexts'))).toEqual(['README.md']);
    expect(existsSync(join(directory, 'src/Bootstrap'))).toBe(false);
    // `src/Contexts/<Context>/...` stays: a checklist's placeholder is not a business. A named
    // context of this repository would be.
    for (const document of ['README.md', 'CLAUDE.md', 'conventions/architecture.yaml', 'conventions/concepts.yaml']) {
      for (const context of reference.contexts) {
        expect(read(document)).not.toContain(`src/Contexts/${context}`);
      }
    }
  });

  it('carries the whole contract: every rule, and the vocabulary it is read with', () => {
    expect(generated.rules.map(rule => rule.id)).toEqual(reference.rules.map(rule => rule.id));
    expect(generated.layers).toEqual(reference.layers);
    expect(generated.verbs.map(verb => verb.intent)).toEqual(reference.verbs.map(verb => verb.intent));
    expect(Object.keys(generated.modes)).toEqual(Object.keys(reference.modes));
    expect(read('conventions/architecture.yaml')).toContain('own.<Layer>');
  });

  it('is sound on its own terms: nothing it says points at a file it does not have', () => {
    expect(validateContract(generated, directory)).toEqual([]);
  });

  it('keeps only the concepts a copied file still shows, and their canonical files exist', () => {
    expect(generated.concepts.length).toBeGreaterThan(5);
    expect(generated.concepts.length).toBeLessThan(reference.concepts.length);
    for (const concept of generated.concepts) {
      for (const file of [...concept.canonical, ...concept.examples]) {
        expect(existsSync(join(directory, file))).toBe(true);
      }
    }
  });

  it('refuses a directory that is not empty', () => {
    expect(() => createApplication(directory, 'again', root)).toThrow(/not empty/);
  });
});
