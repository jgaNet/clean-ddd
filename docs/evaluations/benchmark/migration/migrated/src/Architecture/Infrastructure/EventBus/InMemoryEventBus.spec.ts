import { EventEmitter } from 'events';
import { expect } from '@jest/globals';

import { DomainEvent, Result } from '@Architecture/Domain';
import { EventHandler, ExecutionContext } from '@Architecture/Application';
import { InMemoryEventBus } from './InMemoryEventBus';

class Greeted extends DomainEvent<{ name: string }> {}

/** A reaction that counts, and fails when told to: the bus's inbox must remember only what was handled. */
class Counter extends EventHandler<Greeted> {
  seen: string[] = [];
  failNext = false;
  async execute(event: Greeted) {
    if (this.failNext) {
      this.failNext = false;
      return Result.fail(new Error('not this time'));
    }
    this.seen.push(event.payload.name);
    return Result.ok();
  }
}

const settle = () => new Promise(resolve => setImmediate(resolve));

/** Idempotent delivery (ADR 24): a message relayed twice from the outbox reaches a subscriber once. */
describe('InMemoryEventBus', () => {
  let bus: InMemoryEventBus;
  let counter: Counter;
  let context: ExecutionContext;

  beforeEach(async () => {
    bus = new InMemoryEventBus({ eventEmitter: new EventEmitter() });
    counter = new Counter();
    context = new ExecutionContext({ traceId: 'trace', eventBus: bus, auth: {} });
    await bus.subscribe(Greeted.name, counter);
  });

  it('delivers a message once per subscriber, by its id, however many times it is published', async () => {
    bus.publish(Greeted.set({ name: 'alice' }), context, 'message-1');
    await settle();
    const again = bus.publish(Greeted.set({ name: 'alice' }), context, 'message-1');
    await settle();

    expect(counter.seen).toEqual(['alice']);
    expect(again.status).toBe('SENT');
  });

  it('delivers two messages with two ids, and the same event without an id as many times as it is published', async () => {
    bus.publish(Greeted.set({ name: 'alice' }), context, 'message-1');
    bus.publish(Greeted.set({ name: 'alice' }), context, 'message-2');
    bus.publish(Greeted.set({ name: 'bob' }), context);
    bus.publish(Greeted.set({ name: 'bob' }), context);
    await settle();

    expect(counter.seen).toEqual(['alice', 'alice', 'bob', 'bob']);
  });

  it('hands a message again to a subscriber whose reaction failed: at least once is the promise', async () => {
    counter.failNext = true;
    bus.publish(Greeted.set({ name: 'alice' }), context, 'message-1');
    await settle();
    expect(counter.seen).toEqual([]);

    bus.publish(Greeted.set({ name: 'alice' }), context, 'message-1');
    await settle();
    expect(counter.seen).toEqual(['alice']);
  });
});
