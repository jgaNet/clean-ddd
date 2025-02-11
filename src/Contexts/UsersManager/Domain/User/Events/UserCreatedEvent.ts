import { UserDomainEvent } from '@Contexts/UsersManager/Domain/User/UserDomainEvent';
import { IUser } from '@Contexts/UsersManager/Domain/User/DTOs';

export class UserCreatedEvent extends UserDomainEvent<IUser> {}
