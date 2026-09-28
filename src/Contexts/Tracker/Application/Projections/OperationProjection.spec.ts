import { expect, jest } from '@jest/globals';

import { CommandEvent, NotFoundException, Result, Role } from '@SharedKernel/Domain';
import { EventBus, ExecutionContext, IOperation, OperationStatus } from '@SharedKernel/Application';

import { toOperationRecord } from '@Contexts/Tracker/Application/Projections/OperationProjection';

class DoSomething extends CommandEvent<{ what: string }> {}

const eventBus = { connect: jest.fn(), publish: jest.fn(), subscribe: jest.fn() } as EventBus;

function anOperation(subjectId?: string): IOperation<DoSomething> {
  const operation: IOperation<DoSomething> = {
    id: 'op-1',
    status: OperationStatus.PENDING,
    event: DoSomething.set({ what: 'this' }),
    context: new ExecutionContext({ traceId: 'trace-1', eventBus, auth: { subjectId, role: Role.USER } }),
    createdAt: new Date('2026-01-01T10:00:00Z'),
    failed: error => Object.assign(operation, { status: OperationStatus.ERROR, result: Result.fail(error) }),
    success: value => Object.assign(operation, { status: OperationStatus.SUCCESS, result: Result.ok(value) }),
    sent: () => Object.assign(operation, { status: OperationStatus.SENT }),
  };
  return operation;
}

describe('toOperationRecord', () => {
  it('keeps what a client needs and drops the execution context', () => {
    const record = toOperationRecord(anOperation('alice'));

    expect(record).toEqual({
      id: 'op-1',
      name: 'DoSomething',
      status: OperationStatus.PENDING,
      traceId: 'trace-1',
      subjectId: 'alice',
      payload: { what: 'this' },
      result: undefined,
      error: undefined,
      createdAt: new Date('2026-01-01T10:00:00Z'),
      finishedAt: undefined,
    });
    expect(record).not.toHaveProperty('context');
  });

  it('flattens a success into result', () => {
    const record = toOperationRecord(anOperation('alice').success('note-42'));

    expect(record.status).toBe(OperationStatus.SUCCESS);
    expect(record.result).toBe('note-42');
    expect(record.error).toBeUndefined();
  });

  it('flattens a failure into error, in words a client can show', () => {
    const record = toOperationRecord(anOperation('alice').failed(new NotFoundException('Notes', 'Note not found')));

    expect(record.status).toBe(OperationStatus.ERROR);
    expect(record.result).toBeUndefined();
    expect(record.error).toEqual({ type: 'NotFound', message: 'Note not found' });
  });

  it('leaves subjectId out for an anonymous caller', () => {
    expect(toOperationRecord(anOperation()).subjectId).toBeUndefined();
  });
});
