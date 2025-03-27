import { OperationStatus } from '@Contexts/@SharedKernel/Domain';
import { Event } from '@SharedKernel/Domain/DDD/Event';

export interface OperationCompletePayload {
  operationId: string;
  userId: string;
  status: OperationStatus;
  type: string;
  result?: unknown;
  error?: string;
}

export class OperationCompleteIntegrationEvent extends Event<OperationCompletePayload> {}
