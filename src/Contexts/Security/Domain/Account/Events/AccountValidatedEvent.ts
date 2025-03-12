import { DomainEvent } from '@Primitives/EventTypes';
import { IAccount } from '../DTOs';

export class AccountValidatedEvent extends DomainEvent<IAccount> {}
