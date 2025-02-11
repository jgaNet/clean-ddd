import { IUser } from '@Contexts/UsersManager/Domain/User/DTOs';
import { Repository } from '@Primitives/Repository';

export interface IUserQueries extends Repository<IUser> {
  findAll(): Promise<IUser[]>;
  findByEmail(email: string): Promise<IUser | null>;
}
