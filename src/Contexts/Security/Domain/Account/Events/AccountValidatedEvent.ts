import { DomainEvent } from '@Primitives/Application';
import { IAccount } from '../DTOs';

export class AccountValidatedEvent extends DomainEvent<IAccount> {}
