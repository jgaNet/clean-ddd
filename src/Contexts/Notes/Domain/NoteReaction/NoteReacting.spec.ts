import { Id, IResult, Result } from '@Architecture/Domain';

import { Note } from '@Contexts/Notes/Domain/Note/Note';
import { NoteArchivedException, NoteNotSharedWithException } from '@Contexts/Notes/Domain/Note/NoteExceptions';
import { NoteReacting } from '@Contexts/Notes/Domain/NoteReaction/NoteReacting';
import { NoteReaction } from '@Contexts/Notes/Domain/NoteReaction/NoteReaction';
import { INoteReactionRepository } from '@Contexts/Notes/Domain/NoteReaction/Ports/INoteReactionRepository';
import { ReactionUnchangedException } from '@Contexts/Notes/Domain/NoteReaction/NoteReactionExceptions';

const alice = new Id('alice');
const bob = new Id('bob');

/** A domain test needs only the port: a list of reactions is a repository. */
const repositoryOf = (...reactions: NoteReaction[]): INoteReactionRepository => ({
  findById: async id => reactions.find(reaction => reaction._id.value === id) ?? null,
  findByNoteAndReactor: async (noteId, reactorId) =>
    reactions.find(reaction => reaction.noteId.value === noteId && reaction.reactorId.value === reactorId) ?? null,
  countByNote: async noteId => reactions.filter(reaction => reaction.noteId.value === noteId).length,
  save: async (): Promise<IResult> => Result.ok(),
});

function aNoteSharedWithBob(): Note {
  const note = Note.create({ ownerId: alice.value, title: 'Groceries', content: 'Milk' });
  if (note.isFailure()) throw note.error;
  note.data.shareWith(alice, bob);
  note.data.pullDomainEvents();
  return note.data;
}

const reactionOf = (noteId: string, reactorId: string, emoji: string): NoteReaction => {
  const reaction = NoteReaction.create({ noteId, reactorId, emoji, firstOnNote: true });
  if (reaction.isFailure()) throw reaction.error;
  reaction.data.pullDomainEvents();
  return reaction.data;
};

describe('NoteReacting (domain service)', () => {
  it('records a new reaction, and says it is the first one on the note', async () => {
    const note = aNoteSharedWithBob();

    const result = await new NoteReacting(repositoryOf()).react(note, bob, '👍');

    expect(result.isSuccess()).toBe(true);
    expect(result.data?.emoji).toBe('👍');
    expect(result.data?.pullDomainEvents()[0].payload).toMatchObject({ firstOnNote: true });
  });

  it('says it is not the first one when someone else already reacted', async () => {
    const note = aNoteSharedWithBob();
    const reactions = repositoryOf(reactionOf(note._id.value, 'carol', '🎉'));

    const result = await new NoteReacting(reactions).react(note, bob, '👍');

    expect(result.data?.pullDomainEvents()[0].payload).toMatchObject({ firstOnNote: false });
  });

  it('changes the reaction someone already left instead of adding a second one', async () => {
    const note = aNoteSharedWithBob();
    const already = reactionOf(note._id.value, bob.value, '👍');

    const result = await new NoteReacting(repositoryOf(already)).react(note, bob, '😂');

    expect(result.isSuccess()).toBe(true);
    expect(result.data).toBe(already);
    expect(already.emoji).toBe('😂');
  });

  it("passes on the aggregate's refusal when the emoji is the one already there", async () => {
    const note = aNoteSharedWithBob();
    const already = reactionOf(note._id.value, bob.value, '👍');

    const result = await new NoteReacting(repositoryOf(already)).react(note, bob, '👍');

    expect(result.error).toBeInstanceOf(ReactionUnchangedException);
  });

  it('leaves to the note the question of who may react at all', async () => {
    const note = aNoteSharedWithBob();

    const stranger = await new NoteReacting(repositoryOf()).react(note, new Id('carol'), '👍');
    expect(stranger.error).toBeInstanceOf(NoteNotSharedWithException);

    note.archive(alice);
    const archived = await new NoteReacting(repositoryOf()).react(note, bob, '👍');
    expect(archived.error).toBeInstanceOf(NoteArchivedException);
  });
});
