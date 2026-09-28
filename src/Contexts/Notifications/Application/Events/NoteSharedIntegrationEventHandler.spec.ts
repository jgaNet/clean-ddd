import { expect, jest } from '@jest/globals';

import { IResult, Result } from '@SharedKernel/Domain';
import { EventBus, ExecutionContext } from '@SharedKernel/Application';
import { NoteSharedIntegrationEvent } from '@SharedKernel/Application/IntegrationEvents/NoteIntegrationEvents';

import { NotificationType } from '@Contexts/Notifications/Domain/Notification/Notification';
import {
  INotificationService,
  NotificationRequest,
} from '@Contexts/Notifications/Domain/Notification/Ports/INotificationService';
import { NoteSharedIntegrationEventHandler } from '@Contexts/Notifications/Application/Events/NoteSharedIntegrationEventHandler';

const eventBus = { connect: jest.fn(), publish: jest.fn(), subscribe: jest.fn() } as EventBus;

/** Records what the handler asked for; the tests look at the request, not at any delivery. */
class FakeNotificationService implements INotificationService {
  sent: NotificationRequest[] = [];

  async send(request: NotificationRequest) {
    this.sent.push(request);
    return true;
  }
  async sendViaChannel(): Promise<IResult<void>> {
    return Result.ok();
  }
  async isChannelAvailable() {
    return true;
  }
}

describe('NoteSharedIntegrationEventHandler (anti-corruption layer)', () => {
  it('turns the Notes fact into a notification for the recipient, in Notifications terms', async () => {
    const service = new FakeNotificationService();
    const context = new ExecutionContext({ traceId: 'trace', eventBus, auth: {} });

    await new NoteSharedIntegrationEventHandler(service).execute(
      NoteSharedIntegrationEvent.set({ noteId: 'note-1', title: 'Groceries', ownerId: 'alice', recipientId: 'bob' }),
      context,
    );

    expect(service.sent).toHaveLength(1);
    expect(service.sent[0]).toMatchObject({
      recipientId: 'bob',
      type: NotificationType.WEBSOCKET,
      title: 'A note was shared with you: Groceries',
      metadata: { noteId: 'note-1', sharedBy: 'alice', source: 'Notes.NoteShared' },
    });
    expect(service.sent[0].deliveryStrategy.getChannels()).toEqual([NotificationType.WEBSOCKET]);
  });
});
