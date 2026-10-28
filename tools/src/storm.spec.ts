import { loadArchitectureContract, repositoryRoot } from './load';
import {
  describeEventStorm,
  inspectEventStorm,
  publicName,
  renderBigPicture,
  renderEventStorm,
  renderEventStormSvg,
  renderProcess,
} from './storm';

/**
 * The event storm is read from the code, so these specs pin what the reading must find on the
 * repository's own tree: the stickies of each context and the pivots between them. A shape the
 * reading stops recognising is a shape the guides stopped teaching; these fail first.
 */

const root = repositoryRoot();
const contract = loadArchitectureContract(root);
const storm = inspectEventStorm(contract, root);
const context = (id: string) => storm.contexts.find(each => each.id === id)!;

describe('the event storm read from the code', () => {
  it('names things by their public name, without the suffix of their kind', () => {
    expect(publicName('ShareNoteCommandEvent')).toBe('ShareNote');
    expect(publicName('NoteSharedIntegrationEvent')).toBe('NoteShared');
    expect(publicName('GetMyNotesQueryHandler')).toBe('GetMyNotes');
    expect(publicName('NoteSharedEvent')).toBe('NoteShared');
  });

  it('finds every command of a context with its actor, its route, its aggregate, its behaviour and its events', () => {
    const notes = context('Notes');
    expect(notes.commands.map(command => command.name)).toEqual([
      'CreateNote',
      'EditNote',
      'ArchiveNote',
      'RestoreNote',
      'ShareNote',
      'SuggestNoteTitle',
    ]);
    const share = notes.commands.find(command => command.name === 'ShareNote')!;
    expect(share).toMatchObject({
      actor: 'a signed-in account',
      route: 'POST /notes/:id/share',
      aggregate: 'Note',
      behaviours: ['Note.shareWith'],
      events: ['NoteShared'],
      services: ['NoteSharing.share'],
      uses: ['AccountDirectory'],
    });
    expect(notes.commands.find(command => command.name === 'CreateNote')).toMatchObject({
      behaviours: ['Note.create'],
      events: ['NoteCreated'],
    });
  });

  it('tells an administrator from a signed-in account from anyone', () => {
    expect(context('Notifications').commands.find(command => command.name === 'SendNotification')!.actor).toBe(
      'an administrator',
    );
    expect(context('Security').commands.find(command => command.name === 'SignUp')!.actor).toBe('anyone');
    expect(context('Tracker').readModels.find(readModel => readModel.name === 'GetOperations')!.actor).toBe(
      'an administrator',
    );
    expect(context('Security').readModels.find(readModel => readModel.name === 'GetAccount')!.actor).toBe(
      'a signed-in account',
    );
  });

  it('follows a command through a service to the aggregate and its events', () => {
    const send = context('Notifications').commands.find(command => command.name === 'SendNotification')!;
    expect(send.services).toEqual(['NotificationDelivery.deliver']);
    expect(send.behaviours).toEqual(['Notification.recordAttempt']);
    expect(send.events).toEqual(['NotificationSent', 'NotificationFailed']);
    expect(send.uses).toEqual(['NotificationChannel']);
  });

  it('finds the policies: what they react to, what they publish, what they reach', () => {
    const notes = context('Notes');
    expect(notes.policies).toContainEqual(
      expect.objectContaining({
        name: 'NoteSharedHandler',
        on: { kind: 'domain-event', event: 'NoteShared' },
        publishes: ['NoteShared'],
      }),
    );
    expect(context('Notifications').policies).toContainEqual(
      expect.objectContaining({
        name: 'NoteSharedIntegrationEventHandler',
        on: { kind: 'integration-event', event: 'NoteShared' },
        events: ['NotificationSent', 'NotificationFailed'],
      }),
    );
    expect(context('Tracker').policies).toContainEqual(
      expect.objectContaining({
        name: 'TrackedEventBus',
        on: { kind: 'every-operation', event: 'every operation' },
        publishes: ['OperationComplete'],
      }),
    );
  });

  it('finds the read models and the external systems, and who answers a port to another context', () => {
    expect(context('Notes').readModels.map(readModel => [readModel.name, readModel.model, readModel.route])).toEqual([
      ['GetMyNotes', 'NoteListItem[]', 'GET /notes'],
      ['GetNote', 'NoteDetail', 'GET /notes/:id'],
      ['GetNotesSharedWithMe', 'SharedNoteListItem[]', 'GET /notes/shared'],
    ]);
    expect(context('Notes').externals).toContainEqual(
      expect.objectContaining({
        name: 'AccountDirectory',
        answeredBy: 'Security',
        adapters: ['SecurityAccountDirectory'],
      }),
    );
    expect(
      context('Notes')
        .externals.map(external => external.name)
        .sort(),
    ).toEqual(['AccountDirectory', 'NoteTitleSuggestions']);
    expect(
      context('Security')
        .externals.map(external => external.name)
        .sort(),
    ).toEqual(['PasswordHasher', 'SignedTokens']);
    expect(
      context('Notifications')
        .externals.find(external => external.name === 'NotificationChannel')!
        .adapters.sort(),
    ).toEqual(['EmailChannel', 'WebSocketChannel']);
  });

  it('knows every domain event, who records it and who handles it', () => {
    const shared = context('Notes').events.find(event => event.name === 'NoteShared')!;
    expect(shared).toMatchObject({
      aggregate: 'Note',
      recordedBy: ['Note.shareWith'],
      policies: ['NoteSharedHandler'],
    });
    expect(context('Notes').events.find(event => event.name === 'NoteEdited')!.policies).toEqual([]);
  });

  it('pivots between contexts on the integration events, the same ones the context map links', () => {
    expect(storm.integrationEvents.map(event => event.name).sort()).toEqual([
      'AccountCreated',
      'AccountValidated',
      'NoteShared',
      'OperationComplete',
    ]);
    const noteShared = storm.integrationEvents.find(event => event.name === 'NoteShared')!;
    expect(noteShared.publishedBy).toEqual([{ context: 'Notes', policy: 'NoteSharedHandler' }]);
    expect(noteShared.consumedBy).toEqual([{ context: 'Notifications', policy: 'NoteSharedIntegrationEventHandler' }]);
    expect(storm.links.map(link => `${link.upstream}→${link.downstream}`).sort()).toEqual([
      'Notes→Notifications',
      'Security→Notes',
      'Security→Notifications',
      'Tracker→Notifications',
    ]);
  });
});

