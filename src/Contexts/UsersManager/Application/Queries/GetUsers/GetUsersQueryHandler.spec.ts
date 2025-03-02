import { expect, jest } from '@jest/globals';
import { mockedApplication, mockedUserRepository } from '@Contexts/UsersManager/usersManagerModule.mock';
import { MockedUserQueries } from '@Contexts/UsersManager/Infrastructure/Queries/MockedUserQueries';
import { MockedUserRepository } from '@Contexts/UsersManager/Infrastructure/Repositories/MockedUserRepository';
import { Result, EventBus } from '@Primitives';
import { GetUsersQueryHandler } from '@Contexts/UsersManager/Application/Queries/GetUsers';
import { CreateUserCommandEvent } from '@Contexts/UsersManager/Application/Commands/CreateUser';

const eventBusMock = {
  connect: jest.fn(),
  dispatch: jest.fn(),
  subscribe: jest.fn(),
} as EventBus;

beforeEach(() => {
  MockedUserRepository.clearMocks();
  MockedUserQueries.clearMocks();
});

describe('get users', function () {
  it('should not find users', async () => {
    const result = await mockedApplication.getQuery(GetUsersQueryHandler).execute();
    expect(result).toEqual(Result.ok([]));
  });

  it('should find users', async () => {
    (mockedUserRepository.nextIdentity as jest.Mock).mockImplementationOnce(() => Promise.resolve('mockedId'));

    await mockedApplication.getCommand(CreateUserCommandEvent).execute(
      new CreateUserCommandEvent({
        profile: {
          email: 'a@a.com',
          nickname: 'a',
        },
      }),
      eventBusMock,
    );

    const result = await mockedApplication.getQuery(GetUsersQueryHandler).execute();

    expect(result.isSuccess()).toBeTruthy();
    expect((result.data as unknown[]).length).toEqual(1);
  });
});
