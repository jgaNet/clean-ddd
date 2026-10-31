import { Logger, relayOutbox } from '@Architecture/Application';
import { ConsoleLogger } from '@Architecture/Infrastructure/Logging/ConsoleLogger';
import { InMemoryOutbox } from '@Architecture/Infrastructure/Outbox/InMemoryOutbox';

import { localTrackerModule, trackedEventBus } from '@Contexts/Tracker/module.local';
import { operationRoutes } from '@Contexts/Tracker/Presentation/API/REST/Routes';

import { FastifyApplication } from '@Bootstrap/Fastify/FastifyApplication';

/**
 * The composition root an application starts from (ADR 27): `clean-ddd create` gives it as
 * `src/Bootstrap/Fastify/createApplication.ts`, in place of this repository's, which knows four
 * contexts. It knows one, the Tracker, because a command is answered `202 { operationId }` and
 * the Tracker is what a client follows that operation at, up to its outcome and its result
 * (`GET /v1/tracker/operations/:id`). Nobody signs in here: every caller is anonymous until a
 * context that owns accounts gives the transport its `authenticate`.
 *
 * A new context is added here, as the Tracker is: its module after the Tracker's, its routes
 * under its own prefix.
 */
export async function createApplication({
  logger = new ConsoleLogger({ debug: false }),
  apiPrefix = process.env.API_PREFIX || 'v1',
  port = Number(process.env.PORT || 10000),
  webOrigins = String(process.env.WEB_ORIGINS || '')
    .split(',')
    .filter(Boolean),
}: { logger?: Logger; apiPrefix?: string; port?: number; webOrigins?: string[] } = {}): Promise<FastifyApplication> {
  const app = new FastifyApplication({ logger, apiPrefix, port, webOrigins })
    .setEventBus(trackedEventBus)
    .registerModule(localTrackerModule)
    .registerRoutes('/tracker/operations', operationRoutes, { operationsModule: localTrackerModule });

  await app.startModules();
  // What a previous run made durable and did not publish goes out now (ADR 24): nothing, with
  // an in-memory outbox, and the line is where a store's outbox would be relayed. The context is
  // one a request would get, with a unit of work of its own, so that each reaction it delivers
  // runs in a transaction of its own and publishes through the outbox, as after a request.
  relayOutbox(InMemoryOutbox.shared, app.getEventBus(), app.executionContext('startup'));
  return app;
}
