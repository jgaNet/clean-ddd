import { expect, jest } from '@jest/globals';

import { EventBus, ExecutionContext } from '@Architecture/Application';
import { NoteSharedIntegrationEvent } from '@SharedKernel/Application/IntegrationEvents/NoteIntegrationEvents';

import { NoteSharedEvent } from '@Contexts/Notes/Domain/Note/Events/NoteEvents';
import { NoteSharedHandler } from '@Contexts/Notes/Application/Events/NoteSharedHandler';

const eventBus = { connect: jest.fn(), publish: jest.fn(), subscribe: jest.fn() } as EventBus;

describe('NoteSharedHandler', () => {
  it('republishes the domain event as the integration event other contexts subscribe to', async () => {
    const context = new ExecutionContext({ traceId: 'trace', eventBus, auth: {} });

    await new NoteSharedHandler().execute(
      NoteSharedEvent.set({ noteId: 'note-1', title: 'Groceries', ownerId: 'alice', recipientId: 'bob' }),
      context,
    );

    expect(eventBus.publish).toHaveBeenCalledWith(
      NoteSharedIntegrationEvent.set({ noteId: 'note-1', title: 'Groceries', ownerId: 'alice', recipientId: 'bob' }),
      context,
    );
  });
});
