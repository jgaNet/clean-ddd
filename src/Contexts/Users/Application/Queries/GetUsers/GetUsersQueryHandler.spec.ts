import { expect, jest } from '@jest/globals';
import { mockUsersModule, mockedUserRepository } from '@Contexts/Users/module.mock';
import { MockedUserQueries } from '@Contexts/Users/Infrastructure/Queries/MockedUserQueries';
import { MockedUserRepository } from '@Contexts/Users/Infrastructure/Repositories/MockedUserRepository';
import { Result, EventBus, ExecutionContext } from '@Primitives';
import { GetUsersQueryHandler } from '@Contexts/Users/Application/Queries/GetUsers';
import { CreateUserCommandEvent } from '@Contexts/Users/Application/Commands/CreateUser';

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
    const result = await mockUsersModule.getQuery(GetUsersQueryHandler).execute();
    expect(result).toEqual(Result.ok([]));
  });

  it('should find users', async () => {
    (mockedUserRepository.nextIdentity as jest.Mock).mockImplementationOnce(() => Promise.resolve('mockedId'));

    await mockUsersModule.getCommand(CreateUserCommandEvent).execute(
      new CreateUserCommandEvent({
        profile: {
          email: 'a@a.com',
          nickname: 'a',
        },
      }),
      new ExecutionContext({
        traceId: 'mockedTraceId',
        eventBus: eventBusMock,
      }),
    );

    const result = await mockUsersModule.getQuery(GetUsersQueryHandler).execute();

    expect(result.isSuccess()).toBeTruthy();
    expect((result.data as unknown[]).length).toEqual(1);
  });
});
