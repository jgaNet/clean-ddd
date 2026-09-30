import { ConcurrencyConflictException, IResult, Result } from '@Architecture/Domain';
import { InMemoryDataSource } from '@Architecture/Infrastructure/DataSources/InMemoryDataSource';

import { INoteReaction } from '@Contexts/Notes/Domain/NoteReaction/DTOs';
import { NoteReaction } from '@Contexts/Notes/Domain/NoteReaction/NoteReaction';
import { INoteReactionRepository } from '@Contexts/Notes/Domain/NoteReaction/Ports/INoteReactionRepository';

/**
 * The reactions port on the in-memory store: a snapshot in, a snapshot out. The two lookups
 * beyond findById are the facts the domain rules are checked against, not a search for a
 * screen — that is InMemoryNoteReactionQueries, on the same store.
 */
export class InMemoryNoteReactionRepository implements INoteReactionRepository {
  constructor(private dataSource: InMemoryDataSource<INoteReaction>) {}

  async findById(id: string): Promise<NoteReaction | null> {
    const snapshot = this.dataSource.collection.get(id);
    return snapshot ? NoteReaction.fromSnapshot(snapshot) : null;
  }

  async findByNoteAndReactor(noteId: string, reactorId: string): Promise<NoteReaction | null> {
    const snapshot = this.all().find(reaction => reaction.noteId === noteId && reaction.reactorId === reactorId);
    return snapshot ? NoteReaction.fromSnapshot(snapshot) : null;
  }

  async countByNote(noteId: string): Promise<number> {
    return this.all().filter(reaction => reaction.noteId === noteId).length;
  }

  async save(reaction: NoteReaction): Promise<IResult> {
    const stored = this.dataSource.collection.get(reaction._id.value);
    if (stored && stored.version !== reaction.version) {
      return Result.fail(staleReaction(reaction._id.value, reaction.version, stored.version));
    }
    this.dataSource.collection.set(reaction._id.value, { ...reaction.toSnapshot(), version: reaction.version + 1 });
    return Result.ok();
  }

  private all(): INoteReaction[] {
    return [...this.dataSource.collection.values()];
  }
}

export const staleReaction = (reactionId: string, read: number, stored: number) =>
  new ConcurrencyConflictException('Notes', 'The reaction changed since it was read', { reactionId, read, stored });
