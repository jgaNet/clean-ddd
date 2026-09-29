import { EventEmitter } from 'events';
import { expect, jest } from '@jest/globals';

import { AggregateRoot, CommandEvent, DomainEvent, IResult, NotAllowedException, Result } from '@Architecture/Domain';
import { Id } from '@Architecture/Domain';
import { CommandHandler } from './CommandHandler';
import { EventBus } from './EventBus';
import { ExecutionContext, UnitOfWork } from './ExecutionContext';
import { OperationStatus } from './Operation';
import { InMemoryEventBus } from '@Architecture/Infrastructure/EventBus/InMemoryEventBus';

class Greet extends CommandEvent<{ name: string; then?: 'fail' | 'throw' }> {}
class Greeted extends DomainEvent<{ name: string }> {}

class Greeter extends AggregateRoot {
  greet(name: string) {
    this.record(Greeted.set({ name }));
  }
}

/** The shape of every concrete handler: a guard for who may call, an execute for the use case. Roles are strings to the mechanics. */
class GreetHandler extends CommandHandler<Greet> {
  protected async guard(_: Greet, { auth }: ExecutionContext): Promise<IResult<unknown>> {
    return auth.role === 'guest' ? Result.fail(new NotAllowedException('Test', 'Guests cannot greet')) : Result.ok();
  }

  async execute({ payload }: Greet, context: ExecutionContext): Promise<IResult<string>> {
    if (payload.then === 'throw') throw new Error('boom');
    if (payload.then === 'fail') return Result.fail(new NotAllowedException('Test', 'Refused'));

    const greeter = new Greeter(new Id('greeter'));
    greeter.greet(payload.name);
    this.publishDomainEvents(greeter, context);

    return Result.ok(`Hello ${payload.name}`);
  }
}

/** Records the order of things, so the tests can see what happened before what. */
class RecordingUnitOfWork implements UnitOfWork {
  log: string[] = [];
  #active = false;

  async beginTransaction() {
    this.#active = true;
    this.log.push('begin');
  }
  async commitTransaction() {
    this.#active = false;
    this.log.push('commit');
  }
  async rollbackTransaction() {
    this.#active = false;
    this.log.push('rollback');
  }
  hasActiveTransaction() {
    return this.#active;
  }
}

describe('CommandHandler.handle()', () => {
  let unitOfWork: RecordingUnitOfWork;
  let eventBus: EventBus;
  let publish: ReturnType<typeof jest.fn>;

  beforeEach(() => {
    unitOfWork = new RecordingUnitOfWork();
    publish = jest.fn(() => {
      unitOfWork.log.push('publish');
    });
    eventBus = { connect: jest.fn(), publish, subscribe: jest.fn() } as unknown as EventBus;
  });

  // The bus hands the handler an Operation; the in-memory bus builds one for us.
  const operationFor = (payload: Greet['payload'], role = 'user') => {
    const context = new ExecutionContext({
      traceId: 'trace',
      eventBus,
      unitOfWork,
      auth: { subjectId: 'alice', role },
    });
    return new InMemoryEventBus({ eventEmitter: new EventEmitter() }).publish(Greet.set(payload), context);
  };

  it('runs the use case inside a transaction and publishes the domain events after the commit', async () => {
    const done = await new GreetHandler().handle(operationFor({ name: 'Alice' }));

    expect(done.status).toBe(OperationStatus.SUCCESS);
    expect(done.result?.data).toBe('Hello Alice');
    expect(unitOfWork.log).toEqual(['begin', 'commit', 'publish']);
    expect(publish).toHaveBeenCalledWith(Greeted.set({ name: 'Alice' }), expect.any(ExecutionContext));
  });

  it('refuses at the guard without opening a transaction or running the use case', async () => {
    const done = await new GreetHandler().handle(operationFor({ name: 'Alice' }, 'guest'));

    expect(done.status).toBe(OperationStatus.ERROR);
    expect(done.result?.error?.type).toBe('NotAllowed');
    expect(unitOfWork.log).toEqual([]);
  });

  it('rolls back a failed result and publishes nothing', async () => {
    const done = await new GreetHandler().handle(operationFor({ name: 'Alice', then: 'fail' }));

    expect(done.status).toBe(OperationStatus.ERROR);
    expect(unitOfWork.log).toEqual(['begin', 'rollback']);
    expect(publish).not.toHaveBeenCalled();
  });

  it('turns a throw into a failed operation instead of crashing, and rolls back', async () => {
    const done = await new GreetHandler().handle(operationFor({ name: 'Alice', then: 'throw' }));

    expect(done.status).toBe(OperationStatus.ERROR);
    expect(done.result?.error?.message).toBe('boom');
    expect(unitOfWork.log).toEqual(['begin', 'rollback']);
    expect(publish).not.toHaveBeenCalled();
  });
});
