import { EventEmitter } from 'events';

import { NotAllowedException, Role } from '@SharedKernel/Domain';
import { ExecutionContext, OperationStatus } from '@SharedKernel/Application';
import { InMemoryDataSource } from '@SharedKernel/Infrastructure/DataSources/InMemoryDataSource';
import { InMemoryEventBus } from '@SharedKernel/Infrastructure/EventBus/InMemoryEventBus';

import { OperationRecord } from '@Contexts/Tracker/Application/ReadModel/OperationRecord';
import { GetMyOperationsQueryHandler } from '@Contexts/Tracker/Application/Queries/GetMyOperations/GetMyOperationsQueryHandler';
import { InMemoryOperationRecords } from '@Contexts/Tracker/Infrastructure/InMemoryOperationRecords';

const eventBus = new InMemoryEventBus({ eventEmitter: new EventEmitter() });
const contextFor = (subjectId?: string, role?: Role) =>
  new ExecutionContext({ traceId: 'trace', eventBus, auth: { subjectId, role } });

const aRecord = (id: string, subjectId: string, status: OperationStatus, seconds: number): OperationRecord => ({
  id,
  name: 'ShareNoteCommandEvent',
  status,
  traceId: `trace-${id}`,
  subjectId,
  createdAt: new Date(2026, 0, 1, 0, 0, seconds),
});

let store: InMemoryDataSource<OperationRecord>;
let handler: GetMyOperationsQueryHandler;

beforeEach(() => {
  store = new InMemoryDataSource<OperationRecord>();
  handler = new GetMyOperationsQueryHandler(new InMemoryOperationRecords(store));
  for (const record of [
    aRecord('alice-ok', 'alice', OperationStatus.SUCCESS, 1),
    aRecord('bob-failed', 'bob', OperationStatus.ERROR, 2),
    aRecord('alice-failed', 'alice', OperationStatus.ERROR, 3),
  ]) {
    store.collection.set(record.id, record);
  }
});

const idsListedFor = async (subjectId: string, role: Role, status?: OperationStatus) => {
  const result = await handler.handle({ status }, contextFor(subjectId, role));
  if (result.isFailure()) throw result.error;
  return result.data.map(record => record.id);
};

describe('GetMyOperationsQueryHandler', () => {
  it("lists the caller's own operations, most recent first, and nobody else's", async () => {
    expect(await idsListedFor('alice', Role.USER)).toEqual(['alice-failed', 'alice-ok']);
  });

  it('narrows them down to the failed ones when asked', async () => {
    expect(await idsListedFor('alice', Role.USER, OperationStatus.ERROR)).toEqual(['alice-failed']);
  });

  it("gives an administrator their own list too, not everyone's", async () => {
    expect(await idsListedFor('bob', Role.ADMIN)).toEqual(['bob-failed']);
  });

  it('refuses an anonymous caller', async () => {
    const result = await handler.handle({}, contextFor(undefined, undefined));

    expect(result.isFailure()).toBe(true);
    expect(result.error).toBeInstanceOf(NotAllowedException);
  });
});
