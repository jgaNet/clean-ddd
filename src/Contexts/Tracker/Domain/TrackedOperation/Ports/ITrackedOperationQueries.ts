import { ITrackedOperation } from '@Contexts/Tracker/Domain/TrackedOperation';
import { Repository } from '@SharedKernel/Domain';

export interface ITrackedOperationQueries extends Repository<ITrackedOperation> {
  findAll(): Promise<ITrackedOperation[]>;
  findById(id: string): Promise<ITrackedOperation | null>;
}
