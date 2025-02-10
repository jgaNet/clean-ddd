import { UserFactory } from '@Contexts/UsersManager/Domain/User/UserFactory';
import { UserMapper } from '@Contexts/UsersManager/Domain/User/UserMapper';
import { UserRepository } from '@Contexts/UsersManager/Domain/User/UserRepository';
import { UserCreatedEvent } from '@Contexts/UsersManager/Domain/User/Events/UserCreatedEvent';
import { EventBus } from '@Primitives/EventBus';
import { CommandHandler } from '@Primitives/CommandHandler';
import { CreateUserCommandEvent } from '@Contexts/UsersManager/Application/Commands/CreateUser/CreateUserCommandEvents';
import { ExceptionHandler } from '@Primitives/ExceptionHandler';
import Result from '@Primitives/Result';

export class CreateUserCommandHandler extends CommandHandler<CreateUserCommandEvent> {
  #userFactory: UserFactory;
  #userRepository: UserRepository;
  #eventBus: EventBus;

  constructor({
    userRepository,
    eventBus,
  }: {
    userRepository: UserRepository;
    eventBus: EventBus;
    exceptionHandler: ExceptionHandler;
  }) {
    super();
    this.#userFactory = new UserFactory({ userRepository });
    this.#userRepository = userRepository;
    this.#eventBus = eventBus;
  }

  async execute({ payload }: CreateUserCommandEvent): Promise<Result> {
    try {
      const newUser = await this.#userFactory.new(payload);
      const newUserDto = UserMapper.toJson(newUser);
      await this.#userRepository.save(newUserDto);
      this.#eventBus.dispatch(UserCreatedEvent, newUserDto);

      return Result.ok();
    } catch (e) {
      return Result.fail(e);
    }
  }
}
