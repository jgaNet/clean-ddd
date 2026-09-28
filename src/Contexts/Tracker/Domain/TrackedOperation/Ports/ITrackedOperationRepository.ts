import { ITrackedOperation } from '@Contexts/Tracker/Domain/TrackedOperation';

export interface ITrackedOperationRepository {
  save(user: ITrackedOperation): Promise<void>;
}
