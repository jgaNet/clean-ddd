import { UserFactory } from '@Contexts/UsersManager/Domain/User/UserFactory';
import { UserMapper } from '@Contexts/UsersManager/Domain/User/UserMapper';
import { IUserRepository } from '@Contexts/UsersManager/Domain/User/Ports/IUserRepository';
import { IUserQueries } from '@Contexts/UsersManager/Domain/User/Ports/IUserQueries';
import { UserCreatedEvent } from '@Contexts/UsersManager/Domain/User/Events/UserCreatedEvent';
import { CreateUserCommandEvent } from '@Contexts/UsersManager/Application/Commands/CreateUser';
import { Result, IResult, CommandHandler, EventBus } from '@Primitives';
import { IUser } from '@Contexts/UsersManager/Domain/User';

export class CreateUserCommandHandler extends CommandHandler<CreateUserCommandEvent> {
  #userFactory: UserFactory;
  #userRepository: IUserRepository;

  constructor({ userRepository, userQueries }: { userRepository: IUserRepository; userQueries: IUserQueries }) {
    super();
    this.#userFactory = new UserFactory({ userRepository, userQueries });
    this.#userRepository = userRepository;
  }

  async execute({ payload }: CreateUserCommandEvent, eventBus: EventBus): Promise<IResult<IUser>> {
    try {
      const newUser = await this.#userFactory.new(payload);

      if (newUser.isFailure()) {
        throw newUser;
      }

      const newUserJSON = UserMapper.toJSON(newUser.data);
      await this.#userRepository.save(newUserJSON);
      eventBus.dispatch(new UserCreatedEvent(newUserJSON));

      return Result.ok(newUserJSON);
    } catch (e) {
      return Result.fail(e);
    }
  }
}
