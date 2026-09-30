import { InMemoryDataSource } from '@Architecture/Infrastructure/DataSources/InMemoryDataSource';

import { INote } from '@Contexts/Notes/Domain/Note/DTOs';
import { INoteReaction } from '@Contexts/Notes/Domain/NoteReaction/DTOs';
import {
  INoteReactionQueries,
  NoteReactionsView,
} from '@Contexts/Notes/Domain/NoteReaction/Ports/INoteReactionQueries';

/**
 * The read side of a note's reactions. It reads two stores of the Notes context at once — the
 * notes and the reactions — because a read model is free to be joined where it is built
 * (ADR 5); the visibility rule it makes possible stays in the query handler.
 */
export class InMemoryNoteReactionQueries implements INoteReactionQueries {
  constructor(
    private notes: InMemoryDataSource<INote>,
    private reactions: InMemoryDataSource<INoteReaction>,
  ) {}

  async findByNote(noteId: string): Promise<NoteReactionsView | null> {
    const note = this.notes.collection.get(noteId);
    if (!note) return null;

    return {
      noteId,
      ownerId: note.ownerId,
      sharedWith: [...note.sharedWith],
      reactions: [...this.reactions.collection.values()]
        .filter(reaction => reaction.noteId === noteId)
        .sort((one, other) => one.reactedAt.getTime() - other.reactedAt.getTime())
        .map(reaction => ({ reactorId: reaction.reactorId, emoji: reaction.emoji })),
    };
  }
}
