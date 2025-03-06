import { ITrackedOperation } from '@Contexts/Operations/Domain/TrackedOperation';
import { Repository } from '@Primitives';

export interface ITrackedOperationQueries extends Repository<ITrackedOperation> {
  findAll(): Promise<ITrackedOperation[]>;
  findById(id: string): Promise<ITrackedOperation | null>;
}
