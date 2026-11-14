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
  contractUnder,
  END_MARKER,
  inspectContextLinks,
  inspectInventory,
  loadArchitectureContract,
  loadDomainMap,
  loadStrategicConcepts,
  Profile,
  profileMatrix,
  profileOf,
  profileTriggers,
  profilesHeldBy,
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
import type { Inventory, InventoryContext } from './index';

/**
 * Architecture profiles (ADR 40): the contract names them as data, and the conventions check holds them
 * to the validation contract of RFC 0002, §9 — P1 to P4 and P6 here, against the reference's contract
 * and against contracts changed in memory; P5, non-regression, at the end: Full's documents and the
 * gate's conventions verdict on the reference are the same with the profiles as without them.
 */

const root = repositoryRoot();
const reference = loadArchitectureContract(root);
const full = reference.profiles.find(profile => profile.id === 'full')!;
const lite = reference.profiles.find(profile => profile.id === 'lite')!;

/** The reference's contract, with other profiles, another floor or a binding's per-context profiles. */
const variant = (change: Partial<ArchitectureContract>): ArchitectureContract => ({ ...reference, ...change });
/** A profile like Full, with what a test changes. */
const profile = (change: Partial<Profile>): Profile => ({ ...full, id: 'trial', default: false, ...change });
const problemsWith = (...profiles: Profile[]) =>
  validateProfiles(variant({ profiles: [full, reference.profiles.find(each => each.id === 'lite')!, ...profiles] }));

const REVIEW = ['ARCH-MODULES-DATA', 'ARCH-EXECUTION-CONTEXT', 'DOMAIN-IDENTITY', 'DOMAIN-NON-DETERMINISM'];

