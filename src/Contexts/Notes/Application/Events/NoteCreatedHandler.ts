import { EventHandler, IResult, Result, ExecutionContext } from '@SharedKernel/Domain/Application';
import { NoteCreatedEvent } from '@Contexts/Notes/Domain/Note/Events/NoteCreatedEvent';

export class NoteCreatedHandler extends EventHandler<NoteCreatedEvent> {
  async execute(event: NoteCreatedEvent, context: ExecutionContext): Promise<IResult> {
    context.logger?.debug(`Note ${event.payload._id} created`, {
      traceId: context.traceId,
    });

    return Result.ok();
  }
}
