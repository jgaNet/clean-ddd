import { DomainEvent } from '@Primitives/EventTypes';
import { IAccount } from '../DTOs';

export class AccountCreatedEvent extends DomainEvent<IAccount> {}
