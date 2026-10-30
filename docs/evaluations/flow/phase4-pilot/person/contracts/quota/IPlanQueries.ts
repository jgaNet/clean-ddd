/** A person's plan as other contexts may read it: the plan's name and how many notes it keeps (null: no limit). */
export interface PlanView {
  plan: 'free' | 'unlimited';
  noteLimit: number | null;
}

/**
 * Plans' read model, the contract the architecture task froze for the relationship Plans → Notes:
 * an account that never chose a plan is on Free.
 */
export interface IPlanQueries {
  planOf(accountId: string): Promise<PlanView>;
}
