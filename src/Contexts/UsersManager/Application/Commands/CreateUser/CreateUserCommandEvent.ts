import { CommandEvent, ExceptionEvent } from '@Primitives/EventTypes';
import { CreateUserCommandPort } from '@Contexts/UsersManager/Application/DTOs';
import { Exception } from '@Primitives/Exception';

export class CreateUserCommandEvent extends CommandEvent<CreateUserCommandPort> {}
export class CreateUserCommandExceptionEvent extends ExceptionEvent<Exception> {}
