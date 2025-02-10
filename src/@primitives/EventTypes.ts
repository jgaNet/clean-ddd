import { Event } from './Event';
import { Exception } from './Exception';
export class CommandEvent<PayloadDTO> extends Event<PayloadDTO> {}
export class DomainEvent<PayloadDTO> extends Event<PayloadDTO> {}
export class IntegrationEvent<PayloadDTO> extends Event<PayloadDTO> {}
export class ExceptionEvent<T extends Exception> extends Event<T> {}
