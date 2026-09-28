import { IResult, Result } from '@SharedKernel/Domain';
import { EventHandler, ExecutionContext } from '@SharedKernel/Application';
import { NoteSharedIntegrationEvent } from '@SharedKernel/Application/IntegrationEvents/NoteIntegrationEvents';

import { NoteSharedEvent } from '@Contexts/Notes/Domain/Note/Events/NoteEvents';

/**
 * Where a domain event leaves its context. The handler owns the translation from the
 * Notes vocabulary (NoteSharedEvent, internal) to the published one
 * (NoteSharedIntegrationEvent, shared kernel). Nothing else about Notes crosses the border.
 */
export class NoteSharedHandler extends EventHandler<NoteSharedEvent> {
  async execute({ payload }: NoteSharedEvent, context: ExecutionContext): Promise<IResult> {
    context.logger?.debug(`Note ${payload.noteId} shared with ${payload.recipientId}`, { traceId: context.traceId });

    context.eventBus.publish(
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
