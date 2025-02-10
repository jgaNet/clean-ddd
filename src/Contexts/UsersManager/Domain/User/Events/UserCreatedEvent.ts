import { UserDomainEvent } from '@Contexts/UsersManager/Domain/User/UserDomainEvent';
import { UserDTO } from '@Contexts/UsersManager/Domain/User/DTOs';

export class UserCreatedEvent extends UserDomainEvent<UserDTO> {}
