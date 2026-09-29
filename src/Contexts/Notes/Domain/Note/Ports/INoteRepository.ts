import { Note } from '@Contexts/Notes/Domain/Note/Note';

/**
 * The repository is the write side of persistence. It speaks in aggregates: it gives
 * you a Note back, and it takes a Note in. How and where it is stored is not the
 * domain's concern; the infrastructure layer provides an implementation.
 *
 * It deliberately has no "search" method (listing and filtering belong to INoteQueries)
 * and no "next identity" method (the aggregate generates its own id in Note.create()).
 * `countByOwner` is here, not in the queries, because the domain itself needs it
 * (NoteCreation's quota) and a rule is checked on the write side, against what is saved.
 */
export interface INoteRepository {
  findById(id: string): Promise<Note | null>;
  /** Every note the account owns, archived ones included. An unknown owner has none. */
  countByOwner(ownerId: string): Promise<number>;
  save(note: Note): Promise<void>;
}
