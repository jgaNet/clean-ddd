import { UserDTO } from '@Contexts/UsersManager/Domain/User/DTOs';
import { Repository } from '@Primitives/Repository';

export interface UserRepository extends Repository<UserDTO> {
  nextIdentity(): Promise<string>;
  findByEmail(email: string): Promise<UserDTO | null>;
  save(user: UserDTO): Promise<void>;
}
