import { IOperation } from '@Contexts/Operations/Domain/Operation';
import { Repository } from '@Primitives';

export interface IOperationQueries extends Repository<IOperation> {
  findAll(): Promise<IOperation[]>;
  findById(id: string): Promise<IOperation | null>;
}
