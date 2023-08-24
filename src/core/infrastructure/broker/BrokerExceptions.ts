import { Exception } from '@primitives/Exception';

class BrokerException extends Exception {
  constructor({ type, message }: { type: string; message: string }) {
    super({ service: 'broker', type, message });
  }
}

export const BrokerExceptions = {
  NoMessageValue: new BrokerException({
    type: 'NoMessageValue',
    message: 'No message value from broker',
  }),
};
