import { Role } from '@SharedKernel/Domain';
import { ExecutionContext } from '@Architecture/Application';

export interface AuthInfo {
  subjectId: string;
  role: Role;
}

/** What the two request hooks of FastifyApplication.ts attach to every Fastify request. */
declare module 'fastify' {
  interface FastifyRequest {
    /** Who is calling: anonymous (a guest) unless the authentication given to the transport says otherwise. */
    auth: AuthInfo;
    /** Set by the preHandler hook: the request's trace, caller, bus, unit of work and logger. */
    executionContext: ExecutionContext;
  }
}
