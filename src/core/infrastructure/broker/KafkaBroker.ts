import { EventBus } from '@primitives/EventBus';
import { Event } from '@primitives/Event';
import { EventHandler } from '@primitives/EventHandler';
import { Kafka, KafkaConfig, Producer, Consumer } from 'kafkajs';
import { BrokerExceptions } from './BrokerExceptions';

// TODO: Move it on config file
const GROUPID = 'group1' || `group-${Math.ceil(Math.random() * 1000000000)}`;

export class KafkaBroker implements EventBus {
  #eventEmitter: Kafka;
  #producer: Producer;
  #consumer: Consumer;

  constructor(config: KafkaConfig) {
    this.#eventEmitter = new Kafka(config);
    this.#producer = this.#eventEmitter.producer();
    this.#consumer = this.#eventEmitter.consumer({ groupId: GROUPID });
  }

  async connect() {
    console.log('[sys][broker][info] Kafka broker connecting...');
    await this.#producer.connect();
    await this.#consumer.connect();
    console.log('[sys][broker][info] Kafka broker connected');
  }

  dispatch<T>(EventClass: typeof Event<T>, eventPayload: T) {
    this.#producer.send({ topic: EventClass.name, messages: [{ value: JSON.stringify(eventPayload) }] });
  }

  async subscribe<T>(EventClass: typeof Event<T>, eventHandler: EventHandler<Event<T>>) {
    await this.#consumer.subscribe({ topic: EventClass.name, fromBeginning: false });

    this.#consumer.run({
      eachMessage: async ({ message }) => {
        if (message.value) {
          try {
            const event = new EventClass(JSON.parse(message.value.toString()));
            eventHandler.handler(event);
          } catch (e) {
            throw e;
          }
        } else {
          throw BrokerExceptions.NoMessageValue;
        }
      },
    });
  }
}
