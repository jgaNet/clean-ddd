import { expect, jest } from '@jest/globals';
import { mockUsersModule, mockedUserRepository, mockedUserQueries } from '@Contexts/Users/module.mock';
import { Exception } from '@Primitives/Exception';
import { UserWithEmailAlreadyExists, InvalidUserEmail } from '@Contexts/Users/Domain/User';
import { CreateUserCommandEvent } from '@Contexts/Users/Application/Commands/CreateUser';
import { MockedUserRepository } from '@Contexts/Users/Infrastructure/Repositories/MockedUserRepository';
import { MockedUserQueries } from '@Contexts/Users/Infrastructure/Queries/MockedUserQueries';
import { EventBus } from '@Primitives/EventBus';
import { ExecutionContext } from '@Primitives/ExecutionContext';

const eventBusMock = {
  connect: jest.fn(),
  dispatch: jest.fn(),
  subscribe: jest.fn(),
} as EventBus;

beforeEach(() => {
  jest.resetAllMocks();
  MockedUserRepository.clearMocks();
  MockedUserQueries.clearMocks();
});

describe('how to create a user', function () {
  it('should create a user if he is not already existing', async () => {
    (mockedUserRepository.nextIdentity as jest.Mock).mockImplementationOnce(() => Promise.resolve('mockedId'));
    const saveSpy = jest.spyOn(mockedUserRepository, 'save');
    await mockUsersModule.getCommand(CreateUserCommandEvent).execute(
      new CreateUserCommandEvent({
        profile: { email: 'test@test.fr', nickname: 'manual-nickname' },
      }),
      new ExecutionContext({
        traceId: 'mockedTraceId',
        eventBus: eventBusMock,
      }),
    );

    expect(saveSpy).toHaveBeenCalledWith({
      _id: 'mockedId',
      profile: {
        email: 'test@test.fr',
        nickname: 'manual-nickname',
      },
    });
  });

  it('should not create a user if he is not already existing', async () => {
    (mockedUserQueries.findByEmail as jest.Mock).mockImplementationOnce(() => Promise.resolve({}));

    const saveSpy = jest.spyOn(mockedUserRepository, 'save');
    const result = await mockUsersModule.getCommand(CreateUserCommandEvent).execute(
      new CreateUserCommandEvent({
        profile: { email: 'test@test.fr' },
      }),
      new ExecutionContext({
        traceId: 'mockedTraceId',
        eventBus: eventBusMock,
      }),
    );

    expect(result.isFailure()).toBeTruthy();
    expect(saveSpy).not.toHaveBeenCalled();
    expect(new UserWithEmailAlreadyExists({ email: 'test@test.fr' }).equals(result.error as Exception)).toBeTruthy();
  });

  it('should create a user with a nickname from username email if nickname is not specify', async () => {
    (mockedUserRepository.nextIdentity as jest.Mock).mockImplementationOnce(() => Promise.resolve('mockedId'));

    const saveSpy = jest.spyOn(mockedUserRepository, 'save');
    await mockUsersModule.getCommand(CreateUserCommandEvent).execute(
      new CreateUserCommandEvent({
        profile: { email: 'nickname@test.fr' },
      }),
      new ExecutionContext({
        traceId: 'mockedTraceId',
        eventBus: eventBusMock,
      }),
    );

    expect(saveSpy).toHaveBeenCalledWith({
      _id: 'mockedId',
      profile: {
        email: 'nickname@test.fr',
        nickname: 'nickname',
      },
    });
  });

  it('should not create a user if the email is malformed', async () => {
    const saveSpy = jest.spyOn(mockedUserRepository, 'save');
    const result = await mockUsersModule.getCommand(CreateUserCommandEvent).execute(
      new CreateUserCommandEvent({
        profile: { email: 'email-malformed' },
      }),
      new ExecutionContext({
        traceId: 'mockedTraceId',
        eventBus: eventBusMock,
      }),
    );

    expect(result.isFailure()).toBeTruthy();
    expect(saveSpy).not.toHaveBeenCalled();
    expect(new InvalidUserEmail({ email: 'email-malformed' }).equals(result.error as Exception)).toBeTruthy();
  });

  it('should not create a user if the email is too long', async () => {
    const saveSpy = jest.spyOn(mockedUserRepository, 'save');
    const email = 'a'.repeat(100) + '@test.fr';
    const result = await mockUsersModule.getCommand(CreateUserCommandEvent).execute(
      new CreateUserCommandEvent({
        profile: { email },
      }),
      new ExecutionContext({
        traceId: 'mockedTraceId',
        eventBus: eventBusMock,
      }),
    );

    expect(result.isFailure()).toBeTruthy();
    expect(saveSpy).not.toHaveBeenCalled();

    expect(
      new InvalidUserEmail({
        email,
      }).equals(result.error as Exception),
    ).toBeTruthy();
  });
});
