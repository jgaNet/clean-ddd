import { ITrackedOperation } from '@Contexts/Tracker/Domain/TrackedOperation';
import { Repository } from '@Core/Domain';

export interface ITrackedOperationRepository extends Repository<ITrackedOperation> {
  save(user: ITrackedOperation): Promise<void>;
}
