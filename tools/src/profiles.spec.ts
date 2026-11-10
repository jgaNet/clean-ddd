import { execFileSync } from 'child_process';
import { copyFileSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { dump, load } from 'js-yaml';

import {
  ArchitectureContract,
  checkConventions,
  checkMode,
  contextProfileChanges,
  contextProfileChangesSince,
  END_MARKER,
  inspectContextLinks,
  inspectInventory,
  loadArchitectureContract,
  loadDomainMap,
  loadStrategicConcepts,
  Profile,
  profileMatrix,
  profileOf,
  renderDomain,
  renderedDocuments,
  repositoryRoot,
  Rule,
  stanceOf,
  TRIGGERS,
  triggerFires,
  validateContract,
  validateProfiles,
} from './index';

/**
 * Architecture profiles (ADR 40): the contract names them as data, and the conventions check holds them
 * to the validation contract of RFC 0002, §9 — P1 to P4 and P6 here, against the reference's contract
 * and against contracts changed in memory; P5, non-regression, at the end: Full's documents and the
 * gate's conventions verdict on the reference are the same with the profiles as without them.
 */

const root = repositoryRoot();
const reference = loadArchitectureContract(root);
const full = reference.profiles.find(profile => profile.id === 'full')!;

/** The reference's contract, with other profiles, another floor or a binding's per-context profiles. */
const variant = (change: Partial<ArchitectureContract>): ArchitectureContract => ({ ...reference, ...change });
/** A profile like Full, with what a test changes. */
const profile = (change: Partial<Profile>): Profile => ({ ...full, id: 'trial', default: false, ...change });
const problemsWith = (...profiles: Profile[]) => validateProfiles(variant({ profiles: [full, ...profiles] }));

const REVIEW = ['ARCH-MODULES-DATA', 'ARCH-EXECUTION-CONTEXT', 'DOMAIN-IDENTITY', 'DOMAIN-NON-DETERMINISM'];

describe('the profiles of the reference', () => {
  it('declares Full, the default, holding every rule of the contract and naming its review rules as gaps', () => {
    expect(reference.profiles.map(each => [each.id, each.default])).toEqual([['full', true]]);
    expect(full).toMatchObject({ holds: 'all', waives: {}, conditional: {}, grammar: 'http', checklists: 'all' });
    expect(full.gaps).toEqual(REVIEW);
    for (const rule of reference.rules) expect(stanceOf(full, rule).stance).toBe('held');
    expect(profileMatrix(reference)).toHaveLength(reference.rules.length);
  });

  it('declares the floor of H1 with the rule ids that exist today, and its gap', () => {
    expect(reference.floor.flatMap(guarantee => guarantee.rules)).toEqual([
      'ARCH-INWARD',
      'ARCH-TREES',
      'CTX-CONTRACTS',
      'ARCH-CONTEXT-DECLARED',
      'CTX-MAP-DECLARED',
      'ARCH-DOMAIN',
      'DOMAIN-RESULT',
      'CONC-OPTIMISTIC',
      'EVENT-AFTER-COMMIT',
      'DOMAIN-IDENTITY',
      'API-CALLER-AT-TRANSPORT',
    ]);
    const gaps = reference.floor.filter(guarantee => guarantee.gap).map(guarantee => guarantee.guarantee);
    expect(gaps).toEqual(['Identity is born once']);
    expect(reference.floor.find(guarantee => guarantee.heldBy)).toMatchObject({ heldBy: 'modes', rules: [] });
  });

  it('holds every context of every binding to Full, which none names: the default', () => {
    for (const language of reference.languages) {
      const contract = loadArchitectureContract(root, language);
      expect(contract.contextProfiles).toEqual({});
      for (const context of contract.contexts) expect(profileOf(contract, context)).toBe('full');
      expect(validateProfiles(contract, root)).toEqual([]);
    }
  });

  it('holds a rule added later without an edit to Full, and asks for a gap only if review holds it', () => {
    const added = (enforcement: Rule['enforcement']): Rule => ({
      id: 'ARCH-ADDED-LATER',
      name: 'added-later',
      statement: 's',
      why: 'w',
      remediation: 'r',
      enforcement,
      references: [],
      examples: [],
    });
    const withRule = (rule: Rule) => variant({ rules: [...reference.rules, rule] });
    expect(stanceOf(full, added('tests')).stance).toBe('held');
    expect(validateProfiles(withRule(added('tests')))).toEqual([]);
    expect(validateProfiles(withRule(added('review')))).toEqual([
      expect.stringMatching(/profile "full": holds ARCH-ADDED-LATER by review alone.*\(P3\)/),
    ]);
  });
});

describe('the profile check', () => {
  it('P1: an explicit profile lists every rule once, and only rules the contract defines', () => {
    const [first, second, ...others] = reference.rules.map(rule => rule.id);
    const problems = problemsWith(
      profile({
        holds: [...others, 'ARCH-NOPE'],
        waives: { [second]: '  ' },
        conditional: { [others[0]]: 'several-writers' },
        gaps: REVIEW.filter(id => id !== first),
      }),
    );
    expect(problems).toEqual(
      expect.arrayContaining([
        expect.stringMatching(new RegExp(`leaves the rule ${first} unlisted.*\\(P1\\)`)),
        expect.stringMatching(new RegExp(`waives ${second} with no reason \\(P1\\)`)),
        expect.stringMatching(new RegExp(`says more than one thing about the rule ${others[0]} \\(P1\\)`)),
        expect.stringMatching(/names the rule ARCH-NOPE, which conventions\/architecture.yaml does not define \(P1\)/),
      ]),
    );
    expect(problemsWith(profile({ holds: reference.rules.map(rule => rule.id) }))).toEqual([]);
  });

  it('P2: no profile waives a rule of the floor; it may hold one on a trigger', () => {
    expect(problemsWith(profile({ waives: { 'CONC-OPTIMISTIC': 'one writer per thing' } }))).toEqual([
      expect.stringMatching(
        /waives CONC-OPTIMISTIC, which holds the floor's "A write is consistent where several writers can race".*\(P2\)/,
      ),
    ]);
    expect(problemsWith(profile({ conditional: { 'CONC-OPTIMISTIC': 'several-writers' } }))).toEqual([]);
    expect(problemsWith(profile({ waives: { 'ARCH-MODULES-DATA': 'no Module' }, gaps: REVIEW.slice(1) }))).toEqual([]);
  });

  it('P3: a rule held by review alone is a gap of the profile, and a gap is such a rule', () => {
    const problems = problemsWith(profile({ gaps: ['ARCH-MODULES-DATA', 'DOMAIN-RESULT', 'CTX-CONTRACTS'] }));
    expect(problems).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/holds ARCH-EXECUTION-CONTEXT by review alone.*\(P3\)/),
        expect.stringMatching(/lists DOMAIN-RESULT as a gap, and .* holds it by tests.*\(P3\)/),
      ]),
    );
    const waived = problemsWith(profile({ waives: { 'ARCH-MODULES-DATA': 'no Module' }, gaps: REVIEW }));
    expect(waived).toEqual([expect.stringMatching(/lists ARCH-MODULES-DATA as a gap, and does not hold it \(P3\)/)]);
    // Held on a trigger, a review rule is still a gap.
    expect(
      problemsWith(profile({ conditional: { 'DOMAIN-IDENTITY': 'reacts-to-integration-event' }, gaps: REVIEW })),
    ).toEqual([]);
  });

  it('P4: a conditional rule names a trigger the engine can see, one of a closed set', () => {
    expect(problemsWith(profile({ conditional: { 'EVENT-AFTER-COMMIT': 'when it matters' } }))).toEqual([
      expect.stringMatching(/holds EVENT-AFTER-COMMIT on "when it matters", which is not a trigger.*\(P4\)/),
    ]);
    expect(Object.keys(TRIGGERS)).toEqual([
      'publishes-integration-event',
      'reacts-to-integration-event',
      'reacts-to-domain-event',
      'several-writers',
      'command-answered-later',
      'asks-another-context',
    ]);
  });

  it('P4: every trigger is read from the inventory, and fires where the reference says it should', () => {
    const inventory = inspectInventory(reference, root);
    const fired = (trigger: string) =>
      inventory.contexts.filter(context => triggerFires(trigger, context.id, inventory)).map(context => context.id);
    expect(fired('publishes-integration-event')).toEqual(['Notes', 'Security', 'Tracker']);
    expect(fired('reacts-to-integration-event')).toEqual(['Notifications']);
    expect(fired('reacts-to-domain-event')).toEqual(['Notes', 'Security']);
    expect(fired('several-writers')).toEqual(['Notes', 'Notifications', 'Security']);
    expect(fired('command-answered-later')).toEqual(['Notes', 'Notifications', 'Security']);
    expect(fired('asks-another-context')).toEqual(['Notes']);
    expect(() => triggerFires('when it matters', 'Notes', inventory)).toThrow(/unknown trigger/);
  });

  it('P6: a binding holds a context it declares to a profile the contract declares', () => {
    const problems = validateProfiles(variant({ contextProfiles: { Notes: 'lite', Billing: 'full' } }));
    expect(problems).toEqual([
      expect.stringMatching(
        /typescript.yaml: holds Notes to the profile "lite", which .* does not declare: one of full \(P6\)/,
      ),
      expect.stringMatching(/typescript.yaml: names a profile for Billing, which it does not declare.*\(P6\)/),
    ]);
    const named = variant({ contextProfiles: { Notes: 'trial' }, profiles: [full, profile({})] });
    expect(validateProfiles(named)).toEqual([]);
    expect(profileOf(named, 'Notes')).toBe('trial');
    expect(profileOf(named, 'Security')).toBe('full');
  });

  it('holds the frame: one default, a grammar and checklists the contract has, a floor that names what holds it', () => {
    const problems = validateProfiles(
      variant({
        profiles: [full, profile({ default: true, grammar: 'soap', checklists: ['aggregate', 'saga'] })],
        floor: [
          ...reference.floor,
          { guarantee: 'Nothing holds this', rules: [] },
          { guarantee: 'A rule nobody wrote', rules: ['ARCH-NOPE'] },
          { guarantee: 'Read by people', rules: ['ARCH-MODULES-DATA'] },
          { guarantee: 'Held by goodwill', rules: [], heldBy: 'goodwill' },
        ],
      }),
    );
    expect(problems).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/full, trial are each the default; exactly one is/),
        expect.stringMatching(/answers on the grammar "soap", which is not a section .* with verbs: one of http/),
        expect.stringMatching(/names the checklist saga/),
        expect.stringMatching(
          /floor "Nothing holds this": no rule holds it, and it says neither its gap nor what holds it/,
        ),
        expect.stringMatching(/floor "A rule nobody wrote": names the rule ARCH-NOPE/),
        expect.stringMatching(/floor "Read by people": ARCH-MODULES-DATA is held by review alone; say the gap/),
        expect.stringMatching(/floor "Held by goodwill": "held_by" must be one of modes/),
      ]),
    );
    expect(problems).toHaveLength(7);
  });

  it('reads profiles from the YAML, refuses a profile that words a rule, and holds a contract that declares none as written', () => {
    const dir = mkdtempSync(join(tmpdir(), 'profiles-'));
    mkdirSync(join(dir, 'conventions'));
    const table = load(readFileSync(join(root, 'conventions/architecture.yaml'), 'utf8')) as Record<string, unknown>;
    table.languages = ['typescript'];
    const profiles = table.profiles as Record<string, Record<string, unknown>>;
    profiles.trial = { ...profiles.full, default: false, statement: 'Dependencies point inward, mostly.' };
    writeFileSync(join(dir, 'conventions/architecture.yaml'), dump(table));
    copyFileSync(join(root, 'conventions/concepts.yaml'), join(dir, 'conventions/concepts.yaml'));
    const binding = load(readFileSync(join(root, 'conventions/typescript.yaml'), 'utf8')) as Record<string, unknown>;
    writeFileSync(join(dir, 'conventions/typescript.yaml'), dump({ ...binding, profiles: { Notes: 'trial' } }));

    const contract = loadArchitectureContract(dir);
    expect(contract.contextProfiles).toEqual({ Notes: 'trial' });
    expect(contract.profiles.map(each => each.id)).toEqual(['full', 'trial']);
    expect(validateProfiles(contract, dir)).toEqual([
      expect.stringMatching(
        /profile "trial": "statement" is not a word of a profile.*it never words one \(ARCH-ONE-CONTRACT\)/,
      ),
    ]);

    delete table.profiles;
    delete table.floor;
    writeFileSync(join(dir, 'conventions/architecture.yaml'), dump(table));
    const asWritten = loadArchitectureContract(dir);
    expect(asWritten.profiles).toEqual([]);
    expect(validateProfiles(asWritten, dir)).toEqual([
      expect.stringMatching(
        /holds Notes to the profile "trial", which conventions\/architecture.yaml does not declare \(P6\)/,
      ),
    ]);
  });
});

