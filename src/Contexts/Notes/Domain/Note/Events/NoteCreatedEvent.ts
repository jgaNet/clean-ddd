import { NoteDomainEvent } from '@Contexts/Notes/Domain/Note/NoteDomainEvent';
import { INote } from '@Contexts/Notes/Domain/Note/DTOs';

export class NoteCreatedEvent extends NoteDomainEvent<INote> {}
