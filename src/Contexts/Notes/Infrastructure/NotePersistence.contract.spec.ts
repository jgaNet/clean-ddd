import { DatabaseSync } from 'node:sqlite';

import { Id } from '@SharedKernel/Domain/ValueObjects';
import { InMemoryDataSource } from '@SharedKernel/Infrastructure/DataSources/InMemoryDataSource';

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
    it('gives back an equal aggregate, comments included', async () => {
      const note = aNote(alice, 'Groceries');
      note.shareWith(alice, bob);
      note.comment(bob, 'Do not forget the eggs');
      await repository.save(note);

      const found = await repository.findById(note._id.value);
      expect(found?.toSnapshot()).toEqual(note.toSnapshot());
      expect(found?.comments[0].postedAt).toBeInstanceOf(Date);
    });

    it('answers null for an unknown id', async () => {
      expect(await repository.findById('nobody')).toBeNull();
    });

    it('saving again replaces, it does not duplicate', async () => {
      const note = aNote(alice, 'Draft');
      await repository.save(note);
      note.edit(alice, { title: 'Final', content: 'done' });
      note.archive(alice);
      await repository.save(note);

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

    it('lists the comments of a note in the order they were posted, and nothing for an unknown note', async () => {
      const note = aNote(alice, 'Reviewed');
      note.shareWith(alice, bob);
      const first = note.comment(bob, 'First thought', new Date('2026-09-29T10:00:00.000Z'));
      const second = note.comment(bob, 'Second thought', new Date('2026-09-29T10:05:00.000Z'));
      await repository.save(note);
      await repository.save(aNote(alice, 'Uncommented'));

      expect(await queries.findComments(note._id.value)).toEqual([
        {
          id: first.data?._id.value,
          authorId: 'bob',
          text: 'First thought',
          postedAt: new Date('2026-09-29T10:00:00.000Z'),
        },
        {
          id: second.data?._id.value,
          authorId: 'bob',
          text: 'Second thought',
          postedAt: new Date('2026-09-29T10:05:00.000Z'),
        },
      ]);
      expect(await queries.findComments('nobody')).toEqual([]);
    });
  });
});
