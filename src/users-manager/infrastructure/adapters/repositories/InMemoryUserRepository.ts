import { UserRepository } from 'users-manager/domain/user/UserRepository';
import { UserDTO } from 'users-manager/domain/user/dtos';
import { v4 as uuidv4 } from 'uuid';

export class InMemoryUserRepository implements UserRepository {
  static collection = new Map<string, UserDTO>();
  static resetCollection = () => (InMemoryUserRepository.collection = new Map<string, UserDTO>());
  async nextIdentity(): Promise<string> {
    return uuidv4();
  }

  async findByEmail(email: string): Promise<UserDTO | null> {
    return [...InMemoryUserRepository.collection.values()].find(user => user.profile.email === email) || null;
  }

  async save(user: UserDTO) {
    InMemoryUserRepository.collection.set(user._id, user);
  }
}
