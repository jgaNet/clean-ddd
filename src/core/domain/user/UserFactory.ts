import { User, UserProps } from './User';
import { UserRepository } from './UserRepository';
import { UserExceptions } from './UserExceptions';
import { UserId } from './UserId';

export interface NewUserProps extends UserProps { }

export class UserFactory {
  #userRepository: UserRepository;

  constructor({ userRepository }: { userRepository: UserRepository }) {
    this.#userRepository = userRepository;
  }

  async exists(newUserProps: UserProps): Promise<true | Error> {
    const user = await this.#userRepository.findByEmail(newUserProps.email);

    if (user) {
      return UserExceptions.UserWithEmailAlreadyExists;
    }

    return true;
  }

  async new(newUserProps: UserProps): Promise<User> {
    const existsOrError = await this.exists(newUserProps);

    if (existsOrError instanceof Error) {
      throw existsOrError;
    }

    const userId = new UserId(await this.#userRepository.nextIdentity());

    return new User(userId, newUserProps);
  }
}
