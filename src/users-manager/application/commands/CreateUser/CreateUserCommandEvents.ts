import { CommandEvent, ExceptionEvent } from '@primitives/EventTypes';
import { CreateUserCommandPort } from '../../dtos';

export class CreateUserCommandEvent extends CommandEvent<CreateUserCommandPort> { }
export class CreateUserCommandExceptionEvent extends ExceptionEvent<Error> { }
