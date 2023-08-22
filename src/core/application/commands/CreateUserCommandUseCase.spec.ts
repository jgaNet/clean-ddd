import { expect } from '@jest/globals';
import { mockedApplication, mockedUserRepository } from '@core/infrastructure/app/application.mock';
import { UserExceptions } from '@core/domain/user/UserExceptions';
import { MockedUserRepository } from '@core/infrastructure/adapters/repositories/MockedUserRepository';

beforeEach(() => {
  MockedUserRepository.clearMocks();
});

describe('how to create a user', function () {
  it('should create a user if he is not already exist', async () => {
    (mockedUserRepository.nextIdentity as jest.Mock).mockImplementationOnce(() => Promise.resolve('mockedId'));

    await mockedApplication.commands.createUser.execute({
      profile: { email: 'test@test.fr', nickname: 'manual-nickname' },
    });

    expect(mockedUserRepository.save).toHaveBeenCalledWith({
      _id: 'mockedId',
      profile: {
        email: 'test@test.fr',
        nickname: 'manual-nickname',
      },
    });
  });

  it('should not create a user if he is not already exist', async () => {
    (mockedUserRepository.findByEmail as jest.Mock).mockImplementationOnce(() => Promise.resolve({}));

    try {
      await mockedApplication.commands.createUser.execute({
        profile: { email: 'test@test.fr' },
      });
    } catch (e) {
      expect(e).toEqual(UserExceptions.UserWithEmailAlreadyExists);
    }
  });

  it('should create a user with a nickname from username email if nickname is not specify', async () => {
    (mockedUserRepository.nextIdentity as jest.Mock).mockImplementationOnce(() => Promise.resolve('mockedId'));

    await mockedApplication.commands.createUser.execute({
      profile: { email: 'nickname@test.fr' },
    });

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
      await mockedApplication.commands.createUser.execute({
        profile: { email: 'email-malformed' },
      });
    } catch (e) {
      expect(e).toEqual(UserExceptions.InvalidUserEmail);
    }
  });
});
