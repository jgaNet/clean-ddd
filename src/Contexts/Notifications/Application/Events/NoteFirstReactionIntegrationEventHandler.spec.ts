import { expect, jest } from '@jest/globals';

import { EventBus, ExecutionContext } from '@Architecture/Application';
import { NoteFirstReactionIntegrationEvent } from '@SharedKernel/Application/IntegrationEvents/NoteIntegrationEvents';
import { InMemoryDataSource } from '@Architecture/Infrastructure/DataSources/InMemoryDataSource';

import { Channel } from '@Contexts/Notifications/Domain/Notification/Channel';
import { INotification } from '@Contexts/Notifications/Domain/Notification/DTOs';
import { InMemoryNotificationRepository } from '@Contexts/Notifications/Infrastructure/Repositories/InMemoryNotificationRepository';
import { NotificationDelivery } from '@Contexts/Notifications/Application/Services/NotificationDelivery';
import { FakeChannel } from '@Contexts/Notifications/Application/Services/FakeChannel.spec-helper';
import { NoteFirstReactionIntegrationEventHandler } from '@Contexts/Notifications/Application/Events/NoteFirstReactionIntegrationEventHandler';

const eventBus = { connect: jest.fn(), publish: jest.fn(), subscribe: jest.fn() } as EventBus;

describe('NoteFirstReactionIntegrationEventHandler (anti-corruption layer)', () => {
  it('tells the owner, in Notifications terms, that their note was reacted to', async () => {
    const websocket = new FakeChannel(Channel.WEBSOCKET);
    const store = new InMemoryDataSource<INotification>();
    const delivery = new NotificationDelivery(new InMemoryNotificationRepository(store), [websocket]);

    await new NoteFirstReactionIntegrationEventHandler(delivery).execute(
      NoteFirstReactionIntegrationEvent.set({
        noteId: 'note-1',
        title: 'Roadmap',
        ownerId: 'alice',
        reactorId: 'bob',
        emoji: '👍',
      }),
      new ExecutionContext({ traceId: 'trace', eventBus, auth: {} }),
    );

    expect(websocket.delivered).toHaveLength(1);
    expect(websocket.delivered[0]).toMatchObject({
      recipientId: 'alice',
      title: 'Someone reacted to your note: Roadmap',
      metadata: { noteId: 'note-1', reactedBy: 'bob', source: 'Notes.NoteFirstReaction' },
    });
  });
});
