import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

import {
  checkConventions,
  checkExpectedStorm,
  checkInventoryAgainstPublishedLanguage,
  loadPublishedLanguage,
  contractUnder,
  createApplication,
  describeInventory,
  inspectEventStorm,
  inspectInventory,
  loadArchitectureContract,
  loadDomainMap,
  loadExpectedStorm,
  oneHandlerProblems,
  profileOf,
  profilesHeldBy,
  profileTriggers,
  referenceSource,
  repositoryRoot,
  shown,
  validateContract,
  validateDomainMap,
  validateExpectedStorm,
} from './index';
import { addLiteTasks } from './lite-tasks.spec-helper';

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
/** The guide an application starts with (RFC 0005, D4): it is read at every request. */
const GUIDE_BUDGET_BYTES = 12 * 1024;
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

  it('writes a guide within its budget, every rule it states held or marked review (RFC 0005, D4)', () => {
    const guide = read('CLAUDE.md');
    expect(Buffer.byteLength(guide)).toBeLessThanOrEqual(GUIDE_BUDGET_BYTES);
    // Every bullet of the rules and of the things to avoid names its rule and how it is held.
    const bullets = (heading: string) =>
      guide
        .split(`## ${heading}`)[1]
        .split('\n## ')[0]
        .split(/\n(?! {2})/)
        .map(bullet => bullet.replace(/\n {2}/g, ' '))
        .filter(bullet => bullet.startsWith('- '));
    for (const line of [...bullets('The rules (enforced)'), ...bullets('Things to avoid')])
      expect(line).toMatch(/\*\([^)]*; (linter|check|types|tests|review|evaluations)\)\*$|\(the feature mode; check\)/);
    // The rules about the reference itself are not an application's.
    expect(guide).not.toContain('(ARCH-ONE-CONTRACT;');
    expect(guide).not.toContain('(ARCH-COMPAT-ROUTE;');
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

  it('starts with the published language of the Tracker, which its tree carries field for field (ADR 44)', () => {
    const published = loadPublishedLanguage(directory)!;
    expect(read('conventions/integration-events.yaml')).toMatch(/^# The published language \(ADR 44 of the reference,/);
    expect(published.events.map(event => [event.name, event.publisher])).toEqual([['OperationComplete', 'Tracker']]);
    const inventory = inspectInventory(generated, directory);
    expect(inventory.integrationEvents).toEqual([
      {
        name: 'OperationComplete',
        publisher: 'Tracker',
        payload: {
          error: 'string?',
          operationId: 'string',
          result: 'any?',
          status: 'string',
          type: 'string',
          userId: 'string',
        },
      },
    ]);
    expect(checkInventoryAgainstPublishedLanguage(published, inventory)).toEqual([]);
  });

  it('refuses a payload field changed in the tree and not in the published language: the probe of CTX-PUBLISHED-LANGUAGE', () => {
    const path = 'src/SharedKernel/Application/IntegrationEvents/TrackerIntegrationEvents.ts';
    const text = read(path);
    try {
      writeFileSync(
        join(directory, path),
        text.replace('  error?: string;', '  reason?: string;').replace('  userId: string;', '  userId: number;'),
      );
      expect(
        checkInventoryAgainstPublishedLanguage(
          loadPublishedLanguage(directory)!,
          inspectInventory(generated, directory),
        ),
      ).toEqual([
        "CTX-PUBLISHED-LANGUAGE: typescript: OperationComplete's payload is not version 1 of conventions/integration-events.yaml: error (string?) is missing; userId is number, declared string; reason (string?) is not declared",
      ]);
    } finally {
      writeFileSync(join(directory, path), text);
    }
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

  it('holds the payloads its own tool writes in the inventory to the published language: CTX-PUBLISHED-LANGUAGE outside TypeScript', async () => {
    expect(read('conventions/integration-events.yaml')).toContain('OperationComplete:');
    const inventory = read('docs/inventory/python.json');
    try {
      const changed = JSON.parse(inventory);
      changed.integrationEvents[0].payload.kind = changed.integrationEvents[0].payload.type;
      delete changed.integrationEvents[0].payload.type;
      writeFileSync(join(directory, 'docs/inventory/python.json'), `${JSON.stringify(changed, null, 2)}\n`);
      expect(
        (await checkConventions(directory)).problems.filter(problem => problem.startsWith('CTX-PUBLISHED-LANGUAGE')),
      ).toEqual([
        "CTX-PUBLISHED-LANGUAGE: python: OperationComplete's payload is not version 1 of conventions/integration-events.yaml: type (string) is missing; kind (string) is not declared",
      ]);
    } finally {
      writeFileSync(join(directory, 'docs/inventory/python.json'), inventory);
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

describe('yarn architecture create --profile lite', () => {
  const directory = mkdtempSync(join(tmpdir(), 'created-lite-'));
  const created = createApplication(directory, 'my-lite-app', root, undefined, 'lite');
  const read = (path: string) => readFileSync(join(directory, path), 'utf8');
  const generated = () => loadArchitectureContract(directory);

  afterAll(() => rmSync(directory, { recursive: true, force: true }));

  it('holds its contexts to Lite in its binding, with the Lite building blocks and a composition root that starts with no context', () => {
    expect(created).toMatchObject({ language: 'typescript', profile: 'lite', contexts: [] });
    expect(generated().bindingProfile).toBe('lite');
    expect(read('conventions/typescript.yaml')).toMatch(/^default_profile: lite$/m);
    for (const path of [
      'src/Architecture/Application/Lite/UseCase.ts',
      'src/Architecture/Application/Lite/UseCase.spec.ts',
      'src/Architecture/Application/Lite/LiteModule.ts',
      'src/Architecture/Presentation/Lite/AnswerAtOnce.ts',
      'src/Architecture/Application/Outbox.ts',
      'src/Architecture/Application/DomainEvents.ts',
      'src/Bootstrap/Fastify/FastifyApplication.ts',
      'src/Bootstrap/Fastify/createApplication.e2e.spec.ts',
      'src/SharedKernel/Application/Guards.ts',
    ]) {
      expect(existsSync(join(directory, path))).toBe(true);
    }
    expect(read('src/Bootstrap/Fastify/createApplication.ts')).toBe(
      readFileSync(join(root, 'typescript/src/Bootstrap/LiteStarter/createApplication.ts'), 'utf8'),
    );
    // No operation to follow: no Tracker, no contract of its own, no starter of the reference's.
    expect(readdirSync(join(directory, 'src/Contexts'))).toEqual(['README.md']);
    expect(readdirSync(join(directory, 'src/SharedKernel/Application/IntegrationEvents'))).toEqual(['README.md']);
    expect(read('conventions/integration-events.yaml')).toMatch(/\nevents: \{\}\n$/);
    expect(existsSync(join(directory, 'src/Bootstrap/LiteStarter'))).toBe(false);
    expect(read('conventions/typescript.yaml')).not.toMatch(/LiteStarter|src\/Contexts\/Notes/);
    expect(
      generated()
        .create!.copy.map(entry => entry.to)
        .filter(path => /Tracker/.test(path)),
    ).toEqual([]);
    expect(read('CLAUDE.md')).toMatch(/held to the Lite profile/);
    expect(read('CLAUDE.md')).toMatch(/answerAtOnce\(\)/);
    expect(read('README.md')).toMatch(/\*\*Lite\*\* profile/);
  });

  it('is sound on its own terms, and answers for Lite: its checklists, its grammar with no noun of the reference', () => {
    const contract = generated();
    expect(validateContract(contract, directory)).toEqual([]);
    expect(profilesHeldBy(contract)).toEqual(['full', 'lite']);
    const asLite = contractUnder(contract, 'lite');
    expect(asLite.checklists.find(each => each.kind === 'command')!.place).toBe(
      'src/Contexts/<Context>/Application/<Things>.ts',
    );
    expect(asLite.verbs.find(verb => verb.intent === 'create')).toMatchObject({ shape: 'POST /<things>' });
    for (const verb of asLite.verbs) expect(verb.shape.toLowerCase()).not.toMatch(/note|notification|account/);
  });

  describe('with a context of its own, held to Lite', () => {
    beforeAll(() => addLiteTasks(directory));

    it('holds the context to Lite by the binding’s default, and the profile check passes', () => {
      const contract = generated();
      expect(contract.contexts).toEqual(['Tasks']);
      expect(profileOf(contract, 'Tasks')).toBe('lite');
      expect(validateContract(contract, directory)).toEqual([]);
      expect(validateDomainMap(loadDomainMap(directory)!, [contract], directory)).toEqual([]);
    });

    it('declares the fact it tells in the published language, which started empty, and carries it field for field', () => {
      const inventory = inspectInventory(generated(), directory);
      expect(inventory.integrationEvents).toEqual([
        { name: 'TaskCompleted', publisher: 'Tasks', payload: { ownerId: 'string', taskId: 'string' } },
      ]);
      expect(checkInventoryAgainstPublishedLanguage(loadPublishedLanguage(directory)!, inventory)).toEqual([]);
    });

    it('reads its use cases: commands answered at once with their route, their caller and what they publish; its query', () => {
      const inventory = inspectInventory(generated(), directory);
      expect(inventory.contexts).toEqual([
        {
          id: 'Tasks',
          commands: [
            {
              name: 'AddTask',
              actor: 'a signed-in account',
              route: 'POST /tasks',
              events: [],
              answered: 'at-once',
            },
            {
              name: 'CompleteTask',
              actor: 'a signed-in account',
              route: 'POST /tasks/{param}/complete',
              events: [],
              answered: 'at-once',
              publishes: ['TaskCompleted'],
            },
          ],
          queries: [{ name: 'ListMyTasks', actor: 'a signed-in account', route: 'GET /tasks' }],
          events: [],
          policies: [],
        },
      ]);
      expect(describeInventory(inventory)).toMatch(/CompleteTask .*publishes TaskCompleted; answered at once/);
    });

    it('reads who may call a use case from where it is defined: anyone only where it says so (ADR 43)', () => {
      const file = join(directory, 'src/Contexts/Tasks/Application/Tasks.ts');
      const text = read('src/Contexts/Tasks/Application/Tasks.ts');
      try {
        writeFileSync(file, text.replace(/\n\);\n$/, "\n  { caller: 'anyone' },\n);\n"));
        const queries = inspectInventory(generated(), directory).contexts[0].queries;
        expect(queries).toEqual([{ name: 'ListMyTasks', actor: 'anyone', route: 'GET /tasks' }]);
      } finally {
        writeFileSync(file, text);
      }
    });

    it('fires the triggers its code meets, and no other: the outbox for what it tells, no bus for what it answers at once', () => {
      const contract = generated();
      expect(profileTriggers(contract, inspectInventory(contract, directory))).toEqual([
        {
          context: 'Tasks',
          profile: 'lite',
          trigger: 'publishes-integration-event',
          rules: ['EVENT-AFTER-COMMIT'],
          mechanisms: [],
        },
      ]);
    });

    it('holds ARCH-ONE-HANDLER on its wiring: each use case listed once, every route calling one it lists', () => {
      const contract = generated();
      expect(oneHandlerProblems(inspectEventStorm(contract, directory))).toEqual([]);
      const wiring = read('src/Contexts/Tasks/module.local.ts');
      try {
        writeFileSync(
          join(directory, 'src/Contexts/Tasks/module.local.ts'),
          wiring
            .replace('completeTask(taskStore, systemClock), ', '')
            .replace(
              'addTask(taskStore, systemClock)',
              'addTask(taskStore, systemClock), addTask(taskStore, systemClock)',
            ),
        );
        expect(oneHandlerProblems(inspectEventStorm(contract, directory))).toEqual([
          'ARCH-ONE-HANDLER: Tasks: command AddTask has 2 handlers (addTask, addTask); a command has exactly one',
          'ARCH-ONE-HANDLER: Tasks: command CompleteTask is built by a route and no handler in the Module answers it',
        ]);
      } finally {
        writeFileSync(join(directory, 'src/Contexts/Tasks/module.local.ts'), wiring);
      }
    });

    it('holds an expected storm written in Lite’s words, and refuses one that brings a command bus in silently', () => {
      const contract = generated();
      const inventory = inspectInventory(contract, directory);
      const storm = (answered: string) =>
        [
          'schemaVersion: 1',
          'feature: rename-a-task',
          'intent: The owner of a task renames it.',
          'done: false',
          'contexts:',
          '  - id: Tasks',
          '    commands:',
          '      - name: RenameTask',
          '        actor: a signed-in account',
          '        route: PUT /tasks/{param}',
          '        events: []',
          ...(answered ? [`        answered: ${answered}`] : []),
          '    queries: []',
          '    events: []',
          '    policies: []',
          'links: []',
          '',
        ].join('\n');
      const file = 'conventions/storms/rename-a-task.yaml';
      try {
        writeFileSync(join(directory, file), storm('at-once'));
        const expected = loadExpectedStorm(file, directory);
        expect(validateExpectedStorm(expected, contract, inventory, directory)).toEqual([]);
        expect(checkExpectedStorm(expected, inventory)).toEqual([]);
        writeFileSync(join(directory, file), storm(''));
        expect(validateExpectedStorm(loadExpectedStorm(file, directory), contract, inventory, directory)).toEqual([
          expect.stringMatching(
            /command "RenameTask": Tasks is held to Lite, whose commands are answered at once .*command-answered-later\), by an ADR/,
          ),
        ]);
      } finally {
        rmSync(join(directory, file), { force: true });
      }
    });
  });
});

describe('yarn architecture create --profile, where a language does not hold the profile', () => {
  it('refuses it with the gap its binding reports, and refuses a profile the contract does not declare', () => {
    for (const language of ['python', 'go', 'rust']) {
      const empty = mkdtempSync(join(tmpdir(), `created-lite-${language}-`));
      expect(() => createApplication(empty, 'my-app', root, language, 'lite')).toThrow(
        /does not hold the Lite profile: .* \(Lite: not held, a gap of this language; ADR 40\)/,
      );
      expect(readdirSync(empty)).toEqual([]);
      rmSync(empty, { recursive: true, force: true });
    }
    const empty = mkdtempSync(join(tmpdir(), 'created-heavy-'));
    expect(() => createApplication(empty, 'my-app', root, undefined, 'heavy')).toThrow(/no profile "heavy"/);
    // Naming the default is the default.
    expect(createApplication(empty, 'my-app', root, undefined, 'full').profile).toBeUndefined();
    rmSync(empty, { recursive: true, force: true });
  });
});
