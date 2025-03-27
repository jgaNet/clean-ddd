import { Event } from '@SharedKernel/Domain/DDD/Event';

export interface OperationCompletePayload {
  operationId: string;
  userId: string;
  success: boolean;
  type: string;
  result?: unknown;
  error?: string;
}

export class OperationCompleteIntegrationEvent extends Event<OperationCompletePayload> {}