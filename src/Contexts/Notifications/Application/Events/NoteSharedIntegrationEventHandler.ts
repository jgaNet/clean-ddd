import { IResult, Result } from '@SharedKernel/Domain';
import { EventHandler, ExecutionContext } from '@SharedKernel/Application';
import { NoteSharedIntegrationEvent } from '@SharedKernel/Application/IntegrationEvents/NoteIntegrationEvents';

import { NotificationType } from '@Contexts/Notifications/Domain/Notification/Notification';
import { DeliveryStrategy } from '@Contexts/Notifications/Domain/Notification/DeliveryStrategy';
import { INotificationService } from '@Contexts/Notifications/Domain/Notification/Ports/INotificationService';

/**
 * Anti-corruption layer of the Notifications context towards Notes.
 *
 * It knows the published contract (NoteSharedIntegrationEvent) and nothing else about
 * Notes: no Note aggregate, no Notes exception, no Notes port. It restates the fact in the
 * Notifications vocabulary (a recipient, a title, a channel) and hands it to the local
 * service. If the Notes contract changes, this file is the only one to touch here.
 */
export class NoteSharedIntegrationEventHandler extends EventHandler<NoteSharedIntegrationEvent> {
  constructor(private notificationService: INotificationService) {
    super();
  }

  async execute({ payload }: NoteSharedIntegrationEvent, context: ExecutionContext): Promise<IResult> {
    await this.notificationService.send(
      {
        recipientId: payload.recipientId,
        type: NotificationType.WEBSOCKET,
        deliveryStrategy: DeliveryStrategy.websocketOnly(),
        title: `A note was shared with you: ${payload.title}`,
        content: `You now have access to the note "${payload.title}".`,
        metadata: { noteId: payload.noteId, sharedBy: payload.ownerId, source: 'Notes.NoteShared' },
      },
      context,
    );

    return Result.ok();
  }
}
