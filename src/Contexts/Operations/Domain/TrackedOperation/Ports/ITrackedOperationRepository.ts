import { ITrackedOperation } from '@Contexts/Operations/Domain/TrackedOperation';
import { Repository } from '@Primitives/Repository';

export interface ITrackedOperationRepository extends Repository<ITrackedOperation> {
  save(user: ITrackedOperation<unknown>): Promise<void>;
}
