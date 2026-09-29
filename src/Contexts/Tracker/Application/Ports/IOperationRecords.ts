import { OperationStatus } from '@SharedKernel/Application';

import { OperationRecord } from '@Contexts/Tracker/Application/ReadModel/OperationRecord';

/** What a caller may narrow their own operations down to. */
export interface OperationFilters {
  status?: OperationStatus;
}

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
  /**
   * Every record made under that account's authority: its commands and the events they set
   * off. Most recent first (`createdAt` descending; among equals, the last saved first).
   * Ordering and filtering are part of this contract: the contract spec asserts them for
   * every adapter. An unknown subject gets an empty list.
   */
  findBySubjectId(subjectId: string, filters?: OperationFilters): Promise<OperationRecord[]>;
}
