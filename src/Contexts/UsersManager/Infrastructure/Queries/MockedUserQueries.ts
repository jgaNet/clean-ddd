import { jest } from '@jest/globals';
import { InMemoryUserQueries } from './InMemoryUserQueries';
import { IUserQueries } from '@Contexts/UsersManager/Domain/User/Ports/IUserQueries';

// TODO: Try to remove all this mockReset
export class MockedUserQueries extends InMemoryUserQueries {
  static clearMocks() {
    (MockedUserQueries.prototype.findByEmail as jest.Mock).mockReset();
  }
}

MockedUserQueries.prototype.findByEmail = jest
  .fn<IUserQueries['findByEmail']>()
  .mockImplementation(async email => InMemoryUserQueries.prototype.findByEmail(email));
