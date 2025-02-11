import { jest } from '@jest/globals';
import { IUserRepository } from '@Contexts/UsersManager/Domain/User/Ports/IUserRepository';
import { InMemoryUserRepository } from './InMemoryUserRepository';
import { IUser } from '@Contexts/UsersManager/Domain/User/DTOs';

// TODO: Try to remove all this mockReset
export class MockedUserRepository extends InMemoryUserRepository {
  static clearMocks() {
    (MockedUserRepository.prototype.nextIdentity as jest.Mock).mockReset();
    (MockedUserRepository.prototype.save as jest.Mock).mockReset();
  }
}
MockedUserRepository.prototype.nextIdentity = jest
  .fn<IUserRepository['nextIdentity']>()
  .mockImplementation(async () => InMemoryUserRepository.prototype.nextIdentity());

MockedUserRepository.prototype.save = jest
  .fn<IUserRepository['save']>()
  .mockImplementation(async (user: IUser) => InMemoryUserRepository.prototype.save(user));
