import { expect, jest } from '@jest/globals';

import { AggregateRoot, DomainEvent, NotAllowedException, Result, Role } from '@SharedKernel/Domain';
import { Id } from '@SharedKernel/Domain/ValueObjects';
import { EventBus, ExecutionContext, UnitOfWork } from '@SharedKernel/Application';
import { publishDomainEvents } from '@SharedKernel/Application/DomainEvents';

class Greeted extends DomainEvent<{ name: string }> {}
class Greeter extends AggregateRoot {
  greet(name: string) {
    this.record(Greeted.set({ name }));
  }
}

const unitOfWork: UnitOfWork = {
  beginTransaction: async () => undefined,
  commitTransaction: async () => undefined,
  rollbackTransaction: async () => undefined,
  hasActiveTransaction: () => false,
};
const eventBus = { connect: jest.fn(), publish: jest.fn(), subscribe: jest.fn() } as EventBus;
const context = () =>
  new ExecutionContext({ traceId: 'trace', eventBus, unitOfWork, auth: { subjectId: 'alice', role: Role.USER } });

beforeEach(() => jest.resetAllMocks());

describe('publishDomainEvents', () => {
  it('publishes, after the commit, everything the aggregate recorded during the transaction', async () => {
    const greeter = new Greeter(new Id('g'));
    const ctx = context();

    await ctx.withTransaction(async () => {
      greeter.greet('alice');
      publishDomainEvents(greeter, ctx);
      greeter.greet('bob'); // recorded after the call, still inside the transaction
      expect(eventBus.publish).not.toHaveBeenCalled();
      return Result.ok();
    });

    expect(jest.mocked(eventBus.publish).mock.calls.map(([event]) => event.payload)).toEqual([
      { name: 'alice' },
      { name: 'bob' },
    ]);
    expect(greeter.pullDomainEvents()).toEqual([]);
  });

  it('leaves the events on the aggregate, unpublished, when the transaction rolls back', async () => {
    const greeter = new Greeter(new Id('g'));
    const ctx = context();

    await ctx.withTransaction(async () => {
      greeter.greet('alice');
      publishDomainEvents(greeter, ctx);
      return Result.fail(new NotAllowedException('Test', 'refused'));
    });

    expect(eventBus.publish).not.toHaveBeenCalled();
    expect(greeter.pullDomainEvents()).toHaveLength(1);
  });
});
