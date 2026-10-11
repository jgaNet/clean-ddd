import { IResult } from '@Architecture/Domain';

import { Note } from '@Contexts/Notes/Domain/Note/Note';

/**
 * The repository is the write side of persistence. It speaks in aggregates: it gives
 * you a Note back, and it takes a Note in. How and where it is stored is not the
 * domain's concern; the infrastructure layer provides an implementation.
 *
 * It deliberately has no "search" method (listing and filtering belong to INoteQueries)
 * and no "next identity" method (the aggregate generates its own id in Note.create()).
 */
export interface INoteRepository {
  findById(id: string): Promise<Note | null>;
  /**
   * Stores the aggregate at version + 1, or refuses it with a ConcurrencyConflictException when the
   * stored version is no longer the one it was loaded with: of two writers who read the same
   * version, only the first wins (ADR 8). The contract spec asserts it for every adapter.
   */
  save(note: Note): Promise<IResult>;
}
