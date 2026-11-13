import { loadArchitectureContract, repositoryRoot } from './load';
import {
  canonicalRoute,
  compareInventories,
  inspectInventory,
  integrationEventPayloads,
  inventoryChanges,
  loadInventories,
  serializeInventory,
} from './inventory';
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

  it('carries the payload of every integration event the tree publishes, in the published language’s words, last', () => {
    expect(inventory.integrationEvents).toEqual([
      {
        name: 'AccountCreated',
        publisher: 'Security',
        payload: { accountId: 'string', email: 'string', validationToken: 'string' },
      },
      { name: 'AccountValidated', publisher: 'Security', payload: { accountId: 'string', email: 'string' } },
      {
        name: 'NoteShared',
        publisher: 'Notes',
        payload: { noteId: 'string', ownerId: 'string', recipientId: 'string', title: 'string' },
      },
      {
        name: 'OperationComplete',
        publisher: 'Tracker',
        // OperationStatus is a string enum; `result?: unknown` may be absent and is any.
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
    expect(Object.keys(inventory).at(-1)).toBe('integrationEvents');
  });

  it('reads a payload from the class in the shared kernel: an object literal, or an interface, an alias, an enum beside it', () => {
    const kernel = 'src/SharedKernel';
    const payloads = integrationEventPayloads(
      [
        {
          path: `${kernel}/Application/IntegrationEvents/Things.ts`,
          text: [
            "import { IntegrationEvent } from '@Architecture/Domain';",
            "import { Colour, Size } from '@SharedKernel/Domain/Kinds';",
            '',
            '/** A thing was made. */',
            'export class ThingMadeIntegrationEvent extends IntegrationEvent<{',
            '  thingId: string; // the id it was born with',
            '  count: number;',
            '  readonly done: boolean;',
            '  tags: string[];',
            '  pairs: Array<[string, number]>;',
            '  meta: Record<string, unknown>;',
            '  owner: { id: string; name?: string };',
            "  kind: 'a' | 'b';",
            '  colour: Colour;',
            '  size: Size;',
            '  at: Date;',
            '  note?: string;',
            '  reason: string | undefined;',
            '  parent: string | null;',
            '  mixed: string | number;',
            '  anything: unknown;',
            '  made_by: string;',
            '}> {}',
            '',
            'export interface ThingMovedPayload extends Located {',
            '  thingId: string;',
            '  shape: Shape;',
            '}',
            'interface Located { from: string; to?: string }',
            "type Shape = 'round' | 'square';",
            'export class ThingMovedIntegrationEvent extends IntegrationEvent<ThingMovedPayload> {}',
          ].join('\n'),
        },
        {
          path: `${kernel}/Domain/Kinds.ts`,
          text: "export enum Colour { RED = 'red', BLUE = 'blue' }\nexport enum Size { SMALL, LARGE }\n",
        },
      ],
      kernel,
    );
    expect(payloads).toEqual({
      ThingMade: {
        thingId: 'string',
        count: 'number',
        done: 'boolean',
        tags: 'array',
        pairs: 'array',
        meta: 'object',
        owner: 'object',
        kind: 'string',
        colour: 'string',
        size: 'number',
        at: 'string',
        note: 'string?',
        reason: 'string?',
        parent: 'string?',
        mixed: 'any',
        anything: 'any',
        madeBy: 'string',
      },
      ThingMoved: { from: 'string', to: 'string?', thingId: 'string', shape: 'string' },
    });
  });

  it('names an integration event another language carries with another payload', () => {
    const other = clone();
    other.language = 'go';
    other.integrationEvents![3].payload = { ...other.integrationEvents![3].payload, error: 'string' };
    expect(compareInventories(inventory, other)).toEqual([
      'published language: go lacks the integration event typescript has: OperationComplete (published by Tracker; { error: string?, operationId: string, result: any?, status: string, type: string, userId: string })',
      'published language: go has an integration event typescript does not: OperationComplete (published by Tracker; { error: string, operationId: string, result: any?, status: string, type: string, userId: string })',
    ]);
    delete other.integrationEvents;
    expect(compareInventories(inventory, other)).toEqual([
      "published language: go's inventory records no integrationEvents, typescript's does",
    ]);
    const stale = clone();
    stale.integrationEvents = stale.integrationEvents!.filter(event => event.name !== 'NoteShared');
    stale.integrationEvents[0].publisher = 'Notes';
    expect(inventoryChanges(stale, inventory)).toEqual([
      'published language: the integration event AccountCreated differs: publisher "Notes" → "Security"',
      'published language: the tree says the integration event NoteShared, the committed inventory does not',
    ]);
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

  it('names what a stale inventory lost, gained or says differently, before → after', () => {
    const before: Inventory = {
      schemaVersion: 1,
      language: 'typescript',
      contexts: [
        {
          id: 'Notes',
          commands: [
            {
              name: 'ShareNote',
              actor: 'a signed-in account',
              route: 'POST /notes/{param}/share',
              aggregate: 'Note',
              events: ['NoteShared'],
            },
            {
              name: 'PinNote',
              actor: 'a signed-in account',
              route: 'POST /notes/{param}/pin',
              aggregate: 'Note',
              events: ['NotePinned'],
            },
          ],
          queries: [{ name: 'GetNote', actor: 'a signed-in account', route: 'GET /notes/{param}' }],
          events: ['NotePinned', 'NoteShared'],
          policies: [{ on: 'NoteShared', kind: 'domain-event', publishes: ['NoteShared'], events: [] }],
        },
        { id: 'Tracker', commands: [], queries: [], events: [], policies: [] },
      ],
      links: [
        { mechanism: 'integration-event', upstream: 'Notes', downstream: 'Notifications', contracts: ['NoteShared'] },
      ],
    };
    const after: Inventory = {
      ...before,
      contexts: [
        {
          ...before.contexts[0],
          commands: [
            { name: 'ShareNote', actor: 'anyone', aggregate: 'Note', events: ['NoteShared'] },
            {
              name: 'ArchiveNote',
              actor: 'a signed-in account',
              route: 'POST /notes/{param}/archive',
              aggregate: 'Note',
              events: [],
            },
          ],
          events: ['NoteShared'],
          policies: [{ on: 'NoteShared', kind: 'domain-event', publishes: [], events: [] }],
        },
      ],
      links: [{ mechanism: 'integration-event', upstream: 'Notes', downstream: 'Notifications', contracts: [] }],
    };

    expect(inventoryChanges(before, after)).toEqual([
      'Notes: the command ShareNote differs: actor "a signed-in account" → "anyone"; route "POST /notes/{param}/share" → none',
      'Notes: the committed inventory has the command PinNote, the tree no longer says it',
      'Notes: the tree says the command ArchiveNote, the committed inventory does not',
      'Notes: the committed inventory has the domain event NotePinned, the tree no longer says it',
      'Notes: the policy on NoteShared differs: publishes [NoteShared] → []',
      'Tracker: the committed inventory has the context, the tree no longer says it',
      'context map: the link Notes → Notifications (integration-event) differs: contracts [NoteShared] → []',
    ]);
    expect(inventoryChanges(before, before)).toEqual([]);
  });
});
