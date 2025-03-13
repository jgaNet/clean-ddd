import { DomainEvent } from '@SharedKernel/Domain/Application';
import { IAccount } from '../DTOs';

export class AccountCreatedEvent extends DomainEvent<IAccount> {}
