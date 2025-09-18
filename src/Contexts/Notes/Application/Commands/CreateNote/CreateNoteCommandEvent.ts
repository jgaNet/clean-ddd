import { CommandEvent, ExceptionEvent } from '@Core/Application';
import { CreateNoteCommandPort } from '@Contexts/Notes/Application/DTOs';
import { Exception } from '@Core/Domain';

export class CreateNoteCommandEvent extends CommandEvent<CreateNoteCommandPort> {}
export class CreateNoteCommandExceptionEvent extends ExceptionEvent<Exception> {}
