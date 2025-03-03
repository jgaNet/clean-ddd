import { EventEmitter } from 'events';
class InMemoryEventEmitter extends EventEmitter {}

export const inMemoryEventEmitter = new InMemoryEventEmitter();
