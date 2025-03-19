import { FastifyReply, FastifyRequest } from 'fastify';
import { CreateNoteReqBody } from '@Contexts/Notes/Presentation/API/REST/Routes/note.routes.schema';
import { CreateNoteCommandEvent } from '@Contexts/Notes/Application/Commands/CreateNote/CreateNoteCommandEvent';
import { NotesModuleQueries } from '@Contexts/Notes/Application/DTOs';
import { GetNotesQueryHandler } from '@Contexts/Notes/Application/Queries/GetNotes/GetNotesQueryHandler';

export class FastifyNoteController {
  #queries: NotesModuleQueries;

  constructor({ queries: ModuleQueries }: { queries: NotesModuleQueries }) {
    this.#queries = ModuleQueries;
  }

  async createNote(req: FastifyRequest<{ Body: CreateNoteReqBody }>, reply: FastifyReply) {
    try {
      // Get the execution context from the request
      const context = req.executionContext;

      // Log the operation start using the context
      context.logger?.info('Creating a new note', {
        traceId: context.traceId,
        title: req.body.title,
      });

      // Create and dispatch the command using the context's event s
      const operation = context.eventBus.publish(
        CreateNoteCommandEvent.set({
          content: req.body.content,
          title: req.body.title,
        }),
        context,
      );

      reply.code(202);
      return {
        currentOperation: operation,
      };
    } catch (e) {
      // Log the error using the context
      req.executionContext.logger?.error('Error creating note', e, {
        traceId: req.executionContext.traceId,
        email: req.body.email,
      });

      reply.code(400);
      return e;
    }
  }

  async getNotes(req: FastifyRequest, reply: FastifyReply) {
    try {
      // Get the execution context from the request
      const context = req.executionContext;

      // Log the operation
      context.logger?.info('Fetching all notes', {
        traceId: context.traceId,
      });

      // Get the query handler
      const query = this.#queries.find(q => q.name == GetNotesQueryHandler.name) as { handler: GetNotesQueryHandler };

      // Execute the query with context
      const result = await query?.handler.executeWithContext(undefined, context);

      if (result?.isFailure()) {
        throw result.error;
      }

      return result?.data;
    } catch (e) {
      // Log the error
      req.executionContext.logger?.error('Error fetching notes', e, {
        traceId: req.executionContext.traceId,
      });

      reply.code(400);
      return e;
    }
  }
}
