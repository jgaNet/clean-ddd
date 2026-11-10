import Fastify from 'fastify';
import { expect } from '@jest/globals';

import { CommandEvent, Result } from '@Architecture/Domain';
import { EventBus, ExecutionContext, IOperation, Module, OperationStatus } from '@Architecture/Application';

import { legacyRoutes } from '@Bootstrap/Compat/legacy.routes';

/**
 * The one path the scenario cannot reach in-process: a command whose outcome is not known by the
 * deadline. The façade then answers the contract's grammar — `202 { operationId }` — and nothing
 * else; the client follows the operation at the Tracker like any other (ADR 36). A bus that never
 * settles stands for a slow store.
 */
class NeverSettlingBus implements EventBus {
  published: IOperation<CommandEvent<unknown>>[] = [];
  async connect() {}
  publish<T>(event: CommandEvent<T>, context: ExecutionContext): IOperation<CommandEvent<T>> {
    const operation: IOperation<CommandEvent<T>> = {
      id: 'operation-1',
      status: OperationStatus.PENDING,
      event,
      context,
      createdAt: new Date(),
      failed: () => operation,
      success: () => operation,
      sent: () => operation,
      delivered: new Promise<boolean>(() => {}),
    };
    this.published.push(operation as IOperation<CommandEvent<unknown>>);
    return operation;
  }
  async subscribe() {}
}

describe('the compatibility wire, past the deadline', () => {
  const bus = new NeverSettlingBus();
  const fastify = Fastify();
  const linksModule = new Module({ name: 'Links' });

  beforeAll(async () => {
    fastify.addHook('preHandler', (request, _reply, done) => {
      request.executionContext = new ExecutionContext({ traceId: 'trace', eventBus: bus, auth: {} });
      done();
    });
    await fastify.register(legacyRoutes, { prefix: '/v1', linksModule, timeoutMs: 20 });
    await fastify.ready();
  });
  afterAll(() => fastify.close());

  it("answers 202 with the operation id, the contract's grammar, when the command has not settled in time", async () => {
    const response = await fastify.inject({
      method: 'POST',
      url: '/v1/links',
      payload: { url: 'https://example.org/slow', title: 'Slow' },
    });

    expect(response.statusCode).toBe(202);
    expect(response.json()).toEqual({ operationId: 'operation-1' });
    expect(bus.published.map(operation => operation.event.payload)).toEqual([
      { url: 'https://example.org/slow', title: 'Slow' },
    ]);
    // Nothing was decided for the client: the operation is whatever the handler makes of it later.
    expect(bus.published[0].status).toBe(OperationStatus.PENDING);
    expect(Result.ok().isSuccess()).toBe(true);
  });

  it('answers the archive the same way', async () => {
    const response = await fastify.inject({ method: 'POST', url: '/v1/links/some-id/archive' });

    expect(response.statusCode).toBe(202);
    expect(response.json()).toEqual({ operationId: 'operation-1' });
  });
});
