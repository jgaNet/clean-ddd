import { InMemoryDataSource } from '@SharedKernel/Infrastructure/DataSources/InMemoryDataSource';

import { IOperationRecords } from '@Contexts/Tracker/Application/Ports/IOperationRecords';
import { OperationRecord } from '@Contexts/Tracker/Application/ReadModel/OperationRecord';

export class InMemoryOperationRecords implements IOperationRecords {
  constructor(private dataSource: InMemoryDataSource<OperationRecord>) {}

  async save(record: OperationRecord): Promise<void> {
    this.dataSource.collection.set(record.id, record);
  }

  async findById(id: string): Promise<OperationRecord | null> {
    return this.dataSource.collection.get(id) ?? null;
  }

  async findAll(): Promise<OperationRecord[]> {
    return [...this.dataSource.collection.values()];
  }

  async findByTraceId(traceId: string): Promise<OperationRecord[]> {
    return [...this.dataSource.collection.values()].filter(record => record.traceId === traceId);
  }
}
