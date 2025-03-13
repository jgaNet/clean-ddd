import { CommandEvent, ExceptionEvent } from '@SharedKernel/Domain/Application';
import { CreateUserCommandPort } from '@Contexts/Users/Application/DTOs';
import { Exception } from '@SharedKernel/Domain/DDD';

export class CreateUserCommandEvent extends CommandEvent<CreateUserCommandPort> {}
export class CreateUserCommandExceptionEvent extends ExceptionEvent<Exception> {}