describe('a context changes profile by an ADR (P6, H6)', () => {
  it('reads what moved between two readings of a binding, the default standing for a context it does not name', () => {
    const before = { contexts: ['Notes', 'Billing'], profiles: { Billing: 'lite' } };
    expect(contextProfileChanges(before, before, 'full')).toEqual([]);
    expect(contextProfileChanges(before, { ...before, profiles: { Notes: 'lite', Billing: 'lite' } }, 'full')).toEqual([
      'Notes: full → lite',
    ]);
    expect(contextProfileChanges(before, { contexts: ['Notes', 'Billing'] }, 'full')).toEqual(['Billing: lite → full']);
    // Naming the default is no move, and a context dropped from the binding is not a change of profile.
    expect(contextProfileChanges(before, { ...before, profiles: { Notes: 'full', Billing: 'lite' } }, 'full')).toEqual(
      [],
    );
    expect(contextProfileChanges(before, { contexts: ['Notes'] }, 'full')).toEqual([]);
  });

  it('the feature mode refuses it with the rest of conventions; the architecture mode asks for the ADR', () => {
    const moved = [{ file: 'conventions/typescript.yaml', changes: ['Notes: full → lite'] }];
    const feature = checkMode('feature', ['conventions/typescript.yaml'], reference, 'main', moved);
    expect(feature.offending).toEqual(['conventions/typescript.yaml']);

    const silent = checkMode('architecture', ['conventions/typescript.yaml'], reference, 'main', moved);
    expect(silent.ok).toBe(false);
    expect(silent.problems).toEqual([
      expect.stringMatching(/touches conventions\/typescript.yaml and records no decision/),
      expect.stringMatching(
        /holds a context to another profile \(Notes: full → lite\): a context changes profile by an ADR/,
      ),
    ]);
    const recorded = checkMode(
      'architecture',
      ['conventions/typescript.yaml', 'docs/adr/0041-notes-moves-to-lite.md'],
      reference,
      'main',
      moved,
    );
    expect(recorded.ok).toBe(true);
    // A binding changed for anything else decides nothing in the architecture mode, as before.
    expect(checkMode('architecture', ['conventions/typescript.yaml'], reference, 'main', []).ok).toBe(true);
  });

  it('finds the move in git: a changed binding read at the base and on disk', () => {
    const dir = mkdtempSync(join(tmpdir(), 'profile-move-'));
    const git = (...args: string[]) =>
      execFileSync('git', ['-c', 'user.name=spec', '-c', 'user.email=spec@example.com', ...args], {
        cwd: dir,
        encoding: 'utf8',
      });
    mkdirSync(join(dir, 'conventions'));
    const file = 'conventions/typescript.yaml';
    writeFileSync(join(dir, file), dump({ contexts: ['Notes', 'Security'] }));
    git('init', '-q');
    git('add', '-A');
    git('commit', '-q', '-m', 'base');
    expect(contextProfileChangesSince('working', [file], reference, dir)).toEqual([]);
    writeFileSync(join(dir, file), dump({ contexts: ['Notes', 'Security'], profiles: { Security: 'lite' } }));
    expect(contextProfileChangesSince('working', [file], reference, dir)).toEqual([
      { file, changes: ['Security: full → lite'] },
    ]);
    git('commit', '-q', '-am', 'Security moves');
    expect(contextProfileChangesSince('HEAD~1', [file], reference, dir)).toEqual([
      { file, changes: ['Security: full → lite'] },
    ]);
    // Only a changed binding is read.
    expect(contextProfileChangesSince('HEAD~1', ['README.md'], reference, dir)).toEqual([]);
  });
});

