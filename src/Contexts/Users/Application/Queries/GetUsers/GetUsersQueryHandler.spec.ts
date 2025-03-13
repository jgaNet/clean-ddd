import { expect, jest } from '@jest/globals';
import { mockUsersModule, mockedUserRepository } from '@Contexts/Users/module.mock';
import { MockedUserQueries } from '@Contexts/Users/Infrastructure/Queries/MockedUserQueries';
import { MockedUserRepository } from '@Contexts/Users/Infrastructure/Repositories/MockedUserRepository';
import { Result, EventBus, ExecutionContext, Role } from '@SharedKernel/Domain';
import { GetUsersQueryHandler } from '@Contexts/Users/Application/Queries/GetUsers';
import { CreateUserCommandEvent } from '@Contexts/Users/Application/Commands/CreateUser';

const eventBusMock = {
  connect: jest.fn(),
  publish: jest.fn(),
  subscribe: jest.fn(),
} as EventBus;

beforeEach(() => {
  MockedUserRepository.clearMocks();
  MockedUserQueries.clearMocks();
});

describe('get users', function () {
  it('should not find users', async () => {
    const context = new ExecutionContext({
      traceId: 'mockedTraceId',
      eventBus: eventBusMock,
      auth: {
        subjectId: 'mockedUserId',
        role: Role.ADMIN,
      },
    });
    const result = await mockUsersModule.getQuery(GetUsersQueryHandler).execute(null, context);
    expect(result).toEqual(Result.ok([]));
  });

  it('should find users', async () => {
    (mockedUserRepository.nextIdentity as jest.Mock).mockImplementationOnce(() => Promise.resolve('mockedId'));

    const context = new ExecutionContext({
      traceId: 'mockedTraceId',
      eventBus: eventBusMock,
      auth: {
        subjectId: 'mockedUserId',
        role: Role.ADMIN,
      },
    });

    await mockUsersModule.getCommand(CreateUserCommandEvent).execute(
      CreateUserCommandEvent.set({
        profile: {
          email: 'a@a.com',
          nickname: 'a',
        },
      }),
      context,
    );

    const result = await mockUsersModule.getQuery(GetUsersQueryHandler).execute(null, context);

    expect(result.isSuccess()).toBeTruthy();
    expect((result.data as unknown[]).length).toEqual(1);
  });
});
