import { FastifyReply, FastifyRequest } from 'fastify';

import { Exception, NotAllowedException } from '@Architecture/Domain';
import { ExecutionContext, Module } from '@Architecture/Application';
import { acceptCommand, notAllowedStatus } from '@Architecture/Presentation/AcceptCommand';

import { NoteNotFoundException } from '@Contexts/Notes/Domain/Note/NoteExceptions';
import {
  CreateNoteCommandEvent,
  EditNoteCommandEvent,
  ArchiveNoteCommandEvent,
  RestoreNoteCommandEvent,
  ShareNoteCommandEvent,
  SuggestNoteTitleCommandEvent,
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
 * client follows the returned operation. A caller who is not signed in is refused at once with
 * 401, before anything is published (`acceptCommand`, API-CALLER-AT-TRANSPORT). Queries answer
 * synchronously.
 */
export class FastifyNoteController {
  #notesModule: Module;
  #newNoteForm = new NewNoteHTMXPresenter();

  constructor({ module }: { module: Module }) {
    this.#notesModule = module;
  }

  async createNote(req: FastifyRequest<{ Body: CreateNoteReqBody }>, reply: FastifyReply) {
    return acceptCommand(
      req,
      reply,
      this.#notesModule,
      CreateNoteCommandEvent.set({ title: req.body.title, content: req.body.content }),
    );
  }

  async editNote(req: FastifyRequest<{ Params: NoteIdParams; Body: EditNoteReqBody }>, reply: FastifyReply) {
    return acceptCommand(
      req,
      reply,
      this.#notesModule,
      EditNoteCommandEvent.set({ noteId: req.params.id, title: req.body.title, content: req.body.content }),
    );
  }

  async archiveNote(req: FastifyRequest<{ Params: NoteIdParams }>, reply: FastifyReply) {
    return acceptCommand(req, reply, this.#notesModule, ArchiveNoteCommandEvent.set({ noteId: req.params.id }));
  }

  async restoreNote(req: FastifyRequest<{ Params: NoteIdParams }>, reply: FastifyReply) {
    return acceptCommand(req, reply, this.#notesModule, RestoreNoteCommandEvent.set({ noteId: req.params.id }));
  }

  async shareNote(req: FastifyRequest<{ Params: NoteIdParams; Body: ShareNoteReqBody }>, reply: FastifyReply) {
    return acceptCommand(
      req,
      reply,
      this.#notesModule,
      ShareNoteCommandEvent.set({ noteId: req.params.id, recipientId: req.body.recipientId }),
    );
  }

  async suggestNoteTitle(req: FastifyRequest<{ Params: NoteIdParams }>, reply: FastifyReply) {
    return acceptCommand(req, reply, this.#notesModule, SuggestNoteTitleCommandEvent.set({ noteId: req.params.id }));
  }

  async getMyNotes(req: FastifyRequest, reply: FastifyReply) {
    const result = await this.#notesModule.getQuery(GetMyNotesQueryHandler).handle(undefined, req.executionContext);

    return result.isFailure() ? this.refuse(reply, result.error, req.executionContext) : result.data;
  }

  async getNote(req: FastifyRequest<{ Params: NoteIdParams }>, reply: FastifyReply) {
    const result = await this.#notesModule.getQuery(GetNoteQueryHandler).handle(req.params.id, req.executionContext);

    return result.isFailure() ? this.refuse(reply, result.error, req.executionContext) : result.data;
  }

  async getNotesSharedWithMe(req: FastifyRequest, reply: FastifyReply) {
    const result = await this.#notesModule
      .getQuery(GetNotesSharedWithMeQueryHandler)
      .handle(undefined, req.executionContext);

    return result.isFailure() ? this.refuse(reply, result.error, req.executionContext) : result.data;
  }

  async newNotes() {
    return this.#newNoteForm.present();
  }

  private refuse(reply: FastifyReply, error: Exception, context: ExecutionContext) {
    if (error instanceof NotAllowedException) reply.code(notAllowedStatus(context));
    else if (error instanceof NoteNotFoundException) reply.code(404);
    else reply.code(400);

    return { message: error.message };
  }
}
