import { ExecutionContext } from '@Primitives/ExecutionContext';
import { FastifyRequest } from 'fastify';

declare module 'fastify' {
  interface FastifyRequest {
    /**
     * Execution context for the current request
     * Contains event bus, unit of work, logger, and other cross-cutting concerns
     */
    executionContext: ExecutionContext;
  }
}