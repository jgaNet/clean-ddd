import { IResult } from '@SharedKernel/Domain';
import { ITrackedOperation } from '@Contexts/Tracker/Domain/TrackedOperation';

export type GetOperationsQueryResult = IResult<ITrackedOperation[]>;
export type GetOperationQueryResult = IResult<ITrackedOperation>;
export type GetOperationQueryPayload = { id: string };
