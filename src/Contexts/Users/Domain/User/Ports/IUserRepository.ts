import { IUser } from '@Contexts/Users/Domain/User/DTOs';
import { Repository } from '@SharedKernel/Domain/DDD';

export interface IUserRepository extends Repository<IUser> {
  nextIdentity(): Promise<string>;
  save(user: IUser): Promise<void>;
}
