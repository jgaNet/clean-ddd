import { Module } from '@Architecture/Application';

import { IPlanQueries } from '@Contexts/Plans/Domain/Plan/Ports/IPlanQueries';

/**
 * Plans, as the architecture task declared it: an empty module its first feature fills, and the
 * read model other contexts may ask (`planQueries`), everyone on Free until that feature.
 */
export const planQueries: IPlanQueries = {
  planOf: async () => ({ plan: 'free', noteLimit: 10 }),
};

export const localPlansModule = new Module({ name: 'Plans' });
