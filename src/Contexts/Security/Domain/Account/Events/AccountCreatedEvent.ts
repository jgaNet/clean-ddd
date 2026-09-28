import { DomainEvent } from '@SharedKernel/Domain';
import { IAccount } from '../DTOs';

export class AccountCreatedEvent extends DomainEvent<IAccount> {}
