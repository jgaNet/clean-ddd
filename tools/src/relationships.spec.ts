import { ContextLink } from './domain';
import { execFileSync } from 'child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

import {
  crossedRelationships,
  missingRelationshipTests,
  relationshipName,
  relationshipTestsThatMissTheChange,
  testTitles,
} from './relationships';
import { ArchitectureContract } from './types';

const contract = { contextsTree: { alias: '@Contexts', path: 'src/Contexts' } } as unknown as ArchitectureContract;
const event = (upstream: string, downstream: string, name: string): ContextLink => ({
  mechanism: 'integration-event',
  upstream,
  downstream,
  contracts: [name],
  evidence: [],
});
const port = (upstream: string, downstream: string, name: string): ContextLink => ({
  mechanism: 'owned-port',
  upstream,
  downstream,
  contracts: [name],
  evidence: [],
});
const links = [
  event('Messaging', 'Moderation', 'MessageReported'),
  event('Reviews', 'Moderation', 'ReviewReported'),
  port('Accounts', 'Moderation', 'Administrators'),
];

describe('the relationships a change crosses', () => {
  it('counts a downstream file that consumes the contract, and an upstream file that builds the event', () => {
    const crossed = crossedRelationships(
      links,
      [
        {
          path: 'src/Contexts/Moderation/Application/Events/MessageReportedIntegrationEventHandler.ts',
          text: 'class X extends EventHandler<MessageReportedIntegrationEvent> {}',
        },
        {
          path: 'src/Contexts/Reviews/Application/Events/ReviewReportedHandler.ts',
          text: 'publishIntegrationEvent(ReviewReportedIntegrationEvent.set({ reportId }), context);',
        },
      ],
      contract,
    );
    expect(crossed.map(relationshipName)).toEqual(['Messaging → Moderation', 'Reviews → Moderation']);
  });

  it('counts a port the downstream side adapts, and nothing a context says of a contract it does not take part in', () => {
    const crossed = crossedRelationships(
      links,
      [
        {
          path: 'src/Contexts/Moderation/Application/Ports/IAdministrators.ts',
          text: 'export interface IAdministrators {}',
        },
        { path: 'src/Contexts/Booking/Domain/Note.ts', text: '// MessageReportedIntegrationEvent is not ours' },
      ],
      contract,
    );
    expect(crossed.map(relationshipName)).toEqual(['Accounts → Moderation']);
  });

  it('asks each one crossed for a test changed with it, named for the pair', () => {
    const crossed = [links[0], links[1]];
    const missing = missingRelationshipTests(
      crossed,
      [
        {
          path: 'src/Bootstrap/Fastify/CrossContext/reports.e2e.spec.ts',
          text: "describe('Messaging → Moderation', () => {});",
        },
        { path: 'src/Contexts/Reviews/x.spec.ts', text: "describe('Reviews → Moderation', () => {});" },
      ],
      '.e2e.spec.ts',
    );
    expect(missing).toHaveLength(1);
    expect(missing[0]).toMatch(/^Reviews → Moderation \(ReviewReported\) is crossed by this change/);
  });
});

describe('a relationship test sees the change (ADR 34)', () => {
  const git = (cwd: string, ...args: string[]) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: 'pipe' });
  const test = 'app/src/pair.e2e.spec.ts';
  let root: string;
  let base: string;
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'relationship-spec-'));
    git(root, 'init', '-q');
    mkdirSync(join(root, 'app/src'), { recursive: true });
    writeFileSync(join(root, test), "describe('A → B', () => { it('finds the thing', () => {}); });\n");
    git(root, 'add', '-A');
    git(root, '-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-qm', 'base');
    base = git(root, 'rev-parse', 'HEAD').trim();
  });
  afterEach(() => rmSync(root, { recursive: true, force: true }));

  it('reads the titles of the cases a file declares', () => {
    expect(testTitles('it(\'one\', () => {}); test("two", () => {}); it(`three`, () => {});')).toEqual([
      'one',
      'two',
      'three',
    ]);
  });

  it('refuses a new case that passes at the base, and names it', () => {
    writeFileSync(join(root, test), readFileSync(join(root, test), 'utf8') + "it('keeps the report id', () => {});\n");
    const ran: string[] = [];
    const lines = relationshipTestsThatMissTheChange({
      root,
      base,
      tests: [test],
      run: 'jest {files}',
      languageRoot: 'app',
      exec: (command, cwd) => {
        ran.push(`${command} in ${cwd.endsWith('/app') ? 'the base' : cwd}`);
        expect(readFileSync(join(cwd, 'src/pair.e2e.spec.ts'), 'utf8')).toContain('keeps the report id');
        return { code: 0, output: '' };
      },
    });
    expect(ran).toEqual(['jest src/pair.e2e.spec.ts in the base']);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatch(/"keeps the report id"\) passes without the change/);
  });

  it('accepts a new case that fails at the base', () => {
    writeFileSync(join(root, test), readFileSync(join(root, test), 'utf8') + "it('keeps the report id', () => {});\n");
    const lines = relationshipTestsThatMissTheChange({
      root,
      base,
      tests: [test],
      run: 'jest {files}',
      languageRoot: 'app',
      exec: () => ({ code: 1, output: 'expected the report id' }),
    });
    expect(lines).toEqual([]);
  });

  it('runs nothing for a test that adds no case, and nothing against the working tree', () => {
    let calls = 0;
    const exec = () => {
      calls++;
      return { code: 0, output: '' };
    };
    // The same cases, the file rewritten around them.
    writeFileSync(join(root, test), readFileSync(join(root, test), 'utf8').replace('() => {}', '() => { /* */ }'));
    expect(
      relationshipTestsThatMissTheChange({ root, base, tests: [test], run: 'jest {files}', languageRoot: 'app', exec }),
    ).toEqual([]);
    expect(
      relationshipTestsThatMissTheChange({ root, base: 'working', tests: [test], run: 'x', languageRoot: 'app', exec }),
    ).toEqual([]);
    expect(calls).toBe(0);
  });
});
