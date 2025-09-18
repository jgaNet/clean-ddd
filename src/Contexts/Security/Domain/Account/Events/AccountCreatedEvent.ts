import { DomainEvent } from '@Core/Application';
import { IAccount } from '../DTOs';

export class AccountCreatedEvent extends DomainEvent<IAccount> {}
