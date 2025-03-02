import { jest } from '@jest/globals';
import { IUserRepository } from '@Contexts/Users/Domain/User/Ports/IUserRepository';
import { InMemoryUserRepository } from './InMemoryUserRepository';

// TODO: Try to remove all this mockReset
export class MockedUserRepository extends InMemoryUserRepository {
  static clearMocks() {
    (MockedUserRepository.prototype.nextIdentity as jest.Mock).mockReset();
  }
}

MockedUserRepository.prototype.nextIdentity = jest
  .fn<IUserRepository['nextIdentity']>()
  .mockImplementation(async () => InMemoryUserRepository.prototype.nextIdentity());