describe('the profiles of the reference', () => {
  it('declares Full, the default, holding every rule of the contract and naming its review rules as gaps', () => {
    expect(reference.profiles.map(each => [each.id, each.default])).toEqual([
      ['full', true],
      ['lite', false],
    ]);
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
      'CTX-PUBLISHED-LANGUAGE',
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

  it('declares Lite: every rule named, none waived, the floor held or held on a trigger, its own grammar and mechanisms', () => {
    const stances = Object.fromEntries(reference.rules.map(rule => [rule.id, stanceOf(lite, rule).stance]));
    expect(Object.values(stances).filter(stance => stance === 'unlisted')).toEqual([]);
    expect(lite.waives).toEqual({});
    expect(lite.conditional).toEqual({
      'DOMAIN-RECORDS-EVENTS': 'reacts-to-domain-event',
      'DOMAIN-CREATE-VS-RECONSTITUTE': 'several-writers',
      'CONC-OPTIMISTIC': 'several-writers',
      'EVENT-AFTER-COMMIT': 'publishes-integration-event',
    });
    // The Module lists each use case once, and the check reads it: held, not conditional.
    expect(stances['ARCH-ONE-HANDLER']).toBe('held');
    for (const rule of reference.floor.flatMap(guarantee => guarantee.rules)) expect(stances[rule]).not.toBe('waived');
    expect(lite.gaps).toEqual(REVIEW);
    expect(lite).toMatchObject({ grammar: 'http-lite', checklists: 'all', default: false });
    const byStance = (stance: string) =>
      Object.entries(lite.mechanisms)
        .filter(([, mechanism]) => mechanism.stance === stance)
        .map(([id, mechanism]) => (mechanism.until ? `${id} until ${mechanism.until}` : id));
    expect(byStance('not-used')).toEqual([
      'command-bus until command-answered-later',
      'operations until command-answered-later',
      'aggregates until several-writers',
      'domain-events until reacts-to-domain-event',
      'queries-port',
      'ports-inside-a-context',
      'one-file-per-concept',
    ]);
    expect(byStance('uses')).toEqual(['use-case', 'answered-at-once', 'decision']);
    expect(byStance('kept')).toEqual([
      'integration-events',
      'outbox',
      'inbox',
      'owned-ports',
      'context-map',
      'module-as-data',
    ]);
    expect(full.mechanisms).toEqual({});
  });

  it('answers Lite on a grammar of its own: the same intents, every command at once', () => {
    expect(reference.grammars).toEqual(['http', 'http-lite']);
    const liteVerbs = reference.grammarVerbs['http-lite'];
    expect(liteVerbs.map(verb => [verb.intent, verb.verb])).toEqual(
      reference.verbs.map(verb => [verb.intent, verb.verb]),
    );
    expect(liteVerbs.find(verb => verb.intent === 'create')!.when).toMatch(/201/);
    for (const verb of liteVerbs) expect(verb.when).not.toMatch(/202/);
  });

  it('is held by TypeScript alone: the other bindings report Lite as a gap, and no context of theirs may be held to it', () => {
    expect(profilesHeldBy(reference)).toEqual(['full', 'lite']);
    for (const language of ['rust', 'python', 'go']) {
      const contract = loadArchitectureContract(root, language);
      expect(profilesHeldBy(contract)).toEqual(['full']);
      expect(readFileSync(join(root, `conventions/${language}.yaml`), 'utf8')).toMatch(/Lite: not held/);
      expect(readFileSync(join(root, `${language}/README.md`), 'utf8')).toMatch(/Lite: not held/);
      expect(validateProfiles({ ...contract, contextProfiles: { Notes: 'lite' } })).toEqual([
        expect.stringMatching(
          new RegExp(
            `${language}.yaml: holds Notes to the profile "lite"; .* does not hold the profile "lite".*\\(P6\\)`,
          ),
        ),
      ]);
    }
  });

  it('reads the contract for a context held to Lite: its grammar and the checklists the binding gives it', () => {
    const asLite = contractUnder(reference, 'lite');
    expect(asLite.verbs).toBe(reference.grammarVerbs['http-lite']);
    expect(asLite.checklists.find(each => each.kind === 'command')!.place).toBe(
      'typescript/src/Contexts/<Context>/Application/<Things>.ts',
    );
    // A kind Lite makes as Full does keeps the binding's own checklist.
    expect(asLite.checklists.find(each => each.kind === 'value-object')).toEqual(
      reference.checklists.find(each => each.kind === 'value-object'),
    );
    expect(contractUnder(reference, 'full')).toBe(reference);
    expect(contractUnder(loadArchitectureContract(root, 'rust'), 'lite').verbs).toEqual(
      loadArchitectureContract(root, 'rust').verbs,
    );
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
    // Lite names every rule, so a rule added later is a decision for Lite, not held by default.
    const forLite = expect.stringMatching(/profile "lite": leaves the rule ARCH-ADDED-LATER unlisted.*\(P1\)/);
    expect(validateProfiles(withRule(added('tests')))).toEqual([forLite]);
    expect(validateProfiles(withRule(added('review')))).toEqual([
      expect.stringMatching(/profile "full": holds ARCH-ADDED-LATER by review alone.*\(P3\)/),
      forLite,
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

  it('P4: a command answered at once does not fire command-answered-later; one it publishes fires publishes-integration-event', () => {
    const context = (commands: InventoryContext['commands']): Inventory => ({
      schemaVersion: 1,
      language: 'typescript',
      contexts: [{ id: 'Tasks', commands, queries: [], events: [], policies: [] }],
      links: [],
    });
    const addTask = { name: 'AddTask', actor: 'a signed-in account', events: [], answered: 'at-once' as const };
    const later = { name: 'ArchiveTask', actor: 'a signed-in account', events: ['TaskArchived'] };
    const told = { ...addTask, name: 'CompleteTask', publishes: ['TaskCompleted'] };
    expect(triggerFires('command-answered-later', 'Tasks', context([addTask]))).toBe(false);
    expect(triggerFires('command-answered-later', 'Tasks', context([addTask, later]))).toBe(true);
    expect(triggerFires('publishes-integration-event', 'Tasks', context([addTask]))).toBe(false);
    expect(triggerFires('publishes-integration-event', 'Tasks', context([addTask, told]))).toBe(true);

    // What a fired trigger brings into a context held to Lite: the rules it then holds, the mechanisms an ADR brings in.
    const held = variant({ contexts: ['Tasks'], contextProfiles: { Tasks: 'lite' } });
    expect(profileTriggers(held, context([told, later]))).toEqual([
      {
        context: 'Tasks',
        profile: 'lite',
        trigger: 'publishes-integration-event',
        rules: ['EVENT-AFTER-COMMIT'],
        mechanisms: [],
      },
      {
        context: 'Tasks',
        profile: 'lite',
        trigger: 'command-answered-later',
        rules: [],
        mechanisms: ['command-bus', 'operations'],
      },
    ]);
    // A context held to Full holds everything already: nothing is brought in.
    expect(profileTriggers(variant({ contexts: ['Tasks'] }), context([told, later]))).toEqual([]);
  });

  it('P4: a mechanism is kept, not used or replaced, with its reason; one not used comes in on a trigger the engine can see', () => {
    const problems = problemsWith(
      profile({
        mechanisms: {
          'command-bus': { stance: 'not-used', why: 'functions', until: 'when it grows' },
          outbox: { stance: 'kept', why: 'durable', until: 'several-writers' },
          aggregates: { stance: 'not-used', why: ' ' },
        },
      }),
    );
    expect(problems).toEqual([
      expect.stringMatching(/the mechanism "command-bus" comes in on "when it grows", which is not a trigger.*\(P4\)/),
      expect.stringMatching(/the mechanism "outbox" is kept; only one not used comes in "until" a trigger/),
      expect.stringMatching(/the mechanism "aggregates" says no reason/),
    ]);
  });

  it('P6: a binding holds a context it declares to a profile the contract declares', () => {
    const problems = validateProfiles(variant({ contextProfiles: { Notes: 'heavy', Billing: 'full' } }));
    expect(problems).toEqual([
      expect.stringMatching(
        /typescript.yaml: holds Notes to the profile "heavy", which .* does not declare: one of full, lite \(P6\)/,
      ),
      expect.stringMatching(/typescript.yaml: names a profile for Billing, which it does not declare.*\(P6\)/),
    ]);
    expect(validateProfiles(variant({ contextProfiles: { Notes: 'lite' } }))).toEqual([]);
    // The binding's own default for the contexts it does not name: an application created Lite.
    const createdLite = variant({ bindingProfile: 'lite' });
    expect(validateProfiles(createdLite)).toEqual([]);
    expect(profileOf(createdLite, 'Security')).toBe('lite');
    expect(profileOf({ ...createdLite, contextProfiles: { Security: 'full' } }, 'Security')).toBe('full');
    expect(validateProfiles(variant({ bindingProfile: 'heavy' }))).toEqual([
      expect.stringMatching(/"default_profile" is "heavy", which .* does not declare.*\(P6\)/),
    ]);
    expect(validateProfiles({ ...loadArchitectureContract(root, 'go'), bindingProfile: 'lite' })).toEqual([
      expect.stringMatching(/go.yaml: "default_profile" is "lite"; Go does not hold the profile "lite".*\(P6\)/),
    ]);
    // How a binding holds a profile: what it shows is a mechanism the profile uses or keeps, and every shape of its own is shown.
    const holding = reference.profilesHeld.lite;
    expect(
      validateProfiles(
        variant({
          profilesHeld: {
            lite: { ...holding, shows: { ...holding.shows, 'command-bus': ['x.ts'], saga: ['y.ts'], 'use-case': [] } },
          },
        }),
      ),
    ).toEqual([
      expect.stringMatching(/profiles_held.lite: shows "command-bus", which the profile does not use/),
      expect.stringMatching(/profiles_held.lite: shows "saga", which the profile does not classify/),
      expect.stringMatching(/profiles_held.lite: names no file that shows "use-case"/),
    ]);
    const named = variant({
      contextProfiles: { Notes: 'trial' },
      profiles: [full, profile({})],
      profilesHeld: { trial: { checklists: [], shows: {} } },
    });
    expect(validateProfiles(variant({ profilesHeld: { full: { checklists: [], shows: {} } } }))).toEqual([
      expect.stringMatching(/says how it holds "full", the default/),
    ]);
    expect(validateProfiles(named)).toEqual([]);
    expect(profileOf(named, 'Notes')).toBe('trial');
    expect(profileOf(named, 'Security')).toBe('full');
  });

  it('holds the frame: one default, a grammar and checklists the contract has, a floor that names what holds it', () => {
    const problems = validateProfiles(
      variant({
        profiles: [full, profile({ default: true, grammar: 'soap', checklists: ['aggregate', 'saga'] })],
        profilesHeld: {},
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
        expect.stringMatching(
          /answers on the grammar "soap", which is not a section .* with verbs: one of http, http-lite/,
        ),
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
    delete binding.profiles_held;
    writeFileSync(
      join(dir, 'conventions/typescript.yaml'),
      dump({ ...binding, profiles: { Notes: 'trial' }, profiles_held: { trial: {} } }),
    );

    const contract = loadArchitectureContract(dir);
    expect(contract.contextProfiles).toEqual({ Notes: 'trial' });
    expect(contract.profiles.map(each => each.id)).toEqual(['full', 'lite', 'trial']);
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
      expect.stringMatching(/says how it holds the profile "trial", which .* does not declare \(P6\)/),
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
    // The binding's own default moves every context it does not name.
    expect(contextProfileChanges(before, { ...before, default_profile: 'lite' }, 'full')).toEqual([
      'Notes: full → lite',
    ]);
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
    // A profile's grammar and how a binding holds a profile are the profile schema too (Lite's, ADR 40).
    delete table['http-lite'];
    writeFileSync(join(dir, 'conventions/architecture.yaml'), dump(table));
    for (const language of reference.languages) {
      const file = join(dir, 'conventions', `${language}.yaml`);
      const binding = load(readFileSync(file, 'utf8')) as Record<string, unknown>;
      delete binding.profiles_held;
      delete binding.default_profile;
      writeFileSync(file, dump(binding));
    }
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
        Object.entries(contract).filter(
          ([key]) =>
            ![
              'floor',
              'profiles',
              'contextProfiles',
              'grammars',
              'grammarVerbs',
              'bindingProfile',
              'profilesHeld',
            ].includes(key),
        ),
      );
    expect(before.map(contract => contract.profiles)).toEqual(languages.map(() => []));
    expect(after.map(contract => contract.profiles.map(profile => profile.id))).toEqual(
      languages.map(() => ['full', 'lite']),
    );
    expect(before.map(contract => contract.grammars)).toEqual(languages.map(() => ['http']));
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
