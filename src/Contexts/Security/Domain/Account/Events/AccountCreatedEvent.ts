import { DomainEvent } from '@Primitives/Application';
import { IAccount } from '../DTOs';

export class AccountCreatedEvent extends DomainEvent<IAccount> {}
