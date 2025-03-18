import { CommandEvent, ExceptionEvent } from '@SharedKernel/Domain/Application';
import { CreateNoteCommandPort } from '@Contexts/Notes/Application/DTOs';
import { Exception } from '@SharedKernel/Domain/DDD';

export class CreateNoteCommandEvent extends CommandEvent<CreateNoteCommandPort> {}
export class CreateNoteCommandExceptionEvent extends ExceptionEvent<Exception> {}
