import { Repository } from '@Primitives';
import { Auth } from '../Auth';

export interface IAuthRepository extends Repository<Auth> {
  save(auth: Auth): Promise<void>;
  findById(id: string): Promise<Auth | null>;
  delete(id: string): Promise<void>;
}