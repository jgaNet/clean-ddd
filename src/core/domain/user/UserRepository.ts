import { User } from './User';

export interface UserRepository {
  nextIdentity(): Promise<string>;
  findByEmail(email: string): Promise<User | null>;
  save(userData: { email: string }): Promise<User>;
}
