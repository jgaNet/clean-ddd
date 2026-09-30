import { IResult } from '@Architecture/Domain';
import { EventHandler, ExecutionContext } from '@Architecture/Application';
import { NoteFirstReactionIntegrationEvent } from '@SharedKernel/Application/IntegrationEvents/NoteIntegrationEvents';

import { Channel } from '@Contexts/Notifications/Domain/Notification/Channel';
import { NotificationDelivery } from '@Contexts/Notifications/Application/Services/NotificationDelivery';

/**
 * Anti-corruption layer of the Notifications context towards Notes, for reactions.
 *
 * It knows the published contract and nothing else about Notes: that the fact is published
 * once per note is the publisher's rule, not a filter repeated here. It restates it in the
 * Notifications vocabulary — a recipient, a title, a channel — and hands it to the local
 * use case.
 */
export class NoteFirstReactionIntegrationEventHandler extends EventHandler<NoteFirstReactionIntegrationEvent> {
  constructor(private delivery: NotificationDelivery) {
    super();
  }

  execute({ payload }: NoteFirstReactionIntegrationEvent, context: ExecutionContext): Promise<IResult<string>> {
    return this.delivery.deliver(
      {
        recipientId: payload.ownerId,
        title: `Someone reacted to your note: ${payload.title}`,
        content: `Your note "${payload.title}" got its first reaction: ${payload.emoji}.`,
        channels: [Channel.WEBSOCKET],
        metadata: { noteId: payload.noteId, reactedBy: payload.reactorId, source: 'Notes.NoteFirstReaction' },
      },
      context,
    );
  }
}
