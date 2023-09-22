import { Event } from './Event';
export class CommandEvent<PayloadDTO> extends Event<PayloadDTO> { }
export class DomainEvent<PayloadDTO> extends Event<PayloadDTO> { }
export class ExceptionEvent<T extends Error> extends Event<T> { }
