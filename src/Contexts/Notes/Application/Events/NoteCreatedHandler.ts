import { IResult, Result } from '@SharedKernel/Domain';
import { EventHandler, ExecutionContext } from '@SharedKernel/Application';
import { NoteCreatedEvent } from '@Contexts/Notes/Domain/Note/Events/NoteEvents';

export class NoteCreatedHandler extends EventHandler<NoteCreatedEvent> {
  async execute(event: NoteCreatedEvent, context: ExecutionContext): Promise<IResult> {
    context.logger?.debug(`Note ${event.payload.noteId} created by ${event.payload.ownerId}`, {
      traceId: context.traceId,
    });

    return Result.ok();
  }
}
