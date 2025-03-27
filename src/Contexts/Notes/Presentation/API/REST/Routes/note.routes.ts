import { FastifyInstance } from 'fastify';

import { FastifyNoteController } from '@Contexts/Notes/Presentation/API/REST/Controllers/FastifyNoteController';
import { NotesModule } from '@Contexts/Notes/Application';

import {
  GetNotesResSchema,
  CreateNoteReqBody,
  CreateNoteResSchema,
  CreateNoteReqBodySchema,
} from '@Contexts/Notes/Presentation/API/REST/Routes/note.routes.schema';

export const noteRoutes = function (
  fastify: FastifyInstance,
  { notesModule }: { notesModule: NotesModule },
  done: () => void,
) {
  const noteController = new FastifyNoteController({
    queries: notesModule.queries,
  });

  fastify.post<{ Body: CreateNoteReqBody }>(
    '/',
    {
      schema: {
        tags: ['notes'],
        body: CreateNoteReqBodySchema,
        response: CreateNoteResSchema,
      },
    },
    noteController.createNote.bind(noteController),
  );

  fastify.get(
    '/',
    {
      schema: {
        tags: ['notes'],
        response: GetNotesResSchema,
      },
    },
    noteController.getNotes.bind(noteController),
  );

  fastify.get(
    '/new',
    {
      schema: {
        tags: ['notes'],
      },
    },
    noteController.newNotes.bind(noteController),
  );

  done();
};
