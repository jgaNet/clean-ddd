import { UserDTO } from './dtos';
import { Repository } from '@primitives/Repository';

export interface UserRepository extends Repository<UserDTO> {
  nextIdentity(): Promise<string>;
  findByEmail(email: string): Promise<UserDTO | null>;
  save(user: UserDTO): Promise<void>;
}
