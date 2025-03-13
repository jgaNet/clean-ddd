import { AuthenticationMiddleware } from '../Presentation/API/REST/Middlewares/FastifyJWTAuthenticationMiddleware';
import { LoginCommandEvent, LoginCommandHandler } from './Commands';
import { AccountValidatedEvent } from '../Domain/Account/Events/AccountValidatedEvent';
import { AccountCreatedEvent } from '../Domain/Account/Events/AccountCreatedEvent';
import { IJwtService } from '../Domain/Auth/Ports/IJwtService';
import { AccountCreatedHandler } from './Events/AccountCreatedHandler';
import { AccountValidatedHandler } from './Events/AccountValidatedHandler';

export type SecurityModuleCommands = [{ event: typeof LoginCommandEvent; handlers: [LoginCommandHandler] }];
export type SecurityModuleQueries = [];
export type SecurityModuleDomainEvents = [
  {
    event: typeof AccountCreatedEvent;
    handlers: [AccountCreatedHandler];
  },
  {
    event: typeof AccountValidatedEvent;
    handlers: [AccountValidatedHandler];
  },
];
export type SecurityModuleIntegrationEvents = [];
export type SecurityModuleServices = {
  authMiddleware: AuthenticationMiddleware;
  jwtService: IJwtService;
  admin: {
    register: (payload: { identifier: string; password: string }) => Promise<string>;
  };
};
