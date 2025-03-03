import { IOperation } from '@Contexts/Operations/Domain/Operation';
import { Repository } from '@Primitives/Repository';

export interface IOperationRepository extends Repository<IOperation> {
  save(user: IOperation): Promise<void>;
}
