import { UserFactory } from 'core/domain/user/UserFactory';
import { CreateUserCommandUseCase } from './CreateUserCommandUseCase';
import { User } from 'core/domain/user/User';
import { UserId } from 'core/domain/user/UserId';
import { UserExceptions } from 'core/domain/user/UserExceptions';

describe('create user command usecase', function () {
  it('should create a user if he is not already exist', async () => {
    const mockedUserRepository = {
      findByEmail: (_: string) => Promise.resolve(null),
      nextIdentity: () => Promise.resolve('mockedId'),
      save: (user: User) => Promise.resolve(user),
    };

    const createUser = new CreateUserCommandUseCase({
      userFactory: new UserFactory({
        userRepository: mockedUserRepository,
      }),
      userRepository: mockedUserRepository,
    });

    const newUser = (await createUser.execute({ email: 'test@test.fr' })) as User;
    expect(newUser).toBeInstanceOf(User);
    expect(newUser.email).toEqual('test@test.fr');
    expect(newUser._id).toEqual('mockedId');
  });

  it('should not create a user if he already exists', async () => {
    const mockedUserRepository = {
      findByEmail: () => Promise.resolve({} as User),
      save: (user: User) => Promise.resolve(user),
      nextIdentity: () => Promise.resolve('Id'),
    };

    const createUser = new CreateUserCommandUseCase({
      userFactory: new UserFactory({
        userRepository: mockedUserRepository,
      }),
      userRepository: mockedUserRepository,
    });

    try {
      await createUser.execute({ email: 'test@test.fr' });
    } catch (e) {
      expect(e).toEqual(UserExceptions.UserWithEmailAlreadyExists);
    }
  });

  it('should not create a user if the email is malformed', async () => {
    const mockedUserRepository = {
      findByEmail: () => Promise.resolve(null),
      save: (user: User) => Promise.resolve(user),
      nextIdentity: () => Promise.resolve('Id'),
    };

    const createUser = new CreateUserCommandUseCase({
      userFactory: new UserFactory({
        userRepository: mockedUserRepository,
      }),
      userRepository: mockedUserRepository,
    });

    try {
      await createUser.execute({ email: 'test' });
    } catch (e) {
      expect(e).toEqual(UserExceptions.InvalidUserEmail);
    }
  });
});
