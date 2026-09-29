import { expect, jest } from '@jest/globals';

import { Result, UnknownException } from '@Architecture/Domain';
import { EventBus } from '@Architecture/Application/EventBus';
import { ExecutionContext, UnitOfWork } from '@Architecture/Application/ExecutionContext';

const eventBus = { connect: jest.fn(), publish: jest.fn(), subscribe: jest.fn() } as EventBus;

class FakeUnitOfWork implements UnitOfWork {
  active = false;
  log: string[] = [];

  async beginTransaction() {
    this.active = true;
    this.log.push('begin');
  }
  async commitTransaction() {
    this.active = false;
    this.log.push('commit');
  }
  async rollbackTransaction() {
    this.active = false;
    this.log.push('rollback');
  }
  hasActiveTransaction() {
    return this.active;
  }
}

function contextWith(unitOfWork?: UnitOfWork): ExecutionContext {
  return new ExecutionContext({ traceId: 'trace', eventBus, auth: {}, unitOfWork });
}

describe('ExecutionContext.afterCommit', () => {
  it('runs the callback only once the transaction is committed', async () => {
    const unitOfWork = new FakeUnitOfWork();
    const context = contextWith(unitOfWork);

    await context.withTransaction(async () => {
      context.afterCommit(() => unitOfWork.log.push('callback'));
      unitOfWork.log.push('work');
      return Result.ok();
    });

    expect(unitOfWork.log).toEqual(['begin', 'work', 'commit', 'callback']);
  });

  it('drops the callback when the transaction fails', async () => {
    const unitOfWork = new FakeUnitOfWork();
    const context = contextWith(unitOfWork);

    await context.withTransaction(async () => {
      context.afterCommit(() => unitOfWork.log.push('callback'));
      return Result.fail(new UnknownException('nope'));
    });

    expect(unitOfWork.log).toEqual(['begin', 'rollback']);
  });

  it('drops the callback when the transaction throws', async () => {
    const unitOfWork = new FakeUnitOfWork();
    const context = contextWith(unitOfWork);

    const result = await context.withTransaction(async () => {
      context.afterCommit(() => unitOfWork.log.push('callback'));
      throw new Error('boom');
    });

    expect(result.isFailure()).toBe(true);
    expect(unitOfWork.log).toEqual(['begin', 'rollback']);
  });

  it('runs the callback at the outermost commit when transactions are nested', async () => {
    const unitOfWork = new FakeUnitOfWork();
    const context = contextWith(unitOfWork);

    await context.withTransaction(async () => {
      await context.withTransaction(async () => {
        context.afterCommit(() => unitOfWork.log.push('inner callback'));
        return Result.ok();
      });
      unitOfWork.log.push('outer work');
      return Result.ok();
    });

    expect(unitOfWork.log).toEqual(['begin', 'outer work', 'commit', 'inner callback']);
  });

  it('runs the callback immediately outside of a transaction', () => {
    const context = contextWith();
    const callback = jest.fn();

    context.afterCommit(callback);

    expect(callback).toHaveBeenCalledTimes(1);
  });

  it('still defers the callback without a unit of work, until the function succeeds', async () => {
    const context = contextWith();
    const order: string[] = [];

    await context.withTransaction(async () => {
      context.afterCommit(() => order.push('callback'));
      order.push('work');
      return Result.ok();
    });

    expect(order).toEqual(['work', 'callback']);
  });
});
