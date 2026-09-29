import { IResult, Result } from '@SharedKernel/Domain';
import { EventHandler, ExecutionContext } from '@SharedKernel/Application';
import { NoteArchivedIntegrationEvent } from '@SharedKernel/Application/IntegrationEvents/NoteIntegrationEvents';

import { Channel } from '@Contexts/Notifications/Domain/Notification/Channel';
import { NotificationDelivery } from '@Contexts/Notifications/Application/Services/NotificationDelivery';

/**
 * Anti-corruption layer of the Notifications context towards Notes, for an archived note.
 *
 * It knows the published contract (NoteArchivedIntegrationEvent) and nothing else about Notes.
 * Each account the note was shared with becomes a recipient of one notification saying the
 * note is no longer available; a note shared with nobody produces none.
 */
export class NoteArchivedIntegrationEventHandler extends EventHandler<NoteArchivedIntegrationEvent> {
  constructor(private delivery: NotificationDelivery) {
    super();
  }

  async execute({ payload }: NoteArchivedIntegrationEvent, context: ExecutionContext): Promise<IResult<string[]>> {
    const notificationIds: string[] = [];

    for (const recipientId of payload.recipientIds) {
      const delivered = await this.delivery.deliver(
        {
          recipientId,
          title: `A note shared with you is no longer available: ${payload.title}`,
          content: `The note "${payload.title}" was archived by its owner.`,
          channels: [Channel.WEBSOCKET],
          metadata: { noteId: payload.noteId, archivedBy: payload.ownerId, source: 'Notes.NoteArchived' },
        },
        context,
      );
      if (delivered.isFailure()) return delivered;
      notificationIds.push(delivered.data);
    }

    return Result.ok(notificationIds);
  }
}
