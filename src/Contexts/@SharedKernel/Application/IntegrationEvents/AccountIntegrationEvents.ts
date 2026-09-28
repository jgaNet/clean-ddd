import { IntegrationEvent } from '@SharedKernel/Domain/DDD/EventTypes';

export class AccountCreatedIntegrationEvent extends IntegrationEvent<{
  accountId: string;
  email: string;
  validationToken: string;
}> {}

export class AccountValidatedIntegrationEvent extends IntegrationEvent<{
  accountId: string;
  email: string;
}> {}
