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

  /**
   * A route's schema may say which group of the API it belongs to (`tags: ['notes']`), as every
   * canonical route does. The documentation (`@fastify/swagger`) declares the same field when it
   * is served; an application created from this reference has no documentation yet, and the
   * routes it copies must compile there all the same (the first migration by hand found them
   * refused). The type is the documentation's, so the two declarations merge.
   */
  interface FastifySchema {
    tags?: readonly string[];
  }
}
