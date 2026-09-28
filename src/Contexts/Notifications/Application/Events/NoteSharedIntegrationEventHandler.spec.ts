import { expect, jest } from '@jest/globals';

import { EventBus, ExecutionContext } from '@SharedKernel/Application';
import { NoteSharedIntegrationEvent } from '@SharedKernel/Application/IntegrationEvents/NoteIntegrationEvents';
import { InMemoryDataSource } from '@SharedKernel/Infrastructure/DataSources/InMemoryDataSource';

import { Channel } from '@Contexts/Notifications/Domain/Notification/Channel';
import { INotification } from '@Contexts/Notifications/Domain/Notification/DTOs';
import { InMemoryNotificationRepository } from '@Contexts/Notifications/Infrastructure/Repositories/InMemoryNotificationRepository';
import { NotificationDelivery } from '@Contexts/Notifications/Application/Services/NotificationDelivery';
import { FakeChannel } from '@Contexts/Notifications/Application/Services/FakeChannel.spec-helper';
import { NoteSharedIntegrationEventHandler } from '@Contexts/Notifications/Application/Events/NoteSharedIntegrationEventHandler';

const eventBus = { connect: jest.fn(), publish: jest.fn(), subscribe: jest.fn() } as EventBus;

describe('NoteSharedIntegrationEventHandler (anti-corruption layer)', () => {
  it('turns the Notes fact into a live notification for the recipient, in Notifications terms', async () => {
    const websocket = new FakeChannel(Channel.WEBSOCKET);
    const store = new InMemoryDataSource<INotification>();
    const delivery = new NotificationDelivery(new InMemoryNotificationRepository(store), [websocket]);

    await new NoteSharedIntegrationEventHandler(delivery).execute(
      NoteSharedIntegrationEvent.set({ noteId: 'note-1', title: 'Groceries', ownerId: 'alice', recipientId: 'bob' }),
      new ExecutionContext({ traceId: 'trace', eventBus, auth: {} }),
    );

    expect(websocket.delivered).toHaveLength(1);
    expect(websocket.delivered[0]).toMatchObject({
      recipientId: 'bob',
      title: 'A note was shared with you: Groceries',
      metadata: { noteId: 'note-1', sharedBy: 'alice', source: 'Notes.NoteShared' },
    });
    expect([...store.collection.values()][0]).toMatchObject({ recipientId: 'bob', channels: [Channel.WEBSOCKET] });
  });
});
