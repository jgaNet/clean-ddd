import { DomainEvent } from '@Core/Application';
import { IAccount } from '../DTOs';

export class AccountValidatedEvent extends DomainEvent<IAccount> {}
