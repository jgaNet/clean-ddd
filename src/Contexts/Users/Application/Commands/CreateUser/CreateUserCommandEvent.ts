import { CommandEvent, ExceptionEvent } from '@Primitives/Application';
import { CreateUserCommandPort } from '@Contexts/Users/Application/DTOs';
import { Exception } from '@Primitives/DDD';

export class CreateUserCommandEvent extends CommandEvent<CreateUserCommandPort> {}
export class CreateUserCommandExceptionEvent extends ExceptionEvent<Exception> {}
