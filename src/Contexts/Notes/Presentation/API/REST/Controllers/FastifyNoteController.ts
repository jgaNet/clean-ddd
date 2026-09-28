import { FastifyReply, FastifyRequest } from 'fastify';

import { Event, Exception, NotAllowedException } from '@SharedKernel/Domain';
import { Module } from '@SharedKernel/Application';

import { NoteNotFoundException } from '@Contexts/Notes/Domain/Note/NoteExceptions';
import {
  CreateNoteCommandEvent,
  EditNoteCommandEvent,
  ArchiveNoteCommandEvent,
  RestoreNoteCommandEvent,
  ShareNoteCommandEvent,
} from '@Contexts/Notes/Application/Commands';
import {
  GetMyNotesQueryHandler,
  GetNoteQueryHandler,
  GetNotesSharedWithMeQueryHandler,
} from '@Contexts/Notes/Application/Queries';
import {
  CreateNoteReqBody,
  EditNoteReqBody,
  NoteIdParams,
  ShareNoteReqBody,
} from '@Contexts/Notes/Presentation/API/REST/Routes/note.routes.schema';
import { NewNoteHTMXPresenter } from '@Contexts/Notes/Presentation/Presenters';

/**
 * Commands are accepted (202) and processed asynchronously through the event bus; the
 * client follows the returned operation. Queries answer synchronously.
 */
export class FastifyNoteController {
  #notesModule: Module;
  #newNoteForm = new NewNoteHTMXPresenter();

  constructor({ module }: { module: Module }) {
    this.#notesModule = module;
  }

  async createNote(req: FastifyRequest<{ Body: CreateNoteReqBody }>, reply: FastifyReply) {
    return this.accept(req, reply, CreateNoteCommandEvent.set({ title: req.body.title, content: req.body.content }));
  }

  async editNote(req: FastifyRequest<{ Params: NoteIdParams; Body: EditNoteReqBody }>, reply: FastifyReply) {
    return this.accept(
      req,
      reply,
      EditNoteCommandEvent.set({ noteId: req.params.id, title: req.body.title, content: req.body.content }),
    );
  }

  async archiveNote(req: FastifyRequest<{ Params: NoteIdParams }>, reply: FastifyReply) {
    return this.accept(req, reply, ArchiveNoteCommandEvent.set({ noteId: req.params.id }));
  }

  async restoreNote(req: FastifyRequest<{ Params: NoteIdParams }>, reply: FastifyReply) {
    return this.accept(req, reply, RestoreNoteCommandEvent.set({ noteId: req.params.id }));
  }

  async shareNote(req: FastifyRequest<{ Params: NoteIdParams; Body: ShareNoteReqBody }>, reply: FastifyReply) {
    return this.accept(
      req,
      reply,
      ShareNoteCommandEvent.set({ noteId: req.params.id, recipientId: req.body.recipientId }),
    );
  }

  async getMyNotes(req: FastifyRequest, reply: FastifyReply) {
    const result = await this.#notesModule.getQuery(GetMyNotesQueryHandler).handle(undefined, req.executionContext);

    return result.isFailure() ? this.refuse(reply, result.error) : result.data;
  }

  async getNote(req: FastifyRequest<{ Params: NoteIdParams }>, reply: FastifyReply) {
    const result = await this.#notesModule.getQuery(GetNoteQueryHandler).handle(req.params.id, req.executionContext);

    return result.isFailure() ? this.refuse(reply, result.error) : result.data;
  }

  async getNotesSharedWithMe(req: FastifyRequest, reply: FastifyReply) {
    const result = await this.#notesModule
      .getQuery(GetNotesSharedWithMeQueryHandler)
      .handle(undefined, req.executionContext);

    return result.isFailure() ? this.refuse(reply, result.error) : result.data;
  }

  async newNotes() {
    return this.#newNoteForm.present();
  }

  private accept(req: FastifyRequest, reply: FastifyReply, command: Event<unknown>) {
    const context = req.executionContext;
    const operation = context.eventBus.publish(command, context);

    reply.code(202);
    return { operationId: operation.id };
  }

  private refuse(reply: FastifyReply, error: Exception) {
    if (error instanceof NotAllowedException) reply.code(403);
    else if (error instanceof NoteNotFoundException) reply.code(404);
    else reply.code(400);

    return { message: error.message };
  }
}
