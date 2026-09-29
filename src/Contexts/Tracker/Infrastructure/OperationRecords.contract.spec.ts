import { OperationStatus } from '@SharedKernel/Application';
import { InMemoryDataSource } from '@SharedKernel/Infrastructure/DataSources/InMemoryDataSource';

import { IOperationRecords } from '@Contexts/Tracker/Application/Ports/IOperationRecords';
import { OperationRecord } from '@Contexts/Tracker/Application/ReadModel/OperationRecord';
import { InMemoryOperationRecords } from '@Contexts/Tracker/Infrastructure/InMemoryOperationRecords';

/**
 * A contract test: the expectations belong to the port, so every adapter of IOperationRecords
 * runs the same ones (see NotePersistence.contract.spec.ts). The order and the filters a method
 * promises in its JSDoc are asserted here, once, rather than in each query handler's spec.
 * A second store is one more line in `adapters`.
 */
const adapters: { name: string; open: () => IOperationRecords }[] = [
  { name: 'in memory', open: () => new InMemoryOperationRecords(new InMemoryDataSource<OperationRecord>()) },
];

const aRecord = (
  id: string,
  subjectId: string | undefined,
  createdAt: Date,
  status = OperationStatus.SUCCESS,
): OperationRecord => ({
  id,
  name: 'GreetCommandEvent',
  status,
  traceId: `trace-${id}`,
  subjectId,
  createdAt,
});

const at = (seconds: number) => new Date(2026, 0, 1, 0, 0, seconds);

describe.each(adapters)('Operation records over $name', ({ open }) => {
  let records: IOperationRecords;
  beforeEach(() => (records = open()));

  it('gives back a saved record, and null for an unknown id', async () => {
    const record = aRecord('op-1', 'alice', at(1));
    await records.save(record);

    expect(await records.findById('op-1')).toEqual(record);
    expect(await records.findById('nobody')).toBeNull();
  });

  it('saving again replaces, it does not duplicate', async () => {
    await records.save(aRecord('op-1', 'alice', at(1), OperationStatus.PENDING));
    await records.save(aRecord('op-1', 'alice', at(1), OperationStatus.SUCCESS));

    expect(await records.findAll()).toHaveLength(1);
    expect((await records.findById('op-1'))?.status).toBe(OperationStatus.SUCCESS);
  });

  it('lists the records of a trace', async () => {
    await records.save(aRecord('op-1', 'alice', at(1)));
    await records.save(aRecord('op-2', 'alice', at(2)));

    expect((await records.findByTraceId('trace-op-2')).map(record => record.id)).toEqual(['op-2']);
  });

  it("lists a subject's records, and only theirs, most recent first", async () => {
    await records.save(aRecord('old', 'alice', at(1)));
    await records.save(aRecord('not-hers', 'bob', at(2)));
    await records.save(aRecord('anonymous', undefined, at(3)));
    await records.save(aRecord('new', 'alice', at(4)));
    await records.save(aRecord('middle', 'alice', at(2)));

    expect((await records.findBySubjectId('alice')).map(record => record.id)).toEqual(['new', 'middle', 'old']);
    expect(await records.findBySubjectId('nobody')).toEqual([]);
  });

  it('puts the last saved first among records of the same instant', async () => {
    await records.save(aRecord('first', 'alice', at(1)));
    await records.save(aRecord('second', 'alice', at(1)));

    expect((await records.findBySubjectId('alice')).map(record => record.id)).toEqual(['second', 'first']);
  });

  it("narrows a subject's records down to one status when asked", async () => {
    await records.save(aRecord('ok', 'alice', at(1), OperationStatus.SUCCESS));
    await records.save(aRecord('failed-late', 'alice', at(3), OperationStatus.ERROR));
    await records.save(aRecord('failed-early', 'alice', at(2), OperationStatus.ERROR));
    await records.save(aRecord('bobs-failure', 'bob', at(4), OperationStatus.ERROR));

    const failed = await records.findBySubjectId('alice', { status: OperationStatus.ERROR });
    expect(failed.map(record => record.id)).toEqual(['failed-late', 'failed-early']);
  });
});
