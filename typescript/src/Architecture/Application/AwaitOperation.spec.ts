import { EventEmitter } from 'events';
import { expect } from '@jest/globals';

import { CommandEvent, NotFoundException, Result } from '@Architecture/Domain';
import { CommandHandler, ExecutionContext, IOperation, OperationStatus } from '@Architecture/Application';
import { InMemoryEventBus } from '@Architecture/Infrastructure/EventBus/InMemoryEventBus';
import { awaitOperation, hasOutcome } from './AwaitOperation';

class Greet extends CommandEvent<{ name: string }> {}

/** Decides a greeting, after a pause when told to: what a caller in one exchange waits for. */
class GreetHandler extends CommandHandler<Greet> {
  delayMs = 0;
  async execute(event: Greet) {
    if (this.delayMs) await new Promise(resolve => setTimeout(resolve, this.delayMs));
    if (event.payload.name === 'nobody') {
      return Result.fail(new NotFoundException('Test', 'Nobody to greet'));
    }
    return Result.ok(`Hello ${event.payload.name}`);
  }
}

/** The outcome a compatibility route answers from (ADR 36): the handler's verdict, or the deadline. */
describe('awaitOperation', () => {
  let bus: InMemoryEventBus;
  let handler: GreetHandler;
  let context: ExecutionContext;

  beforeEach(async () => {
    bus = new InMemoryEventBus({ eventEmitter: new EventEmitter(), clock: () => new Date() });
    handler = new GreetHandler();
    context = new ExecutionContext({ traceId: 'trace', eventBus: bus, auth: {} });
    await bus.subscribe(Greet.name, handler);
  });

  it('resolves with the outcome once the handler has decided: the result of a success', async () => {
    const operation = await awaitOperation(bus.publish(Greet.set({ name: 'Alice' }), context));

    expect(hasOutcome(operation)).toBe(true);
    expect(operation.status).toBe(OperationStatus.SUCCESS);
    expect(operation.result?.data).toBe('Hello Alice');
  });

  it('resolves with the refusal of a refused command, named by its exception', async () => {
    const operation = await awaitOperation(bus.publish(Greet.set({ name: 'nobody' }), context));

    expect(operation.status).toBe(OperationStatus.ERROR);
    expect(operation.result?.isFailure() && operation.result.error).toMatchObject({
      type: 'NotFound',
      message: 'Nobody to greet',
    });
  });

  it('gives up at the deadline and returns the operation still pending; the handler finishes anyway', async () => {
    handler.delayMs = 50;
    const published = bus.publish(Greet.set({ name: 'Alice' }), context);

    const operation = await awaitOperation(published, { timeoutMs: 5 });

    expect(operation).toBe(published);
    expect(hasOutcome(operation)).toBe(false);
    expect(operation.status).toBe(OperationStatus.PENDING);

    await published.delivered;
    expect(operation.status).toBe(OperationStatus.SUCCESS);
    expect(operation.result?.data).toBe('Hello Alice');
  });

  it('returns at once an operation that already has its outcome', async () => {
    const published = bus.publish(Greet.set({ name: 'Alice' }), context);
    await published.delivered;

    const operation = await awaitOperation(published, { timeoutMs: 0 });

    expect(operation.status).toBe(OperationStatus.SUCCESS);
  });

  it('returns at once, still pending, when the bus cannot tell whether the message was delivered', async () => {
    const published = bus.publish(Greet.set({ name: 'Alice' }), context);
    const blind: IOperation<Greet> = { ...published, delivered: undefined, status: OperationStatus.PENDING };

    const operation = await awaitOperation(blind, { timeoutMs: 10_000 });

    expect(operation).toBe(blind);
    expect(operation.status).toBe(OperationStatus.PENDING);
  });

  it('returns a command nobody answers still pending, once the bus has delivered it to no one', async () => {
    class Unanswered extends CommandEvent<Record<string, never>> {}

    const operation = await awaitOperation(bus.publish(Unanswered.set({}), context), { timeoutMs: 10_000 });

    expect(hasOutcome(operation)).toBe(false);
    expect(operation.status).toBe(OperationStatus.PENDING);
  });
});
