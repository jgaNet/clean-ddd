import { IUser } from '@Contexts/Users/Domain/User/DTOs';
import { Repository } from '@SharedKernel/Domain/DDD';

export interface IUserQueries extends Repository<IUser> {
  findAll(): Promise<IUser[]>;
  findByEmail(email: string): Promise<IUser | null>;
}
