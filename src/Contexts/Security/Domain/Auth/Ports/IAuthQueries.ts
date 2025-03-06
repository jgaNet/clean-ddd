import { QueriesService } from '@Primitives';
import { IAuth } from '../DTOs';

export interface IAuthQueries extends QueriesService {
  findBySubject(subjectId: string, subjectType: string): Promise<IAuth | null>;
  findById(id: string): Promise<IAuth | null>;
  findAll(options?: { limit?: number; offset?: number }): Promise<IAuth[]>;
  findByCredentialType(type: string, options?: { limit?: number; offset?: number }): Promise<IAuth[]>;
  count(): Promise<number>;
}