import { Id, IResult, Result } from '@Architecture/Domain';

import { Note } from '@Contexts/Notes/Domain/Note/Note';
import { NoteReaction } from '@Contexts/Notes/Domain/NoteReaction/NoteReaction';
import { INoteReactionRepository } from '@Contexts/Notes/Domain/NoteReaction/Ports/INoteReactionRepository';

/**
 * NoteReacting is a domain service: reacting to a note is one intention ("this is how I feel
 * about it") whose rules live in three places at once, and none of them is a single reaction.
 *
 * - whether this person may react at all is the Note's rule, so the Note is asked first;
 * - "one reaction per person per note" is a rule about the collection: a second reaction
 *   changes the first instead of adding to it, which is why this returns the same aggregate
 *   in both cases and the caller only has to save it;
 * - "was this the note's first reaction?" is another fact about the collection, established
 *   here through the repository and handed to the aggregate, which records it: the owner is
 *   told once, and the consumer that tells them keeps no count of its own.
 */
export class NoteReacting {
  constructor(private reactions: INoteReactionRepository) {}

  async react(note: Note, reactorId: Id, emoji: string): Promise<IResult<NoteReaction>> {
    const allowed = note.allowsReactionFrom(reactorId);
    if (allowed.isFailure()) return allowed;

    const existing = await this.reactions.findByNoteAndReactor(note._id.value, reactorId.value);
    if (existing) {
      const changed = existing.changeTo(reactorId, emoji);
      return changed.isFailure() ? changed : Result.ok(existing);
    }

    const firstOnNote = (await this.reactions.countByNote(note._id.value)) === 0;

    return NoteReaction.create({ noteId: note._id.value, reactorId: reactorId.value, emoji, firstOnNote });
  }
}
