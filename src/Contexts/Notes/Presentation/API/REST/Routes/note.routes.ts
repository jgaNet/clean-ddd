import { FastifyInstance } from 'fastify';

import { Module } from '@Architecture/Application';

import { FastifyNoteController } from '@Contexts/Notes/Presentation/API/REST/Controllers/FastifyNoteController';

import {
  CommandOnNoteSchema,
  CommandResSchema,
  CreateNoteReqBody,
  CreateNoteReqBodySchema,
  EditNoteReqBody,
  EditNoteReqBodySchema,
  GetMyNotesResSchema,
  GetNoteResSchema,
  GetSharedNotesResSchema,
  NoteIdParams,
  ShareNoteReqBody,
  ShareNoteReqBodySchema,
} from '@Contexts/Notes/Presentation/API/REST/Routes/note.routes.schema';

export const noteRoutes = function (
  fastify: FastifyInstance,
  { notesModule }: { notesModule: Module },
  done: () => void,
) {
  const controller = new FastifyNoteController({ module: notesModule });
  const tags = ['notes'];

  fastify.post<{ Body: CreateNoteReqBody }>(
    '/',
    { schema: { tags, body: CreateNoteReqBodySchema, response: CommandResSchema } },
    controller.createNote.bind(controller),
  );

  fastify.get('/', { schema: { tags, response: GetMyNotesResSchema } }, controller.getMyNotes.bind(controller));

  fastify.get(
    '/shared',
    { schema: { tags, response: GetSharedNotesResSchema } },
    controller.getNotesSharedWithMe.bind(controller),
  );

  fastify.get('/new', { schema: { tags } }, controller.newNotes.bind(controller));

  fastify.get<{ Params: NoteIdParams }>(
    '/:id',
    { schema: { tags, params: CommandOnNoteSchema.params, response: GetNoteResSchema } },
    controller.getNote.bind(controller),
  );

  fastify.put<{ Params: NoteIdParams; Body: EditNoteReqBody }>(
    '/:id',
    { schema: { tags, ...CommandOnNoteSchema, body: EditNoteReqBodySchema } },
    controller.editNote.bind(controller),
  );

  fastify.post<{ Params: NoteIdParams }>(
    '/:id/archive',
    { schema: { tags, ...CommandOnNoteSchema } },
    controller.archiveNote.bind(controller),
  );

  fastify.post<{ Params: NoteIdParams }>(
    '/:id/restore',
    { schema: { tags, ...CommandOnNoteSchema } },
    controller.restoreNote.bind(controller),
  );

  fastify.post<{ Params: NoteIdParams; Body: ShareNoteReqBody }>(
    '/:id/share',
    { schema: { tags, ...CommandOnNoteSchema, body: ShareNoteReqBodySchema } },
    controller.shareNote.bind(controller),
  );

  fastify.post<{ Params: NoteIdParams }>(
    '/:id/suggest-title',
    { schema: { tags, ...CommandOnNoteSchema } },
    controller.suggestNoteTitle.bind(controller),
  );

  done();
};
