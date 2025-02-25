import { EventBus } from '@Primitives/EventBus';
import { Event } from '@Primitives/Event';
import { EventHandler } from '@Primitives/EventHandler';
import { Kafka, KafkaConfig, Producer } from 'kafkajs';
import { EventBusExceptions } from './EventBusExceptions';
import { Operation } from '@Primitives/Operation';

// TODO: Move it on config file
const GROUPID = `group-${Math.ceil(Math.random() * 1000000000)}`;

export class KafkaEventBus implements EventBus {
  #eventEmitter: Kafka;
  #producer: Producer;

  constructor(config: KafkaConfig) {
    this.#eventEmitter = new Kafka(config);
    this.#producer = this.#eventEmitter.producer();
  }

  async connect() {
    // eslint-disable-next-line no-console
    console.log('[sys][broker][info] Kafka broker connecting...');
    await this.#producer.connect();
    // eslint-disable-next-line no-console
    console.log('[sys][broker][info] Kafka broker connected');
  }

  dispatch<T>(event: Event<T>): Operation<Event<T>> {
    const operation = new Operation({ event });
    this.#producer.send({ topic: operation.name, messages: [{ value: JSON.stringify(event) }] });
    return operation;
  }

  async subscribe<T>(channel: Event<T>['name'], eventHandler: EventHandler<Event<T>>) {
    const consumer = this.#eventEmitter.consumer({ groupId: channel + '-' + GROUPID });
    await consumer.connect();
    consumer.subscribe({ topic: channel, fromBeginning: false });
    consumer.run({
      eachMessage: async ({ message }) => {
        if (message.value) {
          try {
            await eventHandler.execute(JSON.parse(message.value.toString()));
          } catch (e) {
            if (e instanceof Error) {
              // eslint-disable-next-line no-console
              console.log(EventBusExceptions.Unknown({ trace: e }));
            }
          }
        } else {
          // eslint-disable-next-line no-console
          console.log(EventBusExceptions.NoMessageValue({ eventName: channel }));
        }
      },
    });
  }
}
