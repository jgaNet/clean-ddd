import { Exception } from '@Primitives/Exception';

class EventBusException extends Exception {
  constructor({ type, message, context }: { type: string; message: string; context: unknown }) {
    super({ service: 'broker', type, message, context });
  }
}

export const EventBusExceptions = {
  NoMessageValue: (context: { eventName: string }) =>
    new EventBusException({
      type: 'NoMessageValue',
      message: 'No message value from broker',
      context,
    }),
  Unknown: (context: { trace: Error }) =>
    new EventBusException({
      type: 'NoMessageValue',
      message: 'No message value from broker',
      context,
    }),
};