describe('the rendered storm', () => {
  it('draws the big picture with a lane per context and a hexagon per pivot', () => {
    const picture = renderBigPicture(storm);
    expect(picture).toContain('subgraph Notes["Notes"]');
    expect(picture).toContain('ie_NoteShared{{"NoteShared"}}:::integration');
    expect(picture).toContain('e_Notes_NoteShared -- "NoteSharedHandler" --> ie_NoteShared');
  });

  it('draws a context at process level: actor, command, aggregate, event, policy, read model, external system', () => {
    const notes = renderProcess(context('Notes'), storm);
    expect(notes).toContain('a_Notes_a_signed_in_account["a signed-in account"]:::actor');
    expect(notes).toContain('c_Notes_ShareNote -- "shareWith" --> ag_Notes_Note');
    expect(notes).toContain('ag_Notes_Note --> e_Notes_NoteShared');
    expect(notes).toContain('c_Notes_ShareNote -.-> x_Notes_AccountDirectory');
    expect(notes).toContain('p_Notes_NoteSharedHandler --> ie_NoteShared');
    expect(notes).toContain(':::readmodel');
  });

  it('renders the Markdown with its tables, the SVG board and the words', () => {
    const markdown = renderEventStorm(storm);
    expect(markdown).toContain('### The big picture');
    expect(markdown).toContain(
      '| a signed-in account | `ShareNote` | `POST /notes/:id/share` | `Note.shareWith` | `NoteShared` |',
    );
    expect(markdown).toContain('| `NoteShared` (integration event) | `NoteSharedIntegrationEventHandler` |');
    const svg = renderEventStormSvg(storm);
    expect(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg"')).toBe(true);
    expect(svg).toContain('>ShareNote<');
    expect(svg).toContain('>OperationComplete<');
    expect(describeEventStorm(storm)).toContain(
      'a signed-in account → ShareNote (POST /notes/:id/share) → Note → NoteShared',
    );
  });
});
