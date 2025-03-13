import { ITrackedOperation } from '@Contexts/Tracker/Domain/TrackedOperation';
import { Repository } from '@Primitives/DDD';

export interface ITrackedOperationRepository extends Repository<ITrackedOperation> {
  save(user: ITrackedOperation): Promise<void>;
}
