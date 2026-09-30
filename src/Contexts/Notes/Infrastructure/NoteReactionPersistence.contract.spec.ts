import { ConcurrencyConflictException, Id } from '@Architecture/Domain';
import { InMemoryDataSource } from '@Architecture/Infrastructure/DataSources/InMemoryDataSource';

import { INote } from '@Contexts/Notes/Domain/Note/DTOs';
import { Note } from '@Contexts/Notes/Domain/Note/Note';
import { INoteReaction } from '@Contexts/Notes/Domain/NoteReaction/DTOs';
import { NoteReaction } from '@Contexts/Notes/Domain/NoteReaction/NoteReaction';
import { INoteReactionQueries } from '@Contexts/Notes/Domain/NoteReaction/Ports/INoteReactionQueries';
import { INoteReactionRepository } from '@Contexts/Notes/Domain/NoteReaction/Ports/INoteReactionRepository';
import { InMemoryNoteRepository } from '@Contexts/Notes/Infrastructure/Repositories/InMemoryNoteRepository';
import { InMemoryNoteReactionRepository } from '@Contexts/Notes/Infrastructure/Repositories/InMemoryNoteReactionRepository';
import { InMemoryNoteReactionQueries } from '@Contexts/Notes/Infrastructure/Queries/InMemoryNoteReactionQueries';
import { INoteRepository } from '@Contexts/Notes/Domain/Note/Ports/INoteRepository';

/**
 * A contract test: the promises belong to the ports, so every adapter of them runs the same
 * expectations. There is one adapter today; the port already promises an order and two facts
 * about the collection, which is what makes the test worth writing against the port rather
 * than against the adapter. A second one (SQLite, Postgres) is a line in `adapters`.
 */
const adapters: {
  name: string;
  open: () => { notes: INoteRepository; reactions: INoteReactionRepository; queries: INoteReactionQueries };
}[] = [
  {
    name: 'in memory',
    open: () => {
      const noteStore = new InMemoryDataSource<INote>();
      const reactionStore = new InMemoryDataSource<INoteReaction>();
      return {
        notes: new InMemoryNoteRepository(noteStore),
        reactions: new InMemoryNoteReactionRepository(reactionStore),
        queries: new InMemoryNoteReactionQueries(noteStore, reactionStore),
      };
    },
  },
];

const alice = new Id('alice');
const bob = new Id('bob');
const carol = new Id('carol');

const aNoteSharedWith = (...accounts: Id[]): Note => {
  const note = Note.create({ ownerId: alice.value, title: 'Roadmap', content: 'Q4' });
  if (note.isFailure()) throw note.error;
  accounts.forEach(account => note.data.shareWith(alice, account));
  return note.data;
};

const aReaction = (noteId: string, reactorId: Id, emoji: string, at: Date): NoteReaction => {
  const reaction = NoteReaction.create({ noteId, reactorId: reactorId.value, emoji, firstOnNote: false }, at);
  if (reaction.isFailure()) throw reaction.error;
  return reaction.data;
};

