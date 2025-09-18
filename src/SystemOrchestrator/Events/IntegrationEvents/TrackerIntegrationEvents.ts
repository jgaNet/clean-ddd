import { OperationStatus } from '@Core/Domain/Services';
import { Event } from '@Core/Domain/Event';

export interface OperationCompletePayload {
  operationId: string;
  userId: string;
  status: OperationStatus;
  type: string;
  result?: unknown;
  error?: string;
}

export class OperationCompleteIntegrationEvent extends Event<OperationCompletePayload> {}
