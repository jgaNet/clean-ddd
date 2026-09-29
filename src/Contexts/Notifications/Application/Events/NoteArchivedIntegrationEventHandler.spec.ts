import { expect, jest } from '@jest/globals';

import { EventBus, ExecutionContext } from '@SharedKernel/Application';
import { NoteArchivedIntegrationEvent } from '@SharedKernel/Application/IntegrationEvents/NoteIntegrationEvents';
import { InMemoryDataSource } from '@SharedKernel/Infrastructure/DataSources/InMemoryDataSource';

import { Channel } from '@Contexts/Notifications/Domain/Notification/Channel';
import { INotification } from '@Contexts/Notifications/Domain/Notification/DTOs';
import { InMemoryNotificationRepository } from '@Contexts/Notifications/Infrastructure/Repositories/InMemoryNotificationRepository';
import { NotificationDelivery } from '@Contexts/Notifications/Application/Services/NotificationDelivery';
import { FakeChannel } from '@Contexts/Notifications/Application/Services/FakeChannel.spec-helper';
import { NoteArchivedIntegrationEventHandler } from '@Contexts/Notifications/Application/Events/NoteArchivedIntegrationEventHandler';

const eventBus = { connect: jest.fn(), publish: jest.fn(), subscribe: jest.fn() } as EventBus;

function aDelivery(): {
  websocket: FakeChannel;
  store: InMemoryDataSource<INotification>;
  delivery: NotificationDelivery;
} {
  const websocket = new FakeChannel(Channel.WEBSOCKET);
  const store = new InMemoryDataSource<INotification>();
  const delivery = new NotificationDelivery(new InMemoryNotificationRepository(store), [websocket]);
  return { websocket, store, delivery };
}

describe('NoteArchivedIntegrationEventHandler (anti-corruption layer)', () => {
  it('tells every account the note was shared with that it is no longer available, in Notifications terms', async () => {
    const { websocket, store, delivery } = aDelivery();

    const result = await new NoteArchivedIntegrationEventHandler(delivery).execute(
      NoteArchivedIntegrationEvent.set({
        noteId: 'note-1',
        title: 'Groceries',
        ownerId: 'alice',
        recipientIds: ['bob', 'carol'],
      }),
      new ExecutionContext({ traceId: 'trace', eventBus, auth: {} }),
    );

    expect(result.isSuccess()).toBe(true);
    expect(result.data).toHaveLength(2);
    expect(websocket.delivered).toHaveLength(2);
    expect(websocket.delivered.map(delivered => delivered.recipientId)).toEqual(['bob', 'carol']);
    expect(websocket.delivered[0]).toMatchObject({
      title: 'A note shared with you is no longer available: Groceries',
      metadata: { noteId: 'note-1', archivedBy: 'alice', source: 'Notes.NoteArchived' },
    });
    expect([...store.collection.values()].map(notification => notification.recipientId)).toEqual(['bob', 'carol']);
  });

  it('notifies nobody when the note was shared with nobody', async () => {
    const { websocket, store, delivery } = aDelivery();

    const result = await new NoteArchivedIntegrationEventHandler(delivery).execute(
      NoteArchivedIntegrationEvent.set({ noteId: 'note-1', title: 'Groceries', ownerId: 'alice', recipientIds: [] }),
      new ExecutionContext({ traceId: 'trace', eventBus, auth: {} }),
    );

    expect(result.isSuccess()).toBe(true);
    expect(websocket.delivered).toHaveLength(0);
    expect(store.collection.size).toBe(0);
  });
});
