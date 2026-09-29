import { DatabaseSync } from 'node:sqlite';

import { ConcurrencyConflictException } from '@Architecture/Domain';
import { Id } from '@Architecture/Domain';
import { InMemoryDataSource } from '@Architecture/Infrastructure/DataSources/InMemoryDataSource';

import { Note } from '@Contexts/Notes/Domain/Note/Note';
import { INote } from '@Contexts/Notes/Domain/Note/DTOs';
import { NoteStatus } from '@Contexts/Notes/Domain/Note/NoteStatus';
import { INoteQueries } from '@Contexts/Notes/Domain/Note/Ports/INoteQueries';
import { INoteRepository } from '@Contexts/Notes/Domain/Note/Ports/INoteRepository';
import { InMemoryNoteRepository } from '@Contexts/Notes/Infrastructure/Repositories/InMemoryNoteRepository';
import { InMemoryNoteQueries } from '@Contexts/Notes/Infrastructure/Queries/InMemoryNoteQueries';
import { SqliteNoteRepository } from '@Contexts/Notes/Infrastructure/Repositories/SqliteNoteRepository';
import { SqliteNoteQueries } from '@Contexts/Notes/Infrastructure/Queries/SqliteNoteQueries';

/**
 * A contract test: the expectations belong to the ports, so every adapter of a port runs the
 * same ones. Add an adapter (a Postgres one, say) by adding a line to `adapters`; if it passes
 * here, the use cases will not notice the change. The repository and the queries are tested
 * together because they are two views of one store: what the repository saves is what the
 * queries must show.
 */
const adapters: { name: string; open: () => { repository: INoteRepository; queries: INoteQueries } }[] = [
  {
    name: 'in memory',
    open: () => {
      const dataSource = new InMemoryDataSource<INote>();
      return { repository: new InMemoryNoteRepository(dataSource), queries: new InMemoryNoteQueries(dataSource) };
    },
  },
  {
    name: 'SQLite',
    open: () => {
      const db = new DatabaseSync(':memory:');
      return { repository: new SqliteNoteRepository(db), queries: new SqliteNoteQueries(db) };
    },
  },
];

const alice = new Id('alice');
const bob = new Id('bob');

const aNote = (ownerId: Id, title: string, content = `content of ${title}`): Note => {
  const note = Note.create({ ownerId: ownerId.value, title, content });
  if (note.isFailure()) throw note.error;
  return note.data;
};

describe.each(adapters)('Note persistence over $name', ({ open }) => {
  let repository: INoteRepository;
  let queries: INoteQueries;
  beforeEach(() => ({ repository, queries } = open()));

  describe('INoteRepository', () => {
    it('gives back an equal aggregate', async () => {
      const note = aNote(alice, 'Groceries');
      note.shareWith(alice, bob);
      await repository.save(note);

      const found = await repository.findById(note._id.value);
      expect(found?.toSnapshot()).toEqual({ ...note.toSnapshot(), version: note.version + 1 });
    });

    it('stores version + 1 on every save, and refuses an aggregate that is no longer at the stored version', async () => {
      const note = aNote(alice, 'Shared draft');
      expect(note.version).toBe(0);
      await repository.save(note);

      // Two writers read the same version.
      const mine = (await repository.findById(note._id.value)) as Note;
      const theirs = (await repository.findById(note._id.value)) as Note;
      expect(mine.version).toBe(1);

      mine.edit(alice, { title: 'Mine', content: 'first' });
      expect((await repository.save(mine)).isSuccess()).toBe(true);

      theirs.edit(alice, { title: 'Theirs', content: 'second' });
      const refused = await repository.save(theirs);
      expect(refused.isFailure()).toBe(true);
      expect(refused.error).toBeInstanceOf(ConcurrencyConflictException);

      const stored = (await repository.findById(note._id.value)) as Note;
      expect(stored.title).toBe('Mine');
      expect(stored.version).toBe(2);
    });

    it('answers null for an unknown id', async () => {
      expect(await repository.findById('nobody')).toBeNull();
    });

    it('saving again replaces, it does not duplicate', async () => {
      const note = aNote(alice, 'Draft');
      await repository.save(note);
      // As a handler does: read it back, change it, save it; the instance saved before is stale.
      const reread = (await repository.findById(note._id.value)) as Note;
      reread.edit(alice, { title: 'Final', content: 'done' });
      reread.archive(alice);
      expect((await repository.save(reread)).isSuccess()).toBe(true);

      const found = await repository.findById(note._id.value);
      expect(found?.title).toBe('Final');
      expect(found?.status).toBe(NoteStatus.ARCHIVED);
      expect(await queries.findByOwner(alice.value)).toHaveLength(1);
    });

    it('rebuilds without recording events', async () => {
      const note = aNote(alice, 'Quiet');
      await repository.save(note);

      const found = await repository.findById(note._id.value);
      expect(found?.pullDomainEvents()).toEqual([]);
    });
  });

  describe('INoteQueries', () => {
    it('shows the detail of a saved note', async () => {
      const note = aNote(alice, 'Groceries', 'milk');
      note.shareWith(alice, bob);
      await repository.save(note);

      expect(await queries.findById(note._id.value)).toEqual({
        id: note._id.value,
        title: 'Groceries',
        content: 'milk',
        status: NoteStatus.ACTIVE,
        ownerId: 'alice',
        sharedWith: ['bob'],
      });
      expect(await queries.findById('nobody')).toBeNull();
    });

    it("lists an owner's notes, and only theirs, in the order they were saved", async () => {
      const first = aNote(alice, 'First');
      const second = aNote(alice, 'Second');
      await repository.save(first);
      await repository.save(aNote(bob, 'Not hers'));
      await repository.save(second);

      expect(await queries.findByOwner(alice.value)).toEqual([
        { id: first._id.value, title: 'First', status: NoteStatus.ACTIVE },
        { id: second._id.value, title: 'Second', status: NoteStatus.ACTIVE },
      ]);
      expect(await queries.findByOwner('nobody')).toEqual([]);
    });

    it('lists the notes shared with an account, whoever owns them', async () => {
      const shared = aNote(alice, 'Shared', 'for bob');
      shared.shareWith(alice, bob);
      const kept = aNote(alice, 'Kept');
      await repository.save(shared);
      await repository.save(kept);

      expect(await queries.findSharedWith(bob.value)).toEqual([
        { id: shared._id.value, title: 'Shared', content: 'for bob', ownerId: 'alice' },
      ]);
      expect(await queries.findSharedWith(alice.value)).toEqual([]);
    });
  });
});
