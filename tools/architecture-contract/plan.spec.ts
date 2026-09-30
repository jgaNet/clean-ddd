import { mkdirSync, mkdtempSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { dump } from 'js-yaml';

import {
  ContractError,
  explainPlan,
  loadArchitectureContract,
  loadFeaturePlan,
  repositoryRoot,
  validatePlan,
} from './index';
import type { FeaturePlan } from './plan';

const root = repositoryRoot();
const contract = loadArchitectureContract(root);

/** A plan written to a temp file, so the loader's refusals can be tested on real files. */
const planFile = (plan: unknown): { dir: string; file: string } => {
  const dir = mkdtempSync(join(tmpdir(), 'plan-'));
  mkdirSync(join(dir, 'plans'), { recursive: true });
  writeFileSync(join(dir, 'plans/feature.yaml'), typeof plan === 'string' ? plan : dump(plan));
  return { dir, file: 'plans/feature.yaml' };
};

const aPlan = (over: Partial<FeaturePlan> = {}): FeaturePlan => ({
  schemaVersion: 1,
  feature: 'test-feature',
  context: 'Notes',
  intent: 'something',
  changes: [{ kind: 'aggregate', name: 'Bookmark' }],
  invariants: ['a rule'],
  events: ['NoteBookmarkedEvent'],
  ...over,
});

describe('a feature plan', () => {
  it('is legal when it names a declared context, known kinds and a verb that matches its route', () => {
    expect(validatePlan(aPlan(), contract, root)).toEqual([]);
  });

  it('validates the example plan in the repository, against the repository', () => {
    const plan = loadFeaturePlan('conventions/plans/share-a-note.yaml', root);
    expect(validatePlan(plan, contract, root)).toEqual([]);
  });

  it('refuses an unknown context, an unknown kind, and a domain part with no aggregate', () => {
    const problems = validatePlan(
      aPlan({
        context: 'Billing',
        changes: [
          { kind: 'saga', name: 'Whatever' },
          { kind: 'value-object', name: 'Money' },
        ],
      }),
      contract,
      root,
    );
    expect(problems).toEqual(
      expect.arrayContaining([
        expect.stringContaining('the context Billing is not declared'),
        expect.stringContaining('is of kind saga'),
        expect.stringContaining('must say which aggregate it belongs to'),
      ]),
    );
  });

  it('refuses a route whose method does not match its intent, and a command with no intent at all', () => {
    const problems = validatePlan(
      aPlan({
        changes: [
          { kind: 'command', name: 'RemoveThing', verb: 'remove', route: 'POST /notes/:id/thing' },
          { kind: 'query', name: 'GetThings' },
        ],
      }),
      contract,
      root,
    );
    expect(problems).toEqual(
      expect.arrayContaining([
        expect.stringContaining('its route starts with DELETE'),
        expect.stringContaining('names an intent from the verb table'),
      ]),
    );
  });

  it('refuses what the tree contradicts: new for a part that exists, existing for a part that does not', () => {
    const problems = validatePlan(
      aPlan({
        changes: [
          { kind: 'aggregate', name: 'Note' },
          { kind: 'aggregate', name: 'Ghost', new: false },
        ],
      }),
      contract,
      root,
    );
    expect(problems).toEqual(
      expect.arrayContaining([
        expect.stringContaining('"Note" is planned as new, but src/Contexts/Notes/Domain/Note/Note.ts already exists'),
        expect.stringContaining('"Ghost" is not new, but src/Contexts/Notes/Domain/Ghost/Ghost.ts does not exist'),
      ]),
    );
  });

  it('refuses a cross-context strategy that is not one of the two contracts, and a badly named event', () => {
    const problems = validatePlan(
      aPlan({
        events: ['noteBookmarked'],
        crossContext: { context: 'Notifications', strategy: 'shared-database' as 'owned-port' },
      }),
      contract,
      root,
    );
    expect(problems).toEqual(
      expect.arrayContaining([
        expect.stringContaining('should be PascalCase and end in Event'),
        expect.stringContaining('strategy must be integration-event or owned-port'),
      ]),
    );
  });

  it('refuses to touch a protected tree, or to add a context, unless it says architectureChanges', () => {
    const problems = validatePlan(
      aPlan({ context: 'Billing', changes: [{ kind: 'context', name: 'Billing' }] }),
      contract,
      root,
    );
    expect(problems).toEqual(expect.arrayContaining([expect.stringContaining('architectureChanges: true')]));
    expect(
      validatePlan(
        aPlan({ context: 'Billing', changes: [{ kind: 'context', name: 'Billing' }], architectureChanges: true }),
        contract,
        root,
      ),
    ).toEqual([]);
  });

  it('rejects a file that is not a plan, and a schema version it does not understand', () => {
    const { dir, file } = planFile({ ...aPlan(), schemaVersion: 2 });
    expect(() => loadFeaturePlan(file, dir)).toThrow(ContractError);
    const noFeature = planFile({ schemaVersion: 1, context: 'Notes' });
    expect(() => loadFeaturePlan(noFeature.file, noFeature.dir)).toThrow(/"feature" is missing/);
    const noChanges = planFile({ schemaVersion: 1, feature: 'f', context: 'Notes', intent: 'i' });
    expect(() => loadFeaturePlan(noChanges.file, noChanges.dir)).toThrow(/at least one change/);
  });

  it('expands into the files, the rules and the examples the plan implies', () => {
    const explained = explainPlan(
      aPlan({
        changes: [
          { kind: 'aggregate', name: 'Bookmark' },
          { kind: 'command', name: 'BookmarkNote', verb: 'act', route: 'POST /notes/:id/bookmark' },
        ],
        crossContext: { context: 'Notifications', strategy: 'integration-event' },
      }),
      contract,
    );

    const [aggregate, command] = explained.changes;
    expect(aggregate.place).toBe('src/Contexts/Notes/Domain/Bookmark/Bookmark.ts');
    expect(aggregate.parts.join(' ')).toContain('BookmarkExceptions.ts'); // the placeholders are filled in
    expect(aggregate.canonical).toContain('src/Architecture/Domain/AggregateRoot.ts');
    expect(command.place).toBe('src/Contexts/Notes/Application/Commands/BookmarkNote/');
    expect(command.verb?.verb).toBe('POST');

    const rules = explained.rules.map(rule => rule.id);
    expect(rules).toEqual(
      expect.arrayContaining([
        'ARCH-INWARD',
        'DOMAIN-RESULT',
        'DOMAIN-RECORDS-EVENTS',
        'EVENT-AFTER-COMMIT',
        'CONC-OPTIMISTIC',
        'CTX-CONTRACTS',
      ]),
    );
    expect(explained.checks).toContain('yarn check:conventions');
  });
});
