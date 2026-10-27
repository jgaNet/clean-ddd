import { mkdirSync, mkdtempSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { dump } from 'js-yaml';

import { loadArchitectureContract, repositoryRoot } from './load';
import { inspectInventory } from './inventory';
import { inspectEventStorm } from './storm';
import {
  checkExpectedStorm,
  describeExpectation,
  expectedInventory,
  loadExpectedStorm,
  overlayExpectedStorm,
  validateExpectedStorm,
} from './storms';
import type { ExpectedStorm } from './storms';

/**
 * An expected storm is held to the contract, the map and the code; these specs pin what the
 * validation refuses, what the comparison names and how the board shows a planned sticky, on
 * the repository's own storms and on fixtures written from them.
 */

const root = repositoryRoot();
const contract = loadArchitectureContract(root);
const actual = inspectInventory(contract, root);
const pin = loadExpectedStorm('conventions/storms/pin-a-note.yaml', root);
const share = loadExpectedStorm('conventions/storms/share-a-note.yaml', root);
const remind = loadExpectedStorm('conventions/storms/remind-a-note.yaml', root);

/** A storm written to a temp file under a conventions/storms of its own, so the loader reads a real file. */
const stormFile = (storm: unknown): { dir: string; file: string } => {
  const dir = mkdtempSync(join(tmpdir(), 'storm-'));
  mkdirSync(join(dir, 'conventions/storms'), { recursive: true });
  writeFileSync(join(dir, 'conventions/storms/feature.yaml'), typeof storm === 'string' ? storm : dump(storm));
  return { dir, file: 'conventions/storms/feature.yaml' };
};
const clone = (storm: ExpectedStorm): ExpectedStorm => JSON.parse(JSON.stringify(storm));

describe('an expected storm', () => {
  it('loads with its hot spots and its delta, routes spelled canonically', () => {
    expect(pin.feature).toBe('pin-a-note');
    expect(pin.done).toBe(false);
    expect(pin.hotSpots).toHaveLength(4);
    expect(pin.contexts[0].commands.map(command => command.route)).toEqual([
      'POST /notes/{param}/pin',
      'POST /notes/{param}/unpin',
    ]);
    expect(share.done).toBe(true);
    expect(share.links).toHaveLength(2);
  });

  it('refuses a file that is not a storm', () => {
    const { dir, file } = stormFile({ schemaVersion: 1, feature: 'x', intent: 'y' });
    expect(() => loadExpectedStorm(file, dir)).toThrow('must list at least one context');
    const { dir: dir2, file: file2 } = stormFile('schemaVersion: 2\nfeature: x\nintent: y\ncontexts: [{id: Notes}]\n');
    expect(() => loadExpectedStorm(file2, dir2)).toThrow('schemaVersion 2');
  });

  it("is legal when its contexts, verbs, actors, events and pivots are the contract's and the map's", () => {
    expect(validateExpectedStorm(pin, contract, actual, root)).toEqual([]);
    expect(validateExpectedStorm(share, contract, actual, root)).toEqual([]);
  });

  it('refuses an undeclared context, a bad actor, a GET command, an event nobody brings, an undeclared pivot', () => {
    const wrong = clone(pin);
    wrong.contexts[0].commands[0].actor = 'the owner';
    wrong.contexts[0].commands[1].route = 'GET /notes/{param}/unpin';
    wrong.contexts[0].commands[1].events = ['NoteUnpinned', 'NoteForgotten'];
    wrong.contexts.push({
      id: 'Billing',
      commands: [],
      queries: [],
      events: [],
      policies: [],
    });
    wrong.contexts.push({
      id: 'Tracker',
      commands: [],
      queries: [],
      events: [],
      policies: [{ on: 'NoteShared', kind: 'integration-event', publishes: [], events: [] }],
    });
    wrong.links.push({ mechanism: 'owned-port', upstream: 'Notifications', downstream: 'Notes', contracts: ['Inbox'] });
    const problems = validateExpectedStorm(wrong, contract, actual, root);
    expect(problems).toEqual(
      expect.arrayContaining([
        expect.stringContaining('actor must be one of an administrator, a signed-in account, anyone'),
        expect.stringContaining('a command on GET is the one exception of the grammar'),
        expect.stringContaining('records "NoteForgotten", which neither the code nor this storm brings to Notes'),
        expect.stringContaining('Billing: is not a declared context'),
        expect.stringContaining('a pivot from Notes to Tracker the context map does not declare'),
        expect.stringContaining('link Notifications → Notes: a relationship the context map does not declare'),
      ]),
    );
  });

  it('requires every hot spot decided once the storm is done', () => {
    const undecided = clone(share);
    undecided.hotSpots.push({ question: 'What about groups?' });
    expect(validateExpectedStorm(undecided, contract, actual, root)).toContainEqual(
      expect.stringContaining('the storm is done but the hot spot "What about groups?" is not decided'),
    );
  });
});

describe('the storm against the code', () => {
  it('builds the inventory the code must say, in canonical order', () => {
    const expected = expectedInventory(actual, pin);
    const notes = expected.contexts.find(context => context.id === 'Notes')!;
    expect(notes.commands.map(command => command.name)).toEqual([
      'ArchiveNote',
      'CreateNote',
      'EditNote',
      'PinNote',
      'RestoreNote',
      'ShareNote',
      'SuggestNoteTitle',
      'UnpinNote',
    ]);
    expect(notes.events).toContain('NotePinned');
    expect(expectedInventory(actual, share)).toEqual({
      ...actual,
      language: 'expected by conventions/storms/share-a-note.yaml',
    });
  });

  it('holds a done storm to the code and a planned one to its absence', () => {
    expect(checkExpectedStorm(share, actual)).toEqual([]);
    expect(checkExpectedStorm(pin, actual)).toEqual([]);
    const stale = clone(share);
    stale.done = false;
    expect(checkExpectedStorm(stale, actual)).toContainEqual(
      expect.stringContaining('is not done, yet the code already carries Notes: the command ShareNote'),
    );
    const premature = clone(pin);
    premature.done = true;
    expect(checkExpectedStorm(premature, actual)).toContainEqual(
      expect.stringContaining(
        'is done, but Notes: typescript lacks the command expected by conventions/storms/pin-a-note.yaml has: PinNote',
      ),
    );
  });

  it('says what the code still owes, in words', () => {
    const words = describeExpectation(pin, actual);
    expect(words).toContain('pin-a-note (planned)');
    expect(words).toContain('Still owed by the code (4):');
    expect(words).toContain('  Notes: the command PinNote');
    expect(describeExpectation(share, actual)).toContain('The code carries the storm');
  });

  it('names what a storm reshapes rather than adds, without calling it a discovery', () => {
    const words = describeExpectation(remind, actual);
    expect(words).toContain('Changed by this storm (the code has the earlier shape):');
    expect(words).toContain(
      'Notes: ArchiveNote — ArchiveNote (a signed-in account, POST /notes/{param}/archive, Note → NoteArchived) becomes',
    );
    expect(words).toContain(
      'the link Notes → Notifications gains ReminderCancelled, ReminderScheduled (it carries NoteShared)',
    );
    expect(words).not.toContain('not in the storm');
    expect(checkExpectedStorm(remind, actual)).toEqual([]);
  });

  it('lays the planned stickies over the board, dashed', () => {
    const storm = inspectEventStorm(contract, root);
    const overlaid = overlayExpectedStorm(storm, pin, actual);
    const notes = overlaid.contexts.find(context => context.id === 'Notes')!;
    expect(notes.commands.filter(command => command.expected).map(command => command.name)).toEqual([
      'PinNote',
      'UnpinNote',
    ]);
    expect(notes.events.filter(event => event.expected).map(event => event.name)).toEqual([
      'NotePinned',
      'NoteUnpinned',
    ]);
    expect(overlayExpectedStorm(storm, share, actual)).toEqual(storm);
  });
});
