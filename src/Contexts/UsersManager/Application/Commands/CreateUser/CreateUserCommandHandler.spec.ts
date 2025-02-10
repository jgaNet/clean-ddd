import { expect } from '@jest/globals';
import { mockedApplication, mockedUserRepository } from '@Contexts/UsersManager/usersManagerModule.mock';
import { Exception } from '@Primitives/Exception';
import { UserExceptions } from '@Contexts/UsersManager/Domain/User/UserExceptions';
import { MockedUserRepository } from '@Contexts/UsersManager/Infrastructure/Repositories/MockedUserRepository';
import { CreateUserCommandEvent } from '@Contexts/UsersManager/Application/Commands/CreateUser/CreateUserCommandEvents';

beforeEach(() => {
  MockedUserRepository.clearMocks();
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
    (mockedUserRepository.findByEmail as jest.Mock).mockImplementationOnce(() => Promise.resolve({}));

    try {
      await mockedApplication.getCommand(CreateUserCommandEvent).execute(
        new CreateUserCommandEvent({
          profile: { email: 'test@test.fr' },
        }),
      );

      throw 'Not Thrown';
    } catch (e: unknown) {
      expect(UserExceptions.UserWithEmailAlreadyExists({ email: 'test@test.fr' }).equals(e as Exception)).toBeTruthy();
    }
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
    try {
      await mockedApplication.getCommand(CreateUserCommandEvent).execute(
        new CreateUserCommandEvent({
          profile: { email: 'email-malformed' },
        }),
      );

      throw 'Not Thrown';
    } catch (e) {
      expect(UserExceptions.InvalidUserEmail({ email: 'email-malformed' }).equals(e as Exception)).toBeTruthy();
    }
  });

  it('should not create a user if the email is too long', async () => {
    try {
      await mockedApplication.getCommand(CreateUserCommandEvent).execute(
        new CreateUserCommandEvent({
          profile: { email: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa@aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.fr' },
        }),
      );

      throw 'Not Thrown';
    } catch (e) {
      expect(
        UserExceptions.InvalidUserEmail({
          email: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa@aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.fr',
        }).equals(e as Exception),
      ).toBeTruthy();
    }
  });
});
