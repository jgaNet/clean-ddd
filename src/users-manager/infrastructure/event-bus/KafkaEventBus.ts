import { EventBus } from '@primitives/EventBus';
import { Event } from '@primitives/Event';
import { EventHandler } from '@primitives/EventHandler';
import { Kafka, KafkaConfig, Producer } from 'kafkajs';
import { EventBusExceptions } from './EventBusExceptions';

// TODO: Move it on config file
const GROUPID = 'group2' || `group-${Math.ceil(Math.random() * 1000000000)}`;

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

  dispatch<T>(EventClass: typeof Event<T>, eventPayload: T) {
    this.#producer.send({ topic: EventClass.name, messages: [{ value: JSON.stringify(eventPayload) }] });
  }

  async subscribe<T>(EventClass: typeof Event<T>, eventHandler: EventHandler<Event<T>>) {
    const consumer = this.#eventEmitter.consumer({ groupId: EventClass.name + '-' + GROUPID });
    await consumer.connect();
    consumer.subscribe({ topic: EventClass.name, fromBeginning: false });
    consumer.run({
      eachMessage: async ({ message }) => {
        if (message.value) {
          try {
            const event = new EventClass(JSON.parse(message.value.toString()));
            await eventHandler.execute(event);
          } catch (e) {
            if (e instanceof Error) {
              // eslint-disable-next-line no-console
              console.log(EventBusExceptions.Unknown({ trace: e }));
            }
          }
        } else {
          // eslint-disable-next-line no-console
          console.log(EventBusExceptions.NoMessageValue({ eventName: EventClass.name }));
        }
      },
    });
  }
}
