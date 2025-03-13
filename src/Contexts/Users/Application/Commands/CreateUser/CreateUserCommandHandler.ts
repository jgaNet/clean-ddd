import { ExecutionContext, Result, IResult, CommandHandler } from '@SharedKernel/Domain/Application';

import { UserFactory } from '@Contexts/Users/Domain/User/UserFactory';
import { UserMapper } from '@Contexts/Users/Domain/User/UserMapper';
import { IUserRepository } from '@Contexts/Users/Domain/User/Ports/IUserRepository';
import { IUserQueries } from '@Contexts/Users/Domain/User/Ports/IUserQueries';
import { UserCreatedEvent } from '@Contexts/Users/Domain/User/Events/UserCreatedEvent';
import { CreateUserCommandEvent } from '@Contexts/Users/Application/Commands/CreateUser';
import { IUser } from '@Contexts/Users/Domain/User';
import { Role } from '@SharedKernel/Domain/AccessControl';
import { NotAllowedException } from '@SharedKernel/Domain';

export class CreateUserCommandHandler extends CommandHandler<CreateUserCommandEvent> {
  #userFactory: UserFactory;
  #userRepository: IUserRepository;

  constructor({ userRepository, userQueries }: { userRepository: IUserRepository; userQueries: IUserQueries }) {
    super();
    this.#userFactory = new UserFactory({ userRepository, userQueries });
    this.#userRepository = userRepository;
  }

  async execute({ payload }: CreateUserCommandEvent, context: ExecutionContext): Promise<IResult<IUser>> {
    // Use the context's transaction management if a UnitOfWork is available
    if (context.unitOfWork) {
      return context.withTransaction(async () => this.createUser(payload, context));
    }

    // Otherwise, fall back to the non-transactional approach
    return this.createUser(payload, context);
  }

  protected async guard(_: never, { auth }: ExecutionContext): Promise<IResult> {
    if (!auth.role || ![Role.ADMIN].includes(auth.role)) {
      return Result.fail(new NotAllowedException('Users', 'Forbidden'));
    }
    return Result.ok();
  }

  private async createUser(
    payload: CreateUserCommandEvent['payload'],
    context: ExecutionContext,
  ): Promise<IResult<IUser>> {
    try {
      // Log the operation using the context
      if (context.logger) {
        context.logger.info(`Creating user with email: ${payload.profile.email}`, {
          traceId: context.traceId,
          user: payload,
        });
      }

      // Create the user
      const newUser = await this.#userFactory.new(payload);

      if (newUser.isFailure()) {
        if (context.logger) {
          context.logger.error('Failed to create user', newUser.error, {
            traceId: context.traceId,
          });
        }
        return newUser;
      }

      // Map to JSON and save
      const newUserJSON = UserMapper.toJSON(newUser.data);
      await this.#userRepository.save(newUserJSON);

      // Use the context's event bus to dispatch the event
      context.eventBus.publish(UserCreatedEvent.set(newUserJSON), context);

      // Log success
      if (context.logger) {
        context.logger.info(`User created successfully with ID: ${newUserJSON._id}`, {
          traceId: context.traceId,
          userId: newUserJSON._id,
        });
      }

      return Result.ok(newUserJSON);
    } catch (e) {
      // Log error
      if (context.logger) {
        context.logger.error('Unexpected error while creating user', e, {
          traceId: context.traceId,
        });
      }

      return Result.fail(e);
    }
  }
}
