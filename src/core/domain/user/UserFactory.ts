import { User } from './User';
import { UserRepository } from './UserRepository';
import { UserExceptions } from './UserExceptions';
import { NewUserDTO, UserDTO } from './dtos';

export class UserFactory {
  #userRepository: UserRepository;

  constructor({ userRepository }: { userRepository: UserRepository }) {
    this.#userRepository = userRepository;
  }

  async exists(newUserProps: NewUserDTO): Promise<true | Error> {
    const user = await this.#userRepository.findByEmail(newUserProps.profile.email);

    if (user) {
      return UserExceptions.UserWithEmailAlreadyExists;
    }

    return true;
  }

  async new(newUserProps: NewUserDTO): Promise<User> {
    const existsOrError = await this.exists(newUserProps);

    if (existsOrError instanceof Error) {
      throw existsOrError;
    }

    const userProps = newUserProps as UserDTO;

    userProps._id = await this.#userRepository.nextIdentity();

    return User.create(userProps);
  }
}
