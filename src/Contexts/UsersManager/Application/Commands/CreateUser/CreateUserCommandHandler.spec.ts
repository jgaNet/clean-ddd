import { expect } from '@jest/globals';
import {
  mockedApplication,
  mockedUserRepository,
  mockedUserQueries,
} from '@Contexts/UsersManager/usersManagerModule.mock';
import { Exception } from '@Primitives/Exception';
import { UserWithEmailAlreadyExists, InvalidUserEmail } from '@Contexts/UsersManager/Domain/User/UserExceptions';
import { MockedUserRepository } from '@Contexts/UsersManager/Infrastructure/Repositories/MockedUserRepository';
import { MockedUserQueries } from '@Contexts/UsersManager/Infrastructure/Queries/MockedUserQueries';
import { CreateUserCommandEvent } from '@Contexts/UsersManager/Application/Commands/CreateUser/CreateUserCommandEvents';

beforeEach(() => {
  MockedUserRepository.clearMocks();
  MockedUserQueries.clearMocks();
});

describe('how to create a user', function () {
  it('should create a user if he is not already existing', async () => {
    (mockedUserRepository.nextIdentity as jest.Mock).mockImplementationOnce(() => Promise.resolve('mockedId'));

    await mockedApplication.getCommand(CreateUserCommandEvent).execute(
      new CreateUserCommandEvent({
        profile: { email: 'test@test.fr', nickname: 'manual-nickname' },
      }),
    );

    expect(mockedUserRepository.save).toHaveBeenCalledWith({
      _id: 'mockedId',
      profile: {
        email: 'test@test.fr',
        nickname: 'manual-nickname',
      },
    });
  });

  it('should not create a user if he is not already existing', async () => {
    (mockedUserQueries.findByEmail as jest.Mock).mockImplementationOnce(() => Promise.resolve({}));

    const result = await mockedApplication.getCommand(CreateUserCommandEvent).execute(
      new CreateUserCommandEvent({
        profile: { email: 'test@test.fr' },
      }),
    );

    expect(result.isFailure()).toBeTruthy();
    expect(mockedUserRepository.save).not.toHaveBeenCalled();
    expect(new UserWithEmailAlreadyExists({ email: 'test@test.fr' }).equals(result.error as Exception)).toBeTruthy();
  });

  it('should create a user with a nickname from username email if nickname is not specify', async () => {
    (mockedUserRepository.nextIdentity as jest.Mock).mockImplementationOnce(() => Promise.resolve('mockedId'));

    await mockedApplication.getCommand(CreateUserCommandEvent).execute(
      new CreateUserCommandEvent({
        profile: { email: 'nickname@test.fr' },
      }),
    );

    expect(mockedUserRepository.save).toHaveBeenCalledWith({
      _id: 'mockedId',
      profile: {
        email: 'nickname@test.fr',
        nickname: 'nickname',
      },
    });
  });

  it('should not create a user if the email is malformed', async () => {
    const result = await mockedApplication.getCommand(CreateUserCommandEvent).execute(
      new CreateUserCommandEvent({
        profile: { email: 'email-malformed' },
      }),
    );

    expect(result.isFailure()).toBeTruthy();
    expect(mockedUserRepository.save).not.toHaveBeenCalled();
    expect(new InvalidUserEmail({ email: 'email-malformed' }).equals(result.error as Exception)).toBeTruthy();
  });

  it('should not create a user if the email is too long', async () => {
    const email = 'a'.repeat(100) + '@test.fr';

    const result = await mockedApplication.getCommand(CreateUserCommandEvent).execute(
      new CreateUserCommandEvent({
        profile: { email },
      }),
    );

    expect(result.isFailure()).toBeTruthy();
    expect(mockedUserRepository.save).not.toHaveBeenCalled();

    expect(
      new InvalidUserEmail({
        email,
      }).equals(result.error as Exception),
    ).toBeTruthy();
  });
});
