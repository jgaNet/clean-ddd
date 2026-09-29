import { IResult, Result } from '@SharedKernel/Domain';

import { Note } from '@Contexts/Notes/Domain/Note/Note';
import { INewNote } from '@Contexts/Notes/Domain/Note/DTOs';
import { AccountPlan, IAccountDirectory } from '@Contexts/Notes/Domain/Note/Ports/IAccountDirectory';
import { INoteRepository } from '@Contexts/Notes/Domain/Note/Ports/INoteRepository';
import { NoteLimitReachedException } from '@Contexts/Notes/Domain/Note/NoteExceptions';

/**
 * NoteCreation is a domain service, and the factory of a Note when the caller has notes
 * already: "an account on the free plan owns at most ten notes" is a rule about the whole
 * collection and about a fact from another context, so no single Note can check it. The
 * service asks which plan the owner is on through a port Notes owns (IAccountDirectory),
 * counts through the repository, then lets the aggregate create itself as usual.
 */
export class NoteCreation {
  static readonly FREE_PLAN_NOTE_LIMIT = 10;

  constructor(
    private accounts: IAccountDirectory,
    private notes: INoteRepository,
  ) {}

  async create(props: INewNote): Promise<IResult<Note>> {
    const plan = await this.accounts.planOf(props.ownerId);

    if (plan === AccountPlan.FREE) {
      const owned = await this.notes.countByOwner(props.ownerId);
      if (owned >= NoteCreation.FREE_PLAN_NOTE_LIMIT) {
        return Result.fail(new NoteLimitReachedException(props.ownerId, NoteCreation.FREE_PLAN_NOTE_LIMIT));
      }
    }

    return Note.create(props);
  }
}
