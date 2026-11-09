import { Logger, relayOutbox } from '@Architecture/Application';
import { ConsoleLogger } from '@Architecture/Infrastructure/Logging/ConsoleLogger';
import { InMemoryOutbox } from '@Architecture/Infrastructure/Outbox/InMemoryOutbox';

import { localTrackerModule, trackedEventBus } from '@Contexts/Tracker/module.local';
import { operationRoutes } from '@Contexts/Tracker/Presentation/API/REST/Routes';
import { localLinksModule } from '@Contexts/Links/module.local';
import { linkRoutes } from '@Contexts/Links/Presentation/API/REST/Routes';

import { FastifyApplication } from '@Bootstrap/Fastify/FastifyApplication';
import { legacyRoutes } from '@Bootstrap/Compat/legacy.routes';

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
 *
 * linkbox was migrated from a legacy whose clients speak `/v1` (ADR 36): the contract's grammar
 * is served under `v2`, and the legacy's wire under `v1` by the compatibility routes, for as long
 * as `legacyWire` is given. Removing the façade is removing that option and the Compat folder.
 */
export async function createApplication({
  logger = new ConsoleLogger({ debug: false }),
  apiPrefix = process.env.API_PREFIX || 'v2',
  port = Number(process.env.PORT || 10000),
  webOrigins = String(process.env.WEB_ORIGINS || '')
    .split(',')
    .filter(Boolean),
  legacyWire = { prefix: process.env.LEGACY_API_PREFIX || 'v1' } as { prefix: string; timeoutMs?: number } | undefined,
}: {
  logger?: Logger;
  apiPrefix?: string;
  port?: number;
  webOrigins?: string[];
  /**
   * The prefix the legacy's clients speak, served by the compatibility routes, and how long a route waits for a
   * command's outcome before it answers the contract's `202`; `undefined` serves the native wire alone.
   */
  legacyWire?: { prefix: string; timeoutMs?: number };
} = {}): Promise<FastifyApplication> {
  const app = new FastifyApplication({ logger, apiPrefix, port, webOrigins })
    .setEventBus(trackedEventBus)
    .registerModule(localTrackerModule)
    .registerRoutes('/tracker/operations', operationRoutes, { operationsModule: localTrackerModule })
    .registerModule(localLinksModule)
    .registerRoutes('/links', linkRoutes, { linksModule: localLinksModule });
  if (legacyWire) {
    app.fastify.register(legacyRoutes, {
      prefix: `/${legacyWire.prefix}`,
      linksModule: localLinksModule,
      timeoutMs: legacyWire.timeoutMs,
    });
  }

  await app.startModules();
  // What a previous run made durable and did not publish goes out now (ADR 24): nothing, with
  // an in-memory outbox, and the line is where a store's outbox would be relayed. The context is
  // one a request would get, with a unit of work of its own, so that each reaction it delivers
  // runs in a transaction of its own and publishes through the outbox, as after a request.
  await relayOutbox(InMemoryOutbox.shared, app.getEventBus(), app.executionContext('startup'));
  return app;
}
