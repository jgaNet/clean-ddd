import { jest } from '@jest/globals';
import { UserRepository } from 'core/domain/user/UserRepository';
import { InMemoryUserRepository } from './InMemoryUserRepository';
import { UserDTO } from 'core/domain/user/dtos';

export class MockedUserRepository extends InMemoryUserRepository {
  static clearMocks() {
    (MockedUserRepository.prototype.findByEmail as jest.Mock).mockReset();
    (MockedUserRepository.prototype.nextIdentity as jest.Mock).mockReset();
    (MockedUserRepository.prototype.save as jest.Mock).mockReset();
  }
}

MockedUserRepository.prototype.findByEmail = jest
  .fn<UserRepository['findByEmail']>()
  .mockImplementation(async email => InMemoryUserRepository.prototype.findByEmail(email));

MockedUserRepository.prototype.nextIdentity = jest
  .fn<UserRepository['nextIdentity']>()
  .mockImplementation(async () => InMemoryUserRepository.prototype.nextIdentity());

MockedUserRepository.prototype.save = jest
  .fn<UserRepository['save']>()
  .mockImplementation(async (user: UserDTO) => InMemoryUserRepository.prototype.save(user));
