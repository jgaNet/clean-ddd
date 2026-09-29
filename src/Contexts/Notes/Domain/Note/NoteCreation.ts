import { IResult, Result } from '@SharedKernel/Domain';

import { Note } from '@Contexts/Notes/Domain/Note/Note';
import { INewNote } from '@Contexts/Notes/Domain/Note/DTOs';
import { AccountPlan, IAccountPlans } from '@Contexts/Notes/Domain/Note/Ports/IAccountPlans';
import { INoteRepository } from '@Contexts/Notes/Domain/Note/Ports/INoteRepository';
import { NoteQuotaExceededException } from '@Contexts/Notes/Domain/Note/NoteExceptions';

/**
 * NoteCreation is a domain service: "on the free plan an account has at most ten notes" is a
 * rule about the whole collection of an account's notes, and about a fact another context owns
 * (the plan), so the aggregate cannot check it alone. It asks the plan through a port Notes
 * owns (IAccountPlans), counts through the repository (the write side: the rule is checked
 * against what is saved), then lets Note.create() apply its own rules. What each plan allows
 * is written here, in Notes: Billing knows plans, not notes.
 */
export class NoteCreation {
  static readonly FREE_PLAN_NOTE_LIMIT = 10;

  constructor(
    private notes: INoteRepository,
    private plans: IAccountPlans,
  ) {}

  async create(props: INewNote): Promise<IResult<Note>> {
    const plan = await this.plans.planOf(props.ownerId);
    const limit = NoteCreation.noteLimitOf(plan);

    if (limit !== null && (await this.notes.countByOwner(props.ownerId)) >= limit) {
      return Result.fail(new NoteQuotaExceededException(plan, limit));
    }

    return Note.create(props);
  }

  /** How many notes a plan allows; `null` is no limit. A switch, so that a new plan has to be decided here. */
  private static noteLimitOf(plan: AccountPlan): number | null {
    switch (plan) {
      case AccountPlan.FREE:
        return NoteCreation.FREE_PLAN_NOTE_LIMIT;
      case AccountPlan.PRO:
        return null;
    }
  }
}
