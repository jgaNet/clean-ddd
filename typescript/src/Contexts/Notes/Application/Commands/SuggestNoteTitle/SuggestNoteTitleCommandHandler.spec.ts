import { expect, jest } from '@jest/globals';

import { Role } from '@SharedKernel/Domain';
import { EventBus, ExecutionContext } from '@Architecture/Application';
import { InMemoryDataSource } from '@Architecture/Infrastructure/DataSources/InMemoryDataSource';

import { INote } from '@Contexts/Notes/Domain/Note/DTOs';
import { NoteTitle } from '@Contexts/Notes/Domain/Note/NoteTitle';
import { NoteTitleTooLongException, NotNoteOwnerException } from '@Contexts/Notes/Domain/Note/NoteExceptions';
import { INoteTitleSuggestions, TitleSuggestion } from '@Contexts/Notes/Application/Suggestions/INoteTitleSuggestions';
import { InMemoryNoteRepository } from '@Contexts/Notes/Infrastructure/Repositories/InMemoryNoteRepository';
import {
  CreateNoteCommandEvent,
  CreateNoteCommandHandler,
  SuggestNoteTitleCommandEvent,
  SuggestNoteTitleCommandHandler,
} from '@Contexts/Notes/Application/Commands';

const eventBus = { connect: jest.fn(), publish: jest.fn(), subscribe: jest.fn() } as EventBus;
const contextFor = (subjectId: string) =>
  new ExecutionContext({ traceId: 'trace', eventBus, auth: { subjectId, role: Role.USER } });

/** The non-deterministic source, made deterministic for the test: it proposes what the test says. */
const proposing = (title: string): INoteTitleSuggestions => ({
  suggest: async () => ({ title, provenance: { source: 'test', version: '1', at: new Date('2026-01-01') } }),
});

let store: InMemoryDataSource<INote>;
let repository: InMemoryNoteRepository;

beforeEach(() => {
  jest.resetAllMocks();
  store = new InMemoryDataSource<INote>();
  repository = new InMemoryNoteRepository(store);
});

async function aNoteOf(ownerId: string): Promise<string> {
  const created = await new CreateNoteCommandHandler(repository).execute(
    CreateNoteCommandEvent.set({ title: 'Untitled', content: 'Milk, eggs, bread' }),
    contextFor(ownerId),
  );
  if (created.isFailure()) throw created.error;
  return created.data;
}

describe('SuggestNoteTitleCommandHandler', () => {
  it('applies a suggestion the note accepts, and answers it with its provenance', async () => {
    const noteId = await aNoteOf('alice');

    const result = await new SuggestNoteTitleCommandHandler(repository, proposing('Groceries')).execute(
      SuggestNoteTitleCommandEvent.set({ noteId }),
      contextFor('alice'),
    );

    expect(result.isSuccess()).toBe(true);
    const suggestion: TitleSuggestion | undefined = result.data;
    expect(suggestion).toEqual({
      title: 'Groceries',
      provenance: { source: 'test', version: '1', at: new Date('2026-01-01') },
    });
    expect(store.collection.get(noteId)?.title).toBe('Groceries');
  });

  it('lets the note refuse a suggestion that breaks its rules, and changes nothing', async () => {
    const noteId = await aNoteOf('alice');
    const tooLong = 'x'.repeat(NoteTitle.MAX_LENGTH + 1);

    const result = await new SuggestNoteTitleCommandHandler(repository, proposing(tooLong)).execute(
      SuggestNoteTitleCommandEvent.set({ noteId }),
      contextFor('alice'),
    );

    expect(result.isFailure()).toBe(true);
    expect(result.error).toBeInstanceOf(NoteTitleTooLongException);
    expect(store.collection.get(noteId)?.title).toBe('Untitled');
  });

  it('is the owner’s to ask: anyone else is refused before the source is even consulted', async () => {
    const noteId = await aNoteOf('alice');
    const source: INoteTitleSuggestions = { suggest: jest.fn(proposing('Groceries').suggest) };

    const result = await new SuggestNoteTitleCommandHandler(repository, source).execute(
      SuggestNoteTitleCommandEvent.set({ noteId }),
      contextFor('bob'),
    );

    expect(result.error).toBeInstanceOf(NotNoteOwnerException);
    expect(store.collection.get(noteId)?.title).toBe('Untitled');
  });
});
