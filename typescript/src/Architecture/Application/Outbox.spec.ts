import { EventEmitter } from 'events';
import { expect } from '@jest/globals';

import { DomainEvent, IResult, NotFoundException, Result } from '@Architecture/Domain';
import { EventHandler } from './EventHandler';
import { ExecutionContext } from './ExecutionContext';
import { relayOutbox } from './Outbox';
import { InMemoryEventBus } from '@Architecture/Infrastructure/EventBus/InMemoryEventBus';
import { InMemoryOutbox } from '@Architecture/Infrastructure/Outbox/InMemoryOutbox';

class BookingConfirmed extends DomainEvent<{ bookingId: string }> {}

/** A reaction that waits until the test lets it finish, and fails while `failing` says so. */
class TellTheHost extends EventHandler<BookingConfirmed> {
  handled = 0;
  failing = false;
  #release: () => void = () => {};
  #gate: Promise<void> = Promise.resolve();

  hold() {
    this.#gate = new Promise(resolve => (this.#release = resolve));
  }

  release() {
    this.#release();
  }

  async execute(): Promise<IResult> {
    this.handled++;
    await this.#gate;
    return this.failing ? Result.fail(new NotFoundException('Test', 'the service refused')) : Result.ok();
  }
}

const settle = () => new Promise(resolve => setTimeout(resolve, 10));

/**
 * The relay acknowledges an outbox entry once every reaction it reached has committed, never
 * sooner (ADR 24): a process that dies while a reaction runs has not lost the fact, and the next
 * relay hands it out again to the subscribers that had not handled it yet.
 */
describe('relayOutbox', () => {
  it('keeps an entry pending while a reaction to it runs, and hands it out once meanwhile', async () => {
    const bus = new InMemoryEventBus({ eventEmitter: new EventEmitter() });
    const reaction = new TellTheHost();
    await bus.subscribe(BookingConfirmed.name, reaction);
    const outbox = new InMemoryOutbox();
    const context = new ExecutionContext({ traceId: 'relay', auth: {}, eventBus: bus });
    const [entry] = outbox.append([BookingConfirmed.set({ bookingId: 'b-1' })]);

    reaction.hold();
    relayOutbox(outbox, bus, context);
    await settle();
    // The reaction has not committed: a crash now must find the fact still owed.
    expect(outbox.pending()).toEqual([entry]);
    // A second relay (the next commit's) does not hand out an entry already on its way.
    relayOutbox(outbox, bus, context);
    await settle();
    expect(reaction.handled).toBe(1);

    reaction.release();
    await settle();
    expect(outbox.pending()).toEqual([]);
  });

  it('keeps an entry whose reaction failed pending, and hands it again to that subscriber only', async () => {
    const bus = new InMemoryEventBus({ eventEmitter: new EventEmitter() });
    const told = new TellTheHost();
    const refused = new TellTheHost();
    await bus.subscribe(BookingConfirmed.name, told);
    await bus.subscribe(BookingConfirmed.name, refused);
    const outbox = new InMemoryOutbox();
    const context = new ExecutionContext({ traceId: 'relay', auth: {}, eventBus: bus });
    const [entry] = outbox.append([BookingConfirmed.set({ bookingId: 'b-2' })]);

    refused.failing = true;
    relayOutbox(outbox, bus, context);
    await settle();
    expect(outbox.pending()).toEqual([entry]);

    refused.failing = false;
    relayOutbox(outbox, bus, context);
    await settle();
    expect(outbox.pending()).toEqual([]);
    expect([told.handled, refused.handled]).toEqual([1, 2]);
  });
});
