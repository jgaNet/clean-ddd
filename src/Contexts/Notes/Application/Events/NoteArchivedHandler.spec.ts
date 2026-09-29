import { expect, jest } from '@jest/globals';

import { EventBus, ExecutionContext } from '@SharedKernel/Application';
import { NoteArchivedIntegrationEvent } from '@SharedKernel/Application/IntegrationEvents/NoteIntegrationEvents';

import { NoteArchivedEvent } from '@Contexts/Notes/Domain/Note/Events/NoteEvents';
import { NoteArchivedHandler } from '@Contexts/Notes/Application/Events/NoteArchivedHandler';

const eventBus = { connect: jest.fn(), publish: jest.fn(), subscribe: jest.fn() } as EventBus;

describe('NoteArchivedHandler', () => {
  it('republishes the domain event as the integration event, with the accounts the note was shared with', async () => {
    const context = new ExecutionContext({ traceId: 'trace', eventBus, auth: {} });

    await new NoteArchivedHandler().execute(
      NoteArchivedEvent.set({ noteId: 'note-1', title: 'Groceries', ownerId: 'alice', sharedWith: ['bob', 'carol'] }),
      context,
    );

    expect(eventBus.publish).toHaveBeenCalledWith(
      NoteArchivedIntegrationEvent.set({
        noteId: 'note-1',
        title: 'Groceries',
        ownerId: 'alice',
        recipientIds: ['bob', 'carol'],
      }),
      context,
    );
  });
});
