import { UserDomainEvent } from '@Contexts/Users/Domain/User/UserDomainEvent';
import { IUser } from '@Contexts/Users/Domain/User/DTOs';

export class UserCreatedEvent extends UserDomainEvent<IUser> {}
