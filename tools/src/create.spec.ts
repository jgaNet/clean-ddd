import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

import {
  checkConventions,
  createApplication,
  loadArchitectureContract,
  loadDomainMap,
  referenceSource,
  repositoryRoot,
  shown,
  validateContract,
  validateDomainMap,
} from './index';

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
  expect(referenceSource(root)).toBe(root);
  const generated = loadArchitectureContract(directory);
  const read = (path: string) => readFileSync(join(directory, path), 'utf8');

  afterAll(() => rmSync(directory, { recursive: true, force: true }));

  it('copies the architecture, the shared kernel and the tooling, and writes the documents', () => {
    for (const path of [
      'src/Architecture/Domain/AggregateRoot.ts',
      'src/Architecture/Application/CommandHandler.ts',
      'src/SharedKernel/Domain/Email.ts',
      'eslint.config.js',
      'jest.config.js',
      'tsconfig.json',
      'conventions/architecture.yaml',
      'conventions/concepts.yaml',
      'conventions/typescript.yaml',
      '.claude/skills/feature/SKILL.md',
      '.claude/agents/feature-author.md',
      'README.md',
      'CLAUDE.md',
      'package.json',
      '.gitignore',
    ]) {
      expect(existsSync(join(directory, path))).toBe(true);
    }
    expect(created.files).toBeGreaterThan(50);
  });

  it('keeps the building blocks’ specs, which describe them, and depends on the tool instead of copying it', () => {
    expect(existsSync(join(directory, 'src/Architecture/Application/CommandHandler.spec.ts'))).toBe(true);
    expect(existsSync(join(directory, 'tools'))).toBe(false);
    const pkg = JSON.parse(read('package.json'));
    expect(pkg.scripts).toMatchObject({
      architecture: 'clean-ddd',
      'check:conventions': 'clean-ddd check',
      'conventions:write': 'clean-ddd check --write',
    });
    expect(pkg.devDependencies['clean-ddd']).toMatch(/^\^\d+\.\d+\.\d+/);
    // jest.config.js, copied verbatim, loads dotenv; the helpers tsconfig asks for come from tslib.
    expect(Object.keys(pkg.dependencies)).toEqual(['uuid', 'dotenv', 'tslib', 'fastify', '@fastify/cors']);
    expect(pkg.scripts['start:dev']).toContain('src/Bootstrap/Fastify/application.ts');
    expect(pkg.devDependencies.tsx).toBeDefined();
  });

  it('gives no business: the Tracker alone, and the composition root that serves it in place of the reference’s', () => {
    expect(generated.contexts).toEqual(['Tracker']);
    expect(readdirSync(join(directory, 'src/Contexts')).sort()).toEqual(['README.md', 'Tracker']);
    expect(read('src/Bootstrap/Fastify/createApplication.ts')).toBe(
      readFileSync(join(root, 'typescript/src/Bootstrap/Starter/createApplication.ts'), 'utf8'),
    );
    expect(existsSync(join(directory, 'src/Bootstrap/Fastify/createApplication.e2e.spec.ts'))).toBe(true);
    expect(existsSync(join(directory, 'src/Bootstrap/Starter'))).toBe(false);
    // The Tracker's own suite boots the reference's four contexts: it stays in the reference.
    expect(
      existsSync(join(directory, 'src/Contexts/Tracker/Presentation/API/REST/Routes/operation.routes.e2e.spec.ts')),
    ).toBe(false);
    expect(readdirSync(join(directory, 'src/SharedKernel/Application/IntegrationEvents')).sort()).toEqual([
      'README.md',
      'TrackerIntegrationEvents.ts',
    ]);
    // `src/Contexts/<Context>/...` stays: a checklist's placeholder is not a business. A named
    // context of this repository's business would be.
    for (const document of [
      'README.md',
      'CLAUDE.md',
      'conventions/architecture.yaml',
      'conventions/concepts.yaml',
      'conventions/typescript.yaml',
    ]) {
      for (const context of reference.contexts.filter(context => context !== 'Tracker')) {
        expect(read(document)).not.toContain(`src/Contexts/${context}`);
      }
    }
  });

  it('keeps the verb table’s grammar and none of this repository’s nouns', () => {
    const shapes = generated.verbs.map(verb => verb.shape);
    expect(shapes).toContain('GET /<things>/:id');
    expect(shapes).toContain('POST /<things>');
    expect(shapes).toContain('POST /<things>/:id/<action>');
    expect(shapes).toContain('PUT /<things>/:id/<part>');
    // Every shape still says a verb and a path, and no shape says "notes" or "notifications".
    for (const verb of generated.verbs) {
      expect(verb.shape).toMatch(/^[A-Z]+ \//);
      expect(verb.shape.toLowerCase()).not.toMatch(/note|notification|account|auth|bookmark|tag/);
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

  it('starts with a context map that describes the Tracker and a place for storms, so the cross-context rule holds from the first feature', () => {
    const map = loadDomainMap(directory);
    expect(map).toMatchObject({ name: 'my-app', relationships: [] });
    expect(map!.subdomains).toEqual([expect.objectContaining({ kind: 'generic', contexts: ['Tracker'] })]);
    expect(map!.contexts.map(context => context.id)).toEqual(['Tracker']);
    expect(validateDomainMap(map!, [generated], directory)).toEqual([]);
    expect(read('conventions/storms/README.md')).toContain('../../.claude/skills/storm/SKILL.md');
    expect(existsSync(join(directory, '.claude/skills/storm/SKILL.md'))).toBe(true);
  });

  it('keeps every concept, shows only those a copied file still shows, and their canonical files exist', () => {
    expect(generated.concepts.map(concept => concept.id)).toEqual(reference.concepts.map(concept => concept.id));
    const displayed = generated.concepts.filter(shown);
    expect(displayed.length).toBeGreaterThan(5);
    expect(displayed.length).toBeLessThan(reference.concepts.filter(shown).length);
    expect(created.concepts).toBe(displayed.length);
    for (const concept of generated.concepts) {
      for (const file of [...concept.canonical, ...concept.examples]) {
        expect(existsSync(join(directory, file))).toBe(true);
      }
    }
  });

  it("is a repository of one language: the binding's root is the application itself", () => {
    expect(generated.language).toEqual({ id: 'typescript', name: 'TypeScript', root: '.' });
    expect(generated.languages).toEqual(['typescript']);
    expect(generated.architecture.path).toBe('src/Architecture');
    expect(read('eslint.config.js')).toBe(readFileSync(join(root, 'typescript/eslint.config.js'), 'utf8'));
  });

  it('refuses a directory that is not empty', () => {
    expect(() => createApplication(directory, 'again', root)).toThrow(/not empty/);
  });
});

describe('yarn architecture create --language python', () => {
  const directory = mkdtempSync(join(tmpdir(), 'created-py-'));
  const created = createApplication(directory, 'my-app', root, 'python');
  const generated = loadArchitectureContract(directory, 'python');
  const read = (path: string) => readFileSync(join(directory, path), 'utf8');

  afterAll(() => rmSync(directory, { recursive: true, force: true }));

  it('copies the building blocks, the shared kernel, the conventions tool and the configuration, in Python', () => {
    expect(created.language).toBe('python');
    for (const path of [
      'src/architecture/domain/aggregate_root.py',
      'src/architecture/application/command_handler.py',
      'src/architecture/domain/test_result.py',
      'src/shared_kernel/domain/email.py',
      'src/shared_kernel/application/guards.py',
      'src/shared_kernel/application/integration_events/__init__.py',
      'src/shared_kernel/application/integration_events/README.md',
      'src/contexts/__init__.py',
      'src/contexts/README.md',
      'tools/conventions.py',
      'pyproject.toml',
      '.python-version',
      'conventions/python.yaml',
      'docs/inventory/python.json',
      'README.md',
      'CLAUDE.md',
    ]) {
      expect(existsSync(join(directory, path))).toBe(true);
    }
    expect(existsSync(join(directory, 'tools/test_conventions.py'))).toBe(false);
    expect(existsSync(join(directory, 'package.json'))).toBe(false);
  });

  it('writes a pyproject renamed and narrowed to what the copied files import, and the Tracker’s lines of the inventory', () => {
    const pyproject = read('pyproject.toml');
    expect(pyproject).toContain('name = "my-app"');
    expect(pyproject).toContain('version = "0.1.0"');
    const dependencies = pyproject.match(/^dependencies = \[\n([\s\S]*?)^\]/m)?.[1] ?? '';
    for (const kept of ['fastapi', 'pyyaml', 'uvicorn']) expect(dependencies).toContain(`"${kept}`);
    expect(pyproject).not.toContain('bcrypt');
    expect(pyproject).toContain('[dependency-groups]');
    const inventory = JSON.parse(read('docs/inventory/python.json'));
    expect(inventory.contexts.map((context: { id: string }) => context.id)).toEqual(['Tracker']);
    expect(inventory.links).toEqual([]);
    expect(generated.contexts).toEqual(['Tracker']);
    expect(existsSync(join(directory, 'src/contexts/notes'))).toBe(false);
  });

  it('holds its context map to the links its own tool writes in the inventory: CTX-MAP-DECLARED outside TypeScript', async () => {
    expect((await checkConventions(directory)).problems).toEqual([]);

    const inventory = read('docs/inventory/python.json');
    const map = read('conventions/domain.yaml');
    try {
      // A link the code carries (as the Python tool reports it) and the map does not declare.
      const linked = JSON.parse(inventory);
      linked.links = [
        { mechanism: 'integration-event', upstream: 'Notes', downstream: 'Notifications', contracts: ['NoteShared'] },
      ];
      writeFileSync(join(directory, 'docs/inventory/python.json'), `${JSON.stringify(linked, null, 2)}\n`);
      expect((await checkConventions(directory)).problems).toContainEqual(
        expect.stringMatching(
          /^CTX-MAP-DECLARED: docs\/inventory\/python\.json makes Notifications depend on Notes over an integration-event \(NoteShared\), a relationship conventions\/domain\.yaml does not declare/,
        ),
      );
    } finally {
      writeFileSync(join(directory, 'docs/inventory/python.json'), inventory);
      writeFileSync(join(directory, 'conventions/domain.yaml'), map);
    }
  });

  it('stays green when its first context of its own is declared beside the Tracker', async () => {
    const binding = read('conventions/python.yaml');
    const map = read('conventions/domain.yaml');
    const readme = read('README.md');
    try {
      expect(binding).toContain('\ncontexts:\n  - Tracker\n');
      writeFileSync(
        join(directory, 'conventions/python.yaml'),
        binding.replace('\ncontexts:\n  - Tracker\n', '\ncontexts:\n  - Tracker\n  - Notes\n'),
      );
      writeFileSync(
        join(directory, 'conventions/domain.yaml'),
        map
          .replace(
            '\nsubdomains:\n',
            '\nsubdomains:\n  - { id: notes, name: Notes, kind: core, why: what it is for, contexts: [Notes] }\n',
          )
          .replace('\ncontexts:\n', '\ncontexts:\n  - { id: Notes, purpose: the notes, language: [] }\n'),
      );
      expect((await checkConventions(directory, true)).problems).toEqual([]);
      expect((await checkConventions(directory)).problems).toEqual([]);
      expect(read('README.md')).toContain('| Domain |');
    } finally {
      writeFileSync(join(directory, 'conventions/python.yaml'), binding);
      writeFileSync(join(directory, 'conventions/domain.yaml'), map);
      writeFileSync(join(directory, 'README.md'), readme);
    }
  });

  it('is a repository of one language, sound on its own terms, whose guides speak Python', () => {
    expect(generated.language).toEqual({ id: 'python', name: 'Python', root: '.' });
    expect(generated.contexts).toEqual(['Tracker']);
    expect(validateContract(generated, directory)).toEqual([]);
    expect(read('README.md')).toContain('uv sync');
    expect(read('README.md')).toContain('npx clean-ddd check');
    expect(read('CLAUDE.md')).toContain('module_local.py');
    expect(read('CLAUDE.md')).not.toContain('yarn ');
    expect(read('src/contexts/README.md')).toContain('`module_local.py`');
  });

  it('refuses a language whose binding says nothing about create', () => {
    // The repository's conventions, with the Go binding's create section removed.
    const bare = mkdtempSync(join(tmpdir(), 'bare-'));
    mkdirSync(join(bare, 'conventions'), { recursive: true });
    for (const file of ['architecture.yaml', 'concepts.yaml', 'go.yaml']) {
      const text = readFileSync(join(root, 'conventions', file), 'utf8');
      writeFileSync(join(bare, 'conventions', file), text.replace(/^create:\n(?:  .*\n)+/m, ''));
    }
    const empty = mkdtempSync(join(tmpdir(), 'created-none-'));
    expect(() => createApplication(empty, 'my-app', bare, 'go')).toThrow('says nothing about create yet');
    rmSync(empty, { recursive: true, force: true });
    rmSync(bare, { recursive: true, force: true });
  });
});

describe('yarn architecture create --language go', () => {
  const directory = mkdtempSync(join(tmpdir(), 'created-go-'));
  const created = createApplication(directory, 'my-app', root, 'go');
  const generated = loadArchitectureContract(directory, 'go');
  const read = (path: string) => readFileSync(join(directory, path), 'utf8');

  afterAll(() => rmSync(directory, { recursive: true, force: true }));

  it('copies the building blocks, the shared kernel, the conventions tool and the configuration, in Go', () => {
    expect(created.language).toBe('go');
    for (const path of [
      'architecture/domain/aggregate_root.go',
      'architecture/domain/result_test.go',
      'sharedkernel/domain/email.go',
      'sharedkernel/application/guards.go',
      'sharedkernel/application/integrationevents/doc.go',
      'sharedkernel/application/integrationevents/README.md',
      'contexts/README.md',
      'tools/conventions/main.go',
      'go.mod',
      'go.sum',
      '.golangci.yml',
      'conventions/go.yaml',
      'docs/inventory/go.json',
    ]) {
      expect(existsSync(join(directory, path))).toBe(true);
    }
    expect(existsSync(join(directory, 'sharedkernel/application/integrationevents/note_integration_events.go'))).toBe(
      false,
    );
    // The Tracker, the transport and the composition a project starts from, in place of the reference's (ADR 27).
    expect(generated.contexts).toEqual(['Tracker']);
    expect(existsSync(join(directory, 'contexts/tracker'))).toBe(true);
    expect(existsSync(join(directory, 'contexts/notes'))).toBe(false);
    expect(existsSync(join(directory, 'bootstrap/transport/server.go'))).toBe(true);
    expect(read('bootstrap/create_application.go')).toBe(
      readFileSync(join(root, 'go/bootstrap/starter/create_application.go'), 'utf8')
        .split('"clean-ddd/')
        .join('"my-app/'),
    );
    expect(existsSync(join(directory, 'bootstrap/starter'))).toBe(false);
  });

  it('is a module named after the application: go.mod, every import, every alias of the binding', () => {
    const goMod = read('go.mod');
    expect(goMod).toMatch(/^module my-app$/m);
    expect(goMod).toContain('github.com/google/uuid');
    expect(goMod).toContain('gopkg.in/yaml.v3');
    expect(goMod).not.toContain('modernc.org/sqlite');
    expect(goMod).not.toContain('// indirect');
    expect(read('architecture/application/command_handler.go')).toContain('"my-app/architecture/domain"');
    expect(read('sharedkernel/application/guards.go')).not.toContain('"clean-ddd/');
    expect(generated.architecture).toEqual({ alias: 'my-app/architecture', path: 'architecture' });
    expect(generated.contextsTree.alias).toBe('my-app/contexts');
    expect(read('conventions/go.yaml')).toContain('module: my-app');
  });

  it('is sound on its own terms, with guides in Go words', () => {
    expect(generated.language).toEqual({ id: 'go', name: 'Go', root: '.' });
    expect(validateContract(generated, directory)).toEqual([]);
    expect(read('README.md')).toContain('go mod tidy');
    expect(read('CLAUDE.md')).toContain('module.go');
  });
});

describe('yarn architecture create --language rust', () => {
  const directory = mkdtempSync(join(tmpdir(), 'created-rs-'));
  const created = createApplication(directory, 'my-app', root, 'rust');
  const generated = loadArchitectureContract(directory, 'rust');
  const read = (path: string) => readFileSync(join(directory, path), 'utf8');

  afterAll(() => rmSync(directory, { recursive: true, force: true }));

  it('copies the crates of the building blocks, the shared kernel and the tool, and the configuration', () => {
    expect(created.language).toBe('rust');
    for (const path of [
      'src/architecture/domain/Cargo.toml',
      'src/architecture/domain/src/lib.rs',
      'src/architecture/presentation/Cargo.toml',
      'src/shared_kernel/domain/src/email.rs',
      'src/shared_kernel/application/src/guards.rs',
      'src/shared_kernel/application/src/integration_events/mod.rs',
      'src/shared_kernel/application/src/integration_events/README.md',
      'src/contexts/README.md',
      'tools/conventions/src/main.rs',
      'Cargo.toml',
      'Cargo.lock',
      'rustfmt.toml',
      'conventions/rust.yaml',
      'docs/inventory/rust.json',
    ]) {
      expect(existsSync(join(directory, path))).toBe(true);
    }
    expect(
      existsSync(join(directory, 'src/shared_kernel/application/src/integration_events/note_integration_events.rs')),
    ).toBe(false);
    // The Tracker, the transport and the composition a project starts from; not the reference's (ADR 27).
    expect(generated.contexts).toEqual(['Tracker']);
    expect(existsSync(join(directory, 'src/contexts/tracker/application/Cargo.toml'))).toBe(true);
    expect(existsSync(join(directory, 'src/contexts/notes'))).toBe(false);
    expect(existsSync(join(directory, 'src/bootstrap/transport/Cargo.toml'))).toBe(true);
    expect(existsSync(join(directory, 'src/bootstrap/starter/tests/create_application.rs'))).toBe(true);
    expect(existsSync(join(directory, 'src/bootstrap/src'))).toBe(false);
  });

  it('writes a workspace of the copied crates and the dependencies they use, and a contracts module of the copied contract', () => {
    const cargo = read('Cargo.toml');
    expect(cargo).toContain(
      'members = ["src/architecture/*", "src/shared_kernel/*", "src/contexts/*/*", "src/bootstrap/*", "tools/*"]',
    );
    expect(cargo).toContain('version = "0.1.0"');
    expect(cargo).toContain('uuid = ');
    expect(cargo).toContain('axum = ');
    expect(cargo).not.toContain('rusqlite');
    expect(cargo).not.toContain('bcrypt');
    expect(cargo).toContain('[workspace.lints.clippy]');
    const contracts = read('src/shared_kernel/application/src/integration_events/mod.rs');
    expect(contracts).toContain('//!');
    expect(contracts.match(/pub mod \w+;/g)).toEqual(['pub mod tracker_integration_events;']);
  });

  it('is sound on its own terms, with guides in Rust words', () => {
    expect(generated.language).toEqual({ id: 'rust', name: 'Rust', root: '.' });
    expect(validateContract(generated, directory)).toEqual([]);
    expect(read('README.md')).toContain('cargo build');
    expect(read('CLAUDE.md')).toContain('cargo run -p conventions');
  });
});
