import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

import {
  ArchitectureContract,
  checkConventions,
  createApplication,
  loadArchitectureContract,
  repositoryRoot,
  validateContract,
  waitsOutsideTransport,
} from './index';

/**
 * A migrated application keeps its behaviour and chooses the wire it answers on (ADR 36): the
 * binding's `migration` is held by the check (ARCH-COMPAT-ROUTE). The setting is tried on an
 * application `create` made in Python — a language whose tree this tooling does not read, so the
 * check asks the committed inventory (the Tracker's) and the files — and the scan for a wait
 * outside the transport on a TypeScript tree written for it.
 */

const root = repositoryRoot();

describe('ARCH-COMPAT-ROUTE: the wire a migrated application answers on', () => {
  const directory = mkdtempSync(join(tmpdir(), 'migrated-'));
  createApplication(directory, 'my-app', root, 'python');
  const bindingFile = join(directory, 'conventions/python.yaml');
  const binding = readFileSync(bindingFile, 'utf8');
  // The façade: a file under the transport. Its content is not read; where it is, is.
  const facade = 'src/bootstrap/compat/operations.py';
  mkdirSync(join(directory, 'src/bootstrap/compat'), { recursive: true });
  writeFileSync(join(directory, facade), '# the legacy route for an operation, bound to GetOperation\n');

  afterAll(() => rmSync(directory, { recursive: true, force: true }));
  afterEach(() => writeFileSync(bindingFile, binding));

  const declare = (yaml: string) => writeFileSync(bindingFile, `${binding}\n${yaml}`);
  const route = (fields: string) =>
    `    - { method: GET, path: '/legacy/operations/{id}', operation: GetOperation, ${fields} }`;
  const compat = (routes: string[]) =>
    declare(['migration:', '  api: compat', '  compatibility_routes:', ...routes].join('\n'));
  const problems = async () =>
    (await checkConventions(directory)).problems.filter(
      each => each.startsWith('ARCH-COMPAT-ROUTE') || each.includes(' migration'),
    );

  it('is green with no migration section: an application migrated from nothing', async () => {
    expect(await problems()).toEqual([]);
    expect(loadArchitectureContract(directory).migration).toBeUndefined();
  });

  it('accepts a compatibility route under compat, bound to an operation the inventory lists, under the transport, with a date', async () => {
    compat([route(`file: ${facade}, retires: 2999-01-01`)]);

    expect(await problems()).toEqual([]);
    // YAML reads a bare date as a Date; the binding means the day.
    expect(loadArchitectureContract(directory).migration).toEqual({
      api: 'compat',
      routes: [
        {
          method: 'GET',
          path: '/legacy/operations/{id}',
          operation: 'GetOperation',
          file: facade,
          retires: '2999-01-01',
        },
      ],
    });
  });

  it('accepts a retirement said in words, which it cannot hold and does not', async () => {
    compat([route(`file: ${facade}, retires: when the mobile application 3.x is out of support`)]);

    expect(await problems()).toEqual([]);
  });

  it('refuses a route bound to nothing the inventory lists', async () => {
    compat([`    - { method: POST, path: /users, operation: SignUp, file: ${facade}, retires: 2999-01-01 }`]);

    expect(await problems()).toEqual([
      expect.stringMatching(
        /^ARCH-COMPAT-ROUTE: conventions\/python\.yaml migration route POST \/users is bound to SignUp, which no context's inventory lists/,
      ),
    ]);
  });

  it('refuses a route served from outside the transport', async () => {
    compat([route('file: src/architecture/domain/result.py, retires: 2999-01-01')]);

    expect(await problems()).toEqual([
      expect.stringMatching(
        /^ARCH-COMPAT-ROUTE: .* is served from src\/architecture\/domain\/result\.py, outside the transport \(src\/bootstrap\)/,
      ),
    ]);
  });

  it('refuses a route whose file does not exist, and one that does not say when it retires', async () => {
    compat([
      `    - { method: GET, path: '/legacy/operations/{id}', operation: GetOperation, file: src/bootstrap/nowhere.py }`,
    ]);

    expect(await problems()).toEqual([
      expect.stringMatching(/names src\/bootstrap\/nowhere\.py, which does not exist$/),
      expect.stringMatching(/^ARCH-COMPAT-ROUTE: .* does not say when it retires/),
    ]);
  });

  it('refuses a route past its date, until it is removed or decided again', async () => {
    compat([route(`file: ${facade}, retires: 2020-01-01`)]);

    expect(await problems()).toEqual([
      expect.stringMatching(/^ARCH-COMPAT-ROUTE: .* was to retire on 2020-01-01; remove it, or decide again/),
    ]);
    // Held against the day it is asked for: the same route is fine the day before.
    expect(validateContract(loadArchitectureContract(directory), directory, '2019-12-31')).toEqual([]);
    expect(validateContract(loadArchitectureContract(directory), directory, '2020-01-02')).toHaveLength(1);
  });

  it('refuses any route under native: switching the wire is removing the routes', async () => {
    declare(
      ['migration:', '  api: native', '  compatibility_routes:', route(`file: ${facade}, retires: 2999-01-01`)].join(
        '\n',
      ),
    );

    expect(await problems()).toEqual([
      expect.stringMatching(/^ARCH-COMPAT-ROUTE: .* says api: native and still declares 1 compatibility route\(s\)/),
    ]);
  });

  it('refuses a wire the contract does not know, a method that is not HTTP, a path that is not one, and a route declared twice', async () => {
    declare(
      [
        'migration:',
        '  api: legacy',
        '  compatibility_routes:',
        `    - { method: FETCH, path: users, operation: GetOperation, file: ${facade}, retires: 2999-01-01 }`,
        `    - { method: FETCH, path: users, operation: GetOperation, file: ${facade}, retires: 2999-01-01 }`,
      ].join('\n'),
    );

    expect(await problems()).toEqual([
      expect.stringMatching(/"api" is legacy; conventions\/architecture\.yaml knows native, compat$/),
      expect.stringMatching(/"method" must be one of GET, POST, PUT, PATCH, DELETE$/),
      expect.stringMatching(/"path" must start with \/$/),
      expect.stringMatching(/"method" must be one of GET, POST, PUT, PATCH, DELETE$/),
      expect.stringMatching(/"path" must start with \/$/),
      expect.stringMatching(/is declared twice$/),
    ]);
  });
});

