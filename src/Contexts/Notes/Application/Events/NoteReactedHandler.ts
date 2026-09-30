import { IResult, Result } from '@Architecture/Domain';
import { EventHandler, ExecutionContext } from '@Architecture/Application';
import { NoteFirstReactionIntegrationEvent } from '@SharedKernel/Application/IntegrationEvents/NoteIntegrationEvents';

import { NoteReactedEvent } from '@Contexts/Notes/Domain/NoteReaction/Events/NoteReactionEvents';
import { INoteQueries } from '@Contexts/Notes/Domain/Note/Ports/INoteQueries';
import { NoteNotFoundException } from '@Contexts/Notes/Domain/Note/NoteExceptions';

/**
 * Where the fact leaves the context, and only when it is the one another context asked for:
 * the owner is told the first time someone reacts, so only a first reaction is published.
 * Which one that is was decided by the domain and travels on the event.
 *
 * The reaction knows the note by id alone, on purpose; the published contract speaks of a note,
 * with its title and its owner, so the translation reads them from the Notes read side here
 * rather than copying them into every reaction.
 */
export class NoteReactedHandler extends EventHandler<NoteReactedEvent> {
  constructor(private notes: INoteQueries) {
    super();
  }

  async execute({ payload }: NoteReactedEvent, context: ExecutionContext): Promise<IResult> {
    if (!payload.firstOnNote) return Result.ok();

    const note = await this.notes.findById(payload.noteId);
    if (!note) return Result.fail(new NoteNotFoundException(payload.noteId));

    context.logger?.debug(`Note ${payload.noteId} got its first reaction`, { traceId: context.traceId });

    context.eventBus.publish(
      NoteFirstReactionIntegrationEvent.set({
        noteId: payload.noteId,
        title: note.title,
        ownerId: note.ownerId,
        reactorId: payload.reactorId,
        emoji: payload.emoji,
      }),
      context,
    );

    return Result.ok();
  }
}