describe.each(adapters)('Note reaction persistence over $name', ({ open }) => {
  let notes: INoteRepository;
  let reactions: INoteReactionRepository;
  let queries: INoteReactionQueries;
  beforeEach(() => ({ notes, reactions, queries } = open()));

  describe('INoteReactionRepository', () => {
    it('gives back an equal aggregate', async () => {
      const reaction = aReaction('note-1', bob, '👍', new Date('2026-01-01T10:00:00.000Z'));
      await reactions.save(reaction);

      const found = await reactions.findById(reaction._id.value);
      expect(found?.toSnapshot()).toEqual({ ...reaction.toSnapshot(), version: reaction.version + 1 });
    });

    it('answers null for an unknown id, and for a person who has not reacted', async () => {
      expect(await reactions.findById('nobody')).toBeNull();
      expect(await reactions.findByNoteAndReactor('note-1', 'bob')).toBeNull();
    });

    it('finds the one reaction a person left on a note, and counts the reactions of a note', async () => {
      await reactions.save(aReaction('note-1', bob, '👍', new Date('2026-01-01T10:00:00.000Z')));
      await reactions.save(aReaction('note-1', carol, '🎉', new Date('2026-01-01T11:00:00.000Z')));
      await reactions.save(aReaction('note-2', bob, '😂', new Date('2026-01-01T12:00:00.000Z')));

      const found = await reactions.findByNoteAndReactor('note-1', bob.value);
      expect(found?.emoji).toBe('👍');
      expect(await reactions.countByNote('note-1')).toBe(2);
      expect(await reactions.countByNote('note-2')).toBe(1);
      expect(await reactions.countByNote('unknown')).toBe(0);
    });

    it('stores version + 1 on every save, and refuses an aggregate that is no longer at the stored version', async () => {
      const reaction = aReaction('note-1', bob, '👍', new Date('2026-01-01T10:00:00.000Z'));
      await reactions.save(reaction);

      const mine = (await reactions.findById(reaction._id.value)) as NoteReaction;
      const theirs = (await reactions.findById(reaction._id.value)) as NoteReaction;
      expect(mine.version).toBe(1);

      mine.changeTo(bob, '🎉');
      expect((await reactions.save(mine)).isSuccess()).toBe(true);

      theirs.changeTo(bob, '😂');
      const refused = await reactions.save(theirs);
      expect(refused.error).toBeInstanceOf(ConcurrencyConflictException);

      const stored = (await reactions.findById(reaction._id.value)) as NoteReaction;
      expect(stored.emoji).toBe('🎉');
      expect(stored.version).toBe(2);
    });

    it('rebuilds without recording events', async () => {
      const reaction = aReaction('note-1', bob, '👍', new Date('2026-01-01T10:00:00.000Z'));
      await reactions.save(reaction);

      expect((await reactions.findById(reaction._id.value))?.pullDomainEvents()).toEqual([]);
    });
  });

  describe('INoteReactionQueries', () => {
    it('shows the reactions of a note oldest first, whatever order they were saved in', async () => {
      const note = aNoteSharedWith(bob, carol);
      await notes.save(note);
      await reactions.save(aReaction(note._id.value, carol, '🎉', new Date('2026-01-01T11:00:00.000Z')));
      await reactions.save(aReaction(note._id.value, bob, '👍', new Date('2026-01-01T10:00:00.000Z')));
      await reactions.save(aReaction('another-note', bob, '😂', new Date('2026-01-01T09:00:00.000Z')));

      expect(await queries.findByNote(note._id.value)).toEqual({
        noteId: note._id.value,
        ownerId: alice.value,
        sharedWith: [bob.value, carol.value],
        reactions: [
          { reactorId: bob.value, emoji: '👍' },
          { reactorId: carol.value, emoji: '🎉' },
        ],
      });
    });

    it('keeps a reaction in place when its emoji changes', async () => {
      const note = aNoteSharedWith(bob, carol);
      await notes.save(note);
      await reactions.save(aReaction(note._id.value, bob, '👍', new Date('2026-01-01T10:00:00.000Z')));
      await reactions.save(aReaction(note._id.value, carol, '🎉', new Date('2026-01-01T11:00:00.000Z')));

      const bobs = (await reactions.findByNoteAndReactor(note._id.value, bob.value)) as NoteReaction;
      bobs.changeTo(bob, '😢');
      await reactions.save(bobs);

      expect((await queries.findByNote(note._id.value))?.reactions).toEqual([
        { reactorId: bob.value, emoji: '😢' },
        { reactorId: carol.value, emoji: '🎉' },
      ]);
    });

    it('answers an empty list for a note nobody reacted to, and null for an unknown note', async () => {
      const note = aNoteSharedWith(bob);
      await notes.save(note);

      expect((await queries.findByNote(note._id.value))?.reactions).toEqual([]);
      expect(await queries.findByNote('unknown')).toBeNull();
    });
  });
});
