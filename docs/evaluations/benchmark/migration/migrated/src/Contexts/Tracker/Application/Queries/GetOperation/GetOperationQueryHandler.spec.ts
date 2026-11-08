import { expect, jest } from '@jest/globals';

import { NotAllowedException, NotFoundException } from '@Architecture/Domain';
import { EventBus, ExecutionContext, OperationStatus } from '@Architecture/Application';
import { InMemoryDataSource } from '@Architecture/Infrastructure/DataSources/InMemoryDataSource';
import { Role } from '@SharedKernel/Domain';

import { GetOperationQueryHandler } from '@Contexts/Tracker/Application/Queries/GetOperation/GetOperationQueryHandler';
import { OperationRecord } from '@Contexts/Tracker/Application/ReadModel/OperationRecord';
import { InMemoryOperationRecords } from '@Contexts/Tracker/Infrastructure/InMemoryOperationRecords';

const eventBus = { connect: jest.fn(), publish: jest.fn(), subscribe: jest.fn() } as EventBus;
const as = (role: Role, subjectId = '') =>
  new ExecutionContext({ traceId: 'trace', eventBus, auth: { subjectId, role } });
const anonymous = as(Role.GUEST);

const record = (id: string, subjectId?: string): OperationRecord => ({
  id,
  name: 'DoSomething',
  status: OperationStatus.SUCCESS,
  traceId: 'trace',
  subjectId,
  createdAt: new Date('2026-01-01T10:00:00Z'),
});

const records = new InMemoryOperationRecords(new InMemoryDataSource<OperationRecord>());
const handler = new GetOperationQueryHandler(records);
beforeAll(async () => {
  await records.save(record('nobody', ''));
  await records.save(record('alice', 'alice'));
});

describe('GetOperation', () => {
  it('shows an operation nobody started to whoever holds its id, signed in or not', async () => {
    for (const context of [anonymous, as(Role.USER, 'bob')]) {
      expect((await handler.execute({ id: 'nobody' }, context)).data).toMatchObject({ id: 'nobody' });
    }
  });

  it('shows an operation an account started to that account and to an administrator', async () => {
    for (const context of [as(Role.USER, 'alice'), as(Role.ADMIN, 'root')]) {
      expect((await handler.execute({ id: 'alice' }, context)).data).toMatchObject({ id: 'alice' });
    }
  });

  it('asks an anonymous caller to sign in for anything else, known or not', async () => {
    for (const id of ['alice', 'unknown']) {
      expect((await handler.execute({ id }, anonymous)).error).toBeInstanceOf(NotAllowedException);
    }
  });

  it('tells another account that an operation it did not start does not exist', async () => {
    for (const id of ['alice', 'unknown']) {
      expect((await handler.execute({ id }, as(Role.USER, 'bob'))).error).toBeInstanceOf(NotFoundException);
    }
  });
});
