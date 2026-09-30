import { expect, jest } from '@jest/globals';

import { EventBus, ExecutionContext } from '@Architecture/Application';
import { NoteFirstReactionIntegrationEvent } from '@SharedKernel/Application/IntegrationEvents/NoteIntegrationEvents';
import { InMemoryDataSource } from '@Architecture/Infrastructure/DataSources/InMemoryDataSource';

import { INote } from '@Contexts/Notes/Domain/Note/DTOs';
import { NoteStatus } from '@Contexts/Notes/Domain/Note/NoteStatus';
import { NoteReactedEvent } from '@Contexts/Notes/Domain/NoteReaction/Events/NoteReactionEvents';
import { NoteReactedHandler } from '@Contexts/Notes/Application/Events/NoteReactedHandler';
import { InMemoryNoteQueries } from '@Contexts/Notes/Infrastructure/Queries/InMemoryNoteQueries';

const eventBus = { connect: jest.fn(), publish: jest.fn(), subscribe: jest.fn() } as EventBus;

const store = new InMemoryDataSource<INote>();
store.collection.set('note-1', {
  _id: 'note-1',
  ownerId: 'alice',
  title: 'Roadmap',
  content: 'Q4',
  status: NoteStatus.ACTIVE,
  sharedWith: ['bob'],
  version: 1,
});
const notes = new InMemoryNoteQueries(store);

const aReaction = (firstOnNote: boolean) =>
  NoteReactedEvent.set({ reactionId: 'reaction-1', noteId: 'note-1', reactorId: 'bob', emoji: '👍', firstOnNote });

describe('NoteReactedHandler', () => {
  beforeEach(() => jest.resetAllMocks());

  it('publishes the integration event, with the note the reaction only knows by id', async () => {
    const context = new ExecutionContext({ traceId: 'trace', eventBus, auth: {} });

    await new NoteReactedHandler(notes).execute(aReaction(true), context);

    expect(eventBus.publish).toHaveBeenCalledWith(
      NoteFirstReactionIntegrationEvent.set({
        noteId: 'note-1',
        title: 'Roadmap',
        ownerId: 'alice',
        reactorId: 'bob',
        emoji: '👍',
      }),
      context,
    );
  });

  it('says nothing to the other contexts when the note had already been reacted to', async () => {
    const context = new ExecutionContext({ traceId: 'trace', eventBus, auth: {} });

    const result = await new NoteReactedHandler(notes).execute(aReaction(false), context);

    expect(result.isSuccess()).toBe(true);
    expect(eventBus.publish).not.toHaveBeenCalled();
  });
});
