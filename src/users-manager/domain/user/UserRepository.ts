import { UserDTO } from './dtos';

export interface UserRepository {
  nextIdentity(): Promise<string>;
  findByEmail(email: string): Promise<UserDTO | null>;
  save(user: UserDTO): Promise<void>;
}
