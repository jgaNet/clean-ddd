import { IResult, Result } from '@SharedKernel/Domain';
import { EventHandler, ExecutionContext } from '@SharedKernel/Application';
import { NoteArchivedIntegrationEvent } from '@SharedKernel/Application/IntegrationEvents/NoteIntegrationEvents';

import { NoteArchivedEvent } from '@Contexts/Notes/Domain/Note/Events/NoteEvents';

/**
 * Where the archiving of a note leaves the Notes context. It translates the internal
 * NoteArchivedEvent into the published NoteArchivedIntegrationEvent, and that is all: whether
 * anyone must be told, and how, is the business of the contexts that subscribe to it.
 */
export class NoteArchivedHandler extends EventHandler<NoteArchivedEvent> {
  async execute({ payload }: NoteArchivedEvent, context: ExecutionContext): Promise<IResult> {
    context.logger?.debug(`Note ${payload.noteId} archived, shared with ${payload.sharedWith.length} account(s)`, {
      traceId: context.traceId,
    });

    context.eventBus.publish(
      NoteArchivedIntegrationEvent.set({
        noteId: payload.noteId,
        title: payload.title,
        ownerId: payload.ownerId,
        recipientIds: payload.sharedWith,
      }),
      context,
    );

    return Result.ok();
  }
}
