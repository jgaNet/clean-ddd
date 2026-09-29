import { CommandEvent } from '@SharedKernel/Domain';

/** The plan travels as a string: the domain (PlanAssignment) decides whether it names one. */
export class SetAccountPlanCommandEvent extends CommandEvent<{ accountId: string; plan: string }> {}
