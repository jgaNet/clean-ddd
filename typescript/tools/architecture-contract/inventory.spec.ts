import { loadArchitectureContract, repositoryRoot } from './load';
import { canonicalRoute, compareInventories, inspectInventory, loadInventories, serializeInventory } from './inventory';
import type { Inventory } from './inventory';

/**
 * The inventory is the words every language must say the same; these specs pin its order, its
 * spelling and what the comparison names, on the repository's own TypeScript tree.
 */

const root = repositoryRoot();
const contract = loadArchitectureContract(root);
const inventory = inspectInventory(contract, root);
const clone = (): Inventory => JSON.parse(JSON.stringify(inventory));

describe('the inventory', () => {
  it('spells a route the same whatever a language names its parameters', () => {
    expect(canonicalRoute('POST /notes/:id/share')).toBe('POST /notes/{param}/share');
    expect(canonicalRoute('GET /notifications/account/{recipient_id}')).toBe('GET /notifications/account/{param}');
    expect(canonicalRoute('GET /notes')).toBe('GET /notes');
  });

  it('is the storm in shared words, in canonical order', () => {
    expect(inventory.schemaVersion).toBe(1);
    expect(inventory.language).toBe('typescript');
    expect(inventory.contexts.map(context => context.id)).toEqual(['Notes', 'Notifications', 'Security', 'Tracker']);
    const notes = inventory.contexts[0];
    expect(notes.commands.map(command => command.name)).toEqual([
      'ArchiveNote',
      'CreateNote',
      'EditNote',
      'RestoreNote',
      'ShareNote',
      'SuggestNoteTitle',
    ]);
    expect(notes.commands.find(command => command.name === 'ShareNote')).toEqual({
      name: 'ShareNote',
      actor: 'a signed-in account',
      route: 'POST /notes/{param}/share',
      aggregate: 'Note',
      events: ['NoteShared'],
    });
    expect(notes.events).toEqual(['NoteArchived', 'NoteCreated', 'NoteEdited', 'NoteRestored', 'NoteShared']);
    expect(inventory.contexts[1].policies.map(policy => policy.on)).toEqual([
      'AccountCreated',
      'AccountValidated',
      'NoteShared',
      'OperationComplete',
    ]);
    expect(inventory.links.map(link => `${link.upstream}→${link.downstream}`)).toEqual([
      'Notes→Notifications',
      'Security→Notes',
      'Security→Notifications',
      'Tracker→Notifications',
    ]);
  });

  it('serialises to canonical JSON, the committed file being that', () => {
    const text = serializeInventory(inventory);
    expect(text.startsWith('{\n  "schemaVersion": 1,\n  "language": "typescript",\n')).toBe(true);
    expect(text.endsWith('}\n')).toBe(true);
    expect(text).toContain('"publishes": [],');
    expect(loadInventories(root).get('typescript')).toEqual(inventory);
  });

  it('names what another language lacks, has in excess, or reaches differently', () => {
    const other = clone();
    other.language = 'rust';
    const notes = other.contexts[0];
    notes.commands = notes.commands.filter(command => command.name !== 'ShareNote');
    notes.queries.push({ name: 'GetArchivedNotes', actor: 'a signed-in account', route: 'GET /notes/archived' });
    other.contexts[1].policies[2].events = ['NotificationSent'];
    other.links = other.links.filter(link => link.mechanism !== 'owned-port');
    const problems = compareInventories(inventory, other);
    expect(problems).toEqual([
      'Notes: rust lacks the command typescript has: ShareNote (a signed-in account, POST /notes/{param}/share, Note → NoteShared)',
      'Notes: rust has a query typescript does not: GetArchivedNotes (a signed-in account, GET /notes/archived)',
      'Notifications: rust lacks the policy typescript has: on NoteShared (integration-event, → NotificationFailed, NotificationSent)',
      'Notifications: rust has a policy typescript does not: on NoteShared (integration-event, → NotificationSent)',
      'context map: rust lacks the link typescript has: Security → Notes over an owned-port (AccountDirectory)',
    ]);
    expect(compareInventories(inventory, clone())).toEqual([]);
  });
});
