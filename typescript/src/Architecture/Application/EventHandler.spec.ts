import { EventEmitter } from 'events';
import { expect, jest } from '@jest/globals';

import { DomainEvent, IResult, NotFoundException, Result } from '@Architecture/Domain';
import { EventBus } from './EventBus';
import { EventHandler } from './EventHandler';
import { ExecutionContext } from './ExecutionContext';
import { OperationStatus } from './Operation';
import { InMemoryEventBus } from '@Architecture/Infrastructure/EventBus/InMemoryEventBus';

class Greeted extends DomainEvent<{ then?: 'fail' | 'throw' }> {}

class OnGreeted extends EventHandler<Greeted> {
  reacted = false;

  async execute({ payload }: Greeted): Promise<IResult> {
    await Promise.resolve(); // a real reaction is asynchronous
    if (payload.then === 'throw') throw new Error('boom');
    if (payload.then === 'fail') return Result.fail(new NotFoundException('Test', 'Nothing to react to'));
    this.reacted = true;
    return Result.ok();
  }
}

const eventBus = { connect: jest.fn(), publish: jest.fn(), subscribe: jest.fn() } as EventBus;
const operationFor = (payload: Greeted['payload']) =>
  new InMemoryEventBus({ eventEmitter: new EventEmitter() }).publish(
    Greeted.set(payload),
    new ExecutionContext({ traceId: 'trace', eventBus, auth: {} }),
  );

describe('EventHandler.handle()', () => {
  it('awaits the reaction and marks the operation SENT', async () => {
    const handler = new OnGreeted();

    const done = await handler.handle(operationFor({}));

    expect(handler.reacted).toBe(true); // not fire-and-forget: the reaction ran before handle() resolved
    expect(done.status).toBe(OperationStatus.SENT);
  });

  it('records a failed reaction on the operation', async () => {
    const done = await new OnGreeted().handle(operationFor({ then: 'fail' }));

    expect(done.status).toBe(OperationStatus.ERROR);
    expect(done.result?.error?.message).toBe('Nothing to react to');
  });

  it('turns a throw into a failed operation instead of an unhandled rejection', async () => {
    const done = await new OnGreeted().handle(operationFor({ then: 'throw' }));

    expect(done.status).toBe(OperationStatus.ERROR);
    expect(done.result?.error?.message).toBe('boom');
  });
});
