import { UserDomainEvent } from '../UserDomainEvent';
import { UserDTO } from '../dtos';

export class UserCreatedEvent extends UserDomainEvent<UserDTO> { }
