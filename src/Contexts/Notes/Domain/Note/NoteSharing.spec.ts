import { Id } from '@SharedKernel/Domain/ValueObjects';

import { Note } from '@Contexts/Notes/Domain/Note/Note';
import { NoteSharing } from '@Contexts/Notes/Domain/Note/NoteSharing';
import { IAccountDirectory } from '@Contexts/Notes/Domain/Note/Ports/IAccountDirectory';
import { NotNoteOwnerException, RecipientNotFoundException } from '@Contexts/Notes/Domain/Note/NoteExceptions';

/** A domain test needs only the port: a list of known ids is a directory. */
const directoryOf = (...ids: string[]): IAccountDirectory => ({ exists: async id => ids.includes(id) });

const alice = new Id('alice');
const bob = new Id('bob');

function aNoteOf(owner: Id): Note {
  const note = Note.create({ ownerId: owner.value, title: 'Groceries', content: 'Milk' });
  if (note.isFailure()) throw note.error;
  return note.data;
}

describe('NoteSharing (domain service)', () => {
  it('shares with an account the directory knows', async () => {
    const note = aNoteOf(alice);

    const result = await new NoteSharing(directoryOf('alice', 'bob')).share(note, alice, bob);

    expect(result.isSuccess()).toBe(true);
    expect(note.sharedWith).toEqual(['bob']);
  });

  it('refuses an account the directory does not know, before the aggregate is touched', async () => {
    const note = aNoteOf(alice);

    const result = await new NoteSharing(directoryOf('alice')).share(note, alice, bob);

    expect(result.error).toBeInstanceOf(RecipientNotFoundException);
    expect(note.sharedWith).toEqual([]);
  });

  it("still leaves the note's own rules to the aggregate", async () => {
    const note = aNoteOf(alice);

    const result = await new NoteSharing(directoryOf('alice', 'bob')).share(note, bob, alice);

    expect(result.error).toBeInstanceOf(NotNoteOwnerException);
  });
});