describe('P5: Full is unchanged by the profile schema', () => {
  /** The repository's conventions, copied with the profile schema taken out of the contract. */
  const withoutProfiles = (() => {
    const dir = mkdtempSync(join(tmpdir(), 'no-profiles-'));
    mkdirSync(join(dir, 'conventions'));
    for (const file of readdirSync(join(root, 'conventions')).filter(name => name.endsWith('.yaml'))) {
      copyFileSync(join(root, 'conventions', file), join(dir, 'conventions', file));
    }
    const table = load(readFileSync(join(root, 'conventions/architecture.yaml'), 'utf8')) as Record<string, unknown>;
    delete table.profiles;
    delete table.floor;
    writeFileSync(join(dir, 'conventions/architecture.yaml'), dump(table));
    return dir;
  })();
  const languages = reference.languages;
  const loaded = (at: string) => languages.map(language => loadArchitectureContract(at, language));
  const before = loaded(withoutProfiles);
  const after = loaded(root);
  const map = loadDomainMap(root)!;
  const strategicView = renderDomain(map, inspectContextLinks(reference, root), loadStrategicConcepts(root));

  it('the contract every renderer and the gate read is the same, but for the profiles', () => {
    const rest = (contract: ArchitectureContract) =>
      Object.fromEntries(
        Object.entries(contract).filter(([key]) => !['floor', 'profiles', 'contextProfiles'].includes(key)),
      );
    expect(before.map(contract => contract.profiles)).toEqual(languages.map(() => []));
    expect(after.map(contract => contract.profiles.map(profile => profile.id))).toEqual(languages.map(() => ['full']));
    after.forEach((contract, index) => expect(rest(contract)).toEqual(rest(before[index])));
  });

  it('the rendered documents are byte-identical with and without the profiles, and are the committed ones', () => {
    const rendered = renderedDocuments(after, strategicView);
    expect(rendered).toEqual(renderedDocuments(before, strategicView));
    expect(rendered.map(document => document.file)).toEqual([
      'typescript/README.md',
      'rust/README.md',
      'python/README.md',
      'go/README.md',
      'CLAUDE.md',
      'README.md',
    ]);
    for (const { file, blocks } of rendered) {
      const committed = readFileSync(join(root, file), 'utf8');
      for (const [marker, block] of blocks) expect(committed).toContain(`${marker}\n${block}\n${END_MARKER}`);
    }
  });

  it("the gate's conventions step passes on the reference, and the profiles add no problem to any binding", async () => {
    for (const [index, contract] of after.entries()) {
      expect(validateContract(contract, root)).toEqual(validateContract(before[index], root));
    }
    expect((await checkConventions(root)).problems).toEqual([]);
  });
});
