import { Event as DomainEvent } from '@primitives/Event';
import { UserDTO } from '../dtos';

export class UserCreated extends DomainEvent<UserDTO> {}
