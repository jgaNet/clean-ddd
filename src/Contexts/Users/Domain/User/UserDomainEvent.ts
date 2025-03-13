import { DomainEvent } from '@SharedKernel/Domain/Application';

export class UserDomainEvent<T> extends DomainEvent<T> {}
