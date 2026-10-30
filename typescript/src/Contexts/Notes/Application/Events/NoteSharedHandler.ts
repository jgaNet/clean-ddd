import { IResult, Result } from '@Architecture/Domain';
import { EventHandler, ExecutionContext, publishIntegrationEvent } from '@Architecture/Application';
import { NoteSharedIntegrationEvent } from '@SharedKernel/Application/IntegrationEvents/NoteIntegrationEvents';

import { NoteSharedEvent } from '@Contexts/Notes/Domain/Note/Events/NoteEvents';

/**
 * Where a domain event leaves its context. The handler owns the translation from the
 * Notes vocabulary (NoteSharedEvent, internal) to the published one
 * (NoteSharedIntegrationEvent, shared kernel). Nothing else about Notes crosses the border.
 * The fact goes out through the outbox, when the reaction's own transaction commits (ADR 30).
 */
export class NoteSharedHandler extends EventHandler<NoteSharedEvent> {
  async execute({ payload }: NoteSharedEvent, context: ExecutionContext): Promise<IResult> {
    context.logger?.debug(`Note ${payload.noteId} shared with ${payload.recipientId}`, { traceId: context.traceId });

    publishIntegrationEvent(
      NoteSharedIntegrationEvent.set({
        noteId: payload.noteId,
        title: payload.title,
        ownerId: payload.ownerId,
        recipientId: payload.recipientId,
      }),
      context,
    );

    return Result.ok();
  }
}
