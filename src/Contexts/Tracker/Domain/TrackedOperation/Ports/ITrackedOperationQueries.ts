import { ITrackedOperation } from '@Contexts/Tracker/Domain/TrackedOperation';

export interface ITrackedOperationQueries {
  findAll(): Promise<ITrackedOperation[]>;
  findByTraceId(traceId: string): Promise<ITrackedOperation[]>;
  findById(id: string): Promise<ITrackedOperation | null>;
}
