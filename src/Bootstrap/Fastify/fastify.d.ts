import { ExecutionContext, Role } from '@SharedKernel/Domain';
import { FastifyRequest } from 'fastify';

export interface AuthInfo {
  subjectId: string;
  role: Role;
}


declare module 'fastify' {
  interface FastifyRequest {
    /**
     * Execution context for the current request
     * Contains event bus, unit of work, logger, and other cross-cutting concerns
     */
    executionContext: ExecutionContext;
    auth: AuthInfo;
  }
}
