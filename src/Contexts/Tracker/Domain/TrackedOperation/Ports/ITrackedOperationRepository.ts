import { ITrackedOperation } from '@Contexts/Tracker/Domain/TrackedOperation';
import { Repository } from '@SharedKernel/Domain/DDD';

export interface ITrackedOperationRepository extends Repository<ITrackedOperation> {
  save(user: ITrackedOperation): Promise<void>;
}