describe('ARCH-COMPAT-ROUTE: nothing outside the transport waits for an operation', () => {
  const tree = mkdtempSync(join(tmpdir(), 'waits-'));
  const contract = {
    language: { id: 'typescript', name: 'TypeScript', root: '.' },
    architecture: { alias: '@Architecture', path: 'src/Architecture' },
    bootstrap: { alias: '@Bootstrap', path: 'src/Bootstrap' },
    concepts: [{ id: 'awaited-operation', canonical: ['src/Architecture/Application/AwaitOperation.ts'] }],
  } as unknown as ArchitectureContract;
  const write = (file: string, text: string) => {
    mkdirSync(join(tree, file, '..'), { recursive: true });
    writeFileSync(join(tree, file), text);
  };

  beforeAll(() => {
    write(
      'src/Architecture/Application/AwaitOperation.ts',
      readFileSync(join(root, 'typescript/src/Architecture/Application/AwaitOperation.ts'), 'utf8'),
    );
    write('src/Architecture/Application/index.ts', "export * from './AwaitOperation';\n");
    // The façade may wait; a controller in a context, or anything in the shared kernel, may not; a spec may.
    write('src/Bootstrap/Compat/users.routes.ts', "import { awaitOperation } from '@Architecture/Application';\n");
    write(
      'src/Contexts/Notes/Presentation/LegacyNoteController.ts',
      "import { CommandHandler, awaitOperation } from '@Architecture/Application';\n",
    );
    write(
      'src/Contexts/Notes/Presentation/FastifyNoteController.ts',
      "import { CommandHandler, ExecutionContext } from '@Architecture/Application';\n",
    );
    write(
      'src/SharedKernel/Application/Waiting.ts',
      "import type { hasOutcome as settled } from '@Architecture/Application/AwaitOperation';\n",
    );
    write(
      'src/Contexts/Notes/Application/Commands/Helpers.spec.ts',
      "import { awaitOperation } from '@Architecture/Application';\n",
    );
  });
  afterAll(() => rmSync(tree, { recursive: true, force: true }));

  it('names the file and the import, through the barrel or the module, and leaves the transport, the building blocks and the specs alone', () => {
    expect(waitsOutsideTransport(contract, tree)).toEqual([
      "ARCH-COMPAT-ROUTE: src/Contexts/Notes/Presentation/LegacyNoteController.ts waits for an operation (awaitOperation); a command's route answers 202, and only a compatibility route in the transport (src/Bootstrap) waits",
      "ARCH-COMPAT-ROUTE: src/SharedKernel/Application/Waiting.ts waits for an operation (hasOutcome); a command's route answers 202, and only a compatibility route in the transport (src/Bootstrap) waits",
    ]);
  });

  it('finds nothing in the reference, whose contexts answer 202', () => {
    expect(waitsOutsideTransport(loadArchitectureContract(root), root)).toEqual([]);
  });

  it('says nothing for a language that does not show the concept yet', () => {
    expect(waitsOutsideTransport(loadArchitectureContract(root, 'go'), root)).toEqual([]);
  });
});
