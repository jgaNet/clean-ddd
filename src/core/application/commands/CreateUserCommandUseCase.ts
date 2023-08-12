import { User } from 'core/domain/user/User';
import { UserFactory, NewUserProps } from 'core/domain/user/UserFactory';
import { UserRepository } from 'core/domain/user/UserRepository';

export class CreateUserCommandUseCase {
  #userFactory: UserFactory;
  #userRepository: UserRepository;

  constructor({ userFactory, userRepository }: { userFactory: UserFactory; userRepository: UserRepository }) {
    this.#userFactory = userFactory;
    this.#userRepository = userRepository;
  }

  async execute(newUserProps: NewUserProps): Promise<User | Error> {
    const newUser = await this.#userFactory.new(newUserProps);
    await this.#userRepository.save(newUser);
    return newUser;
  }
}
