import { UserFactory } from 'users-manager/domain/user/UserFactory';
import { UserMapper } from 'users-manager/domain/user/UserMapper';
import { UserRepository } from 'users-manager/domain/user/UserRepository';
import { UserCreatedEvent } from 'users-manager/domain/user/events/UserCreatedEvent';
import { EventBus } from '@primitives/EventBus';
import { EventHandler as CommandHandler } from '@primitives/EventHandler';
import { CreateUserCommandEvent, CreateUserCommandExceptionEvent } from './CreateUserCommandEvents';
import { ExceptionHandler } from '@primitives/ExceptionHandler';
import { Exception } from '@primitives/Exception';

export class CreateUserCommandHandler extends CommandHandler<CreateUserCommandEvent> {
  #userFactory: UserFactory;
  #userRepository: UserRepository;
  #eventBus: EventBus;
  #exceptionHandler: ExceptionHandler;

  constructor({
    userRepository,
    eventBus,
    exceptionHandler,
  }: {
    userRepository: UserRepository;
    eventBus: EventBus;
    exceptionHandler: ExceptionHandler;
  }) {
    super();
    this.#userFactory = new UserFactory({ userRepository });
    this.#userRepository = userRepository;
    this.#eventBus = eventBus;
    this.#exceptionHandler = exceptionHandler;
  }

  async execute({ payload }: CreateUserCommandEvent): Promise<void> {
    try {
      const newUser = await this.#userFactory.new(payload);
      const newUserDto = UserMapper.toJson(newUser);
      await this.#userRepository.save(newUserDto);
      this.#eventBus.dispatch(UserCreatedEvent, newUserDto);
    } catch (e) {
      if (e instanceof Exception) {
        return this.#exceptionHandler.throw(CreateUserCommandExceptionEvent, e);
      }

      this.#exceptionHandler.unknown(e);
    }
  }
}
