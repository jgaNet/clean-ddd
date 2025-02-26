import { IOperation } from '@Shared/Domain/Operation';
import { Repository } from '@Primitives';

export interface IOperationQueries extends Repository<IOperation> {
  findAll(): Promise<IOperation[]>;
  findById(email: string): Promise<IOperation | null>;
}
