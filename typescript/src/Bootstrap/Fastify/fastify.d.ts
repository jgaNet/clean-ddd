import { Role } from '@SharedKernel/Domain';
import { ExecutionContext } from '@Architecture/Application';

export interface AuthInfo {
  subjectId: string;
  role: Role;
}

/** What the two request hooks of createApplication.ts attach to every Fastify request. */
declare module 'fastify' {
  interface FastifyRequest {
    /** Set by the authentication middleware from the bearer token or cookie; absent when anonymous. */
    auth: AuthInfo;
    /** Set by the preHandler hook: the request's trace, caller, bus, unit of work and logger. */
    executionContext: ExecutionContext;
  }
}
