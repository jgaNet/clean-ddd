import { NewUserDTO } from 'core/domain/user/dtos';
import { UserFactory } from 'core/domain/user/UserFactory';
import { UserMapper } from 'core/domain/user/UserMapper';
import { UserRepository } from 'core/domain/user/UserRepository';
import { UserCreated } from 'core/domain/user/events/UserCreated';
import { EventBus } from '@primitives/EventBus';

export class CreateUserCommandUseCase {
  #userFactory: UserFactory;
  #userRepository: UserRepository;
  #eventBus: EventBus;

  constructor({ userRepository, eventBus }: { userRepository: UserRepository; eventBus: EventBus }) {
    this.#userFactory = new UserFactory({ userRepository });
    this.#userRepository = userRepository;
    this.#eventBus = eventBus;
  }

  async execute(newUserProps: NewUserDTO): Promise<void> {
    const newUser = await this.#userFactory.new(newUserProps);
    const userDTO = UserMapper.toDTO(newUser);
    await this.#userRepository.save(userDTO);
    this.#eventBus.dispatch(UserCreated, userDTO);
  }
}
