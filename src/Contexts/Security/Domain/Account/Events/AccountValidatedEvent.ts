import { DomainEvent } from '@SharedKernel/Domain/Application';
import { IAccount } from '../DTOs';

export class AccountValidatedEvent extends DomainEvent<IAccount> {}
