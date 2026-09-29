import { OperationStatus } from '@Architecture/Application/Operation';
import { IntegrationEvent } from '@Architecture/Domain/EventTypes';

export interface OperationCompletePayload {
  operationId: string;
  userId: string;
  status: OperationStatus;
  type: string;
  result?: unknown;
  error?: string;
}

/** Published by the Tracker's bus decorator when a command of an authenticated caller reaches its outcome. */
export class OperationCompleteIntegrationEvent extends IntegrationEvent<OperationCompletePayload> {}
