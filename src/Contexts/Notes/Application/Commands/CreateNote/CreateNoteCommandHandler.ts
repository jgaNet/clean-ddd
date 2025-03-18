import { ExecutionContext, Result, IResult, CommandHandler } from '@SharedKernel/Domain/Application';

import { NoteFactory } from '@Contexts/Notes/Domain/Note/NoteFactory';
import { NoteMapper } from '@Contexts/Notes/Domain/Note/NoteMapper';
import { INoteRepository } from '@Contexts/Notes/Domain/Note/Ports/INoteRepository';
import { INoteQueries } from '@Contexts/Notes/Domain/Note/Ports/INoteQueries';
import { NoteCreatedEvent } from '@Contexts/Notes/Domain/Note/Events/NoteCreatedEvent';
import { CreateNoteCommandEvent } from '@Contexts/Notes/Application/Commands/CreateNote';
import { INote } from '@Contexts/Notes/Domain/Note';
import { Role } from '@SharedKernel/Domain/AccessControl';
import { NotAllowedException } from '@SharedKernel/Domain';

export class CreateNoteCommandHandler extends CommandHandler<CreateNoteCommandEvent> {
  #noteFactory: NoteFactory;
  #noteRepository: INoteRepository;

  constructor({ noteRepository, noteQueries }: { noteRepository: INoteRepository; noteQueries: INoteQueries }) {
    super();
    this.#noteFactory = new NoteFactory({ noteRepository, noteQueries });
    this.#noteRepository = noteRepository;
  }

  async execute({ payload }: CreateNoteCommandEvent, context: ExecutionContext): Promise<IResult<INote>> {
    // Use the context's transaction management if a UnitOfWork is available
    if (context.unitOfWork) {
      return context.withTransaction(async () => this.createNote(payload, context));
    }

    // Otherwise, fall back to the non-transactional approach
    return this.createNote(payload, context);
  }

  protected async guard(_: never, { auth }: ExecutionContext): Promise<IResult> {
    if (!auth.role || ![Role.ADMIN].includes(auth.role)) {
      return Result.fail(new NotAllowedException('Notes', 'Forbidden'));
    }
    return Result.ok();
  }

  private async createNote(
    payload: CreateNoteCommandEvent['payload'],
    context: ExecutionContext,
  ): Promise<IResult<INote>> {
    try {
      // Log the operation using the context
      if (context.logger) {
        context.logger.info(`Creating note with title: ${payload.title}`, {
          traceId: context.traceId,
          note: payload,
        });
      }

      if (!context.auth || !context.auth.subjectId) {
        if (!context.auth.subjectId) {
          return Result.fail(new Error('User not authenticated'));
        }
      }

      // Create the note
      const newNoteResult = await this.#noteFactory.new({ ...payload, ownerId: context.auth.subjectId });

      if (newNoteResult.isFailure()) {
        if (context.logger) {
          context.logger.error('Failed to create note', newNoteResult.error, {
            traceId: context.traceId,
          });
        }
        return newNoteResult;
      }

      // Map to JSON and save
      const newNoteJSON = NoteMapper.toJSON(newNoteResult.data);
      await this.#noteRepository.save(newNoteJSON);

      // Use the context's event bus to dispatch the event
      context.eventBus.publish(NoteCreatedEvent.set(newNoteJSON), context);

      // Log success
      if (context.logger) {
        context.logger.info(`Note created successfully with ID: ${newNoteJSON._id}`, {
          traceId: context.traceId,
          noteId: newNoteJSON._id,
        });
      }

      return Result.ok(newNoteJSON);
    } catch (e) {
      // Log error
      if (context.logger) {
        context.logger.error('Unexpected error while creating note', e, {
          traceId: context.traceId,
        });
      }

      return Result.fail(e);
    }
  }
}
