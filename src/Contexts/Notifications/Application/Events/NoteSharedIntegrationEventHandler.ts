import { IResult } from '@Architecture/Domain';
import { EventHandler, ExecutionContext } from '@Architecture/Application';
import { NoteSharedIntegrationEvent } from '@SharedKernel/Application/IntegrationEvents/NoteIntegrationEvents';

import { Channel } from '@Contexts/Notifications/Domain/Notification/Channel';
import { NotificationDelivery } from '@Contexts/Notifications/Application/Services/NotificationDelivery';

/**
 * Anti-corruption layer of the Notifications context towards Notes.
 *
 * It knows the published contract (NoteSharedIntegrationEvent) and nothing else about
 * Notes: no Note aggregate, no Notes exception, no Notes port. It restates the fact in the
 * Notifications vocabulary (a recipient, a title, channels) and hands it to the local
 * use case. If the Notes contract changes, this file is the only one to touch here.
 */
export class NoteSharedIntegrationEventHandler extends EventHandler<NoteSharedIntegrationEvent> {
  constructor(private delivery: NotificationDelivery) {
    super();
  }

  execute({ payload }: NoteSharedIntegrationEvent, context: ExecutionContext): Promise<IResult<string>> {
    return this.delivery.deliver(
      {
        recipientId: payload.recipientId,
        title: `A note was shared with you: ${payload.title}`,
        content: `You now have access to the note "${payload.title}".`,
        channels: [Channel.WEBSOCKET],
        metadata: { noteId: payload.noteId, sharedBy: payload.ownerId, source: 'Notes.NoteShared' },
      },
      context,
    );
  }
}
