import { OperationRecord } from '@Contexts/Tracker/Application/ReadModel/OperationRecord';

/**
 * The store of the projection. Unlike an aggregate repository it is written by the
 * projection and read by the queries through the same interface: a read model has no
 * invariants to protect, so there is nothing to gain from splitting it.
 */
export interface IOperationRecords {
  save(record: OperationRecord): Promise<void>;
  findById(id: string): Promise<OperationRecord | null>;
  findAll(): Promise<OperationRecord[]>;
  findByTraceId(traceId: string): Promise<OperationRecord[]>;
}
