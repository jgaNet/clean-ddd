import { ContextLink } from './domain';
import { execFileSync } from 'child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

import {
  crossedRelationships,
  readChangedFiles,
  missingRelationshipTests,
  relationshipName,
  relationshipTestsThatMissTheChange,
  testTitles,
  touchesName,
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

  it('counts a contract the change touches, not one a changed file names on lines the change left alone (ADR 35)', () => {
    // J5, Full+ clean-3, request 78: a field added to one port's answer, and the wiring files that name every contract
    const wiring = [
      'const pricing: IListingPricing = new PricingListingPricing(pricingQueries);',
      'const ratings: IListingRatings = new ReviewsListingRatings(reviewQueries);',
      'const hosts: IHosts = new AccountsHosts(accountQueries);',
    ].join('\n');
    const all = [
      port('Accounts', 'Listings', 'Hosts'),
      port('Pricing', 'Listings', 'ListingPricing'),
      port('Reviews', 'Listings', 'ListingRatings'),
      event('Moderation', 'Listings', 'ReportUpheld'),
    ];
    const crossed = crossedRelationships(
      all,
      [
        {
          path: 'src/Contexts/Listings/module.local.ts',
          before: `${wiring}\nnew GetListingQueryHandler(listingQueries, pricing, ratings);`,
          text: `${wiring}\nnew GetListingQueryHandler(listingQueries, pricing, ratings, hosts);`,
        },
        {
          path: 'src/Contexts/Listings/Application/Queries/GetListing/GetListingQueryHandler.ts',
          before: 'constructor(private pricing: IListingPricing, private ratings: IListingRatings) {}',
          text: 'constructor(private pricing: IListingPricing, private ratings: IListingRatings, private hosts: IHosts) {}',
        },
        {
          path: 'src/Contexts/Listings/Application/Ports/IHosts.ts',
          before: 'export interface IHosts {\n  exists(id: string): Promise<boolean>;\n}',
          text: 'export interface IHosts {\n  exists(id: string): Promise<boolean>;\n  traderOf(id: string): Promise<Trader | null>;\n}',
        },
        {
          path: 'src/Contexts/Listings/Application/Events/ReportUpheldIntegrationEventHandler.spec.ts',
          before: '',
          text: 'class FakeRatings implements IListingRatings {}',
        },
      ],
      contract,
    );
    expect(crossed.map(relationshipName)).toEqual(['Accounts → Listings']);
  });

  it('counts the file whose job is the contract, even where the lines it changed do not name it', () => {
    const crossed = crossedRelationships(
      links,
      [
        {
          path: 'src/Contexts/Moderation/Application/Events/MessageReportedIntegrationEventHandler.ts',
          before: 'class H extends EventHandler<MessageReportedIntegrationEvent> {\n  id = Id.generate();\n}',
          text: 'class H extends EventHandler<MessageReportedIntegrationEvent> {\n  id = event.payload.reportId;\n}',
        },
        {
          path: 'src/Contexts/Reviews/Application/Events/ReviewReportedHandler.ts',
          before: 'ReviewReportedIntegrationEvent.set({\n  reportId: review.id,\n})',
          text: 'ReviewReportedIntegrationEvent.set({\n  reportId: report.id,\n})',
        },
        {
          path: 'src/Contexts/Moderation/Infrastructure/AccountsAdministrators.ts',
          before: 'export class AccountsAdministrators implements IAdministrators {\n  a() {}\n}',
          text: 'export class AccountsAdministrators implements IAdministrators {\n  b() {}\n}',
        },
      ],
      contract,
    );
    expect(crossed.map(relationshipName)).toEqual([
      'Messaging → Moderation',
      'Reviews → Moderation',
      'Accounts → Moderation',
    ]);
  });

  it('reads a mention the change wrote or removed, and every mention of a file whose base is unknown', () => {
    expect(touchesName({ path: 'a', before: 'f(a: IHosts)', text: 'f(a: IHosts, b: IPricing)' }, 'IHosts')).toBe(false);
    expect(touchesName({ path: 'a', before: 'f(a: IHosts)', text: 'f(a: IHosts, b: IPricing)' }, 'IPricing')).toBe(
      true,
    );
    expect(touchesName({ path: 'a', before: 'x: IHostsReader', text: 'x: IHosts' }, 'IHosts')).toBe(true);
    expect(touchesName({ path: 'a', text: 'x: IHosts' }, 'IHosts')).toBe(true);
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

describe('the changed files, read at the base (ADR 35)', () => {
  const git = (cwd: string, ...args: string[]) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: 'pipe' });
  it('reads each file now and where the change forked from, an added file as empty, a deleted one not at all', () => {
    const root = mkdtempSync(join(tmpdir(), 'relationship-files-'));
    try {
      git(root, 'init', '-q');
      writeFileSync(join(root, 'kept.ts'), 'before\n');
      writeFileSync(join(root, 'gone.ts'), 'x\n');
      git(root, 'add', '-A');
      git(root, '-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-qm', 'base');
      const base = git(root, 'rev-parse', 'HEAD').trim();
      writeFileSync(join(root, 'kept.ts'), 'after\n');
      writeFileSync(join(root, 'added.ts'), 'new\n');
      rmSync(join(root, 'gone.ts'));
      const files = readChangedFiles(root, ['kept.ts', 'added.ts', 'gone.ts'], base);
      expect(files).toEqual([
        { path: 'kept.ts', text: 'after\n', before: 'before\n' },
        { path: 'added.ts', text: 'new\n', before: '' },
      ]);
      expect(readChangedFiles(root, ['kept.ts'], 'working')[0].before).toBe('before\n');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
