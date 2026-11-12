import { EventEmitter } from 'events';

import { Logger, relayOutbox } from '@Architecture/Application';
import { InMemoryEventBus } from '@Architecture/Infrastructure/EventBus/InMemoryEventBus';
import { systemClock } from '@Architecture/Infrastructure/Clock/SystemClock';
import { ConsoleLogger } from '@Architecture/Infrastructure/Logging/ConsoleLogger';
import { InMemoryOutbox } from '@Architecture/Infrastructure/Outbox/InMemoryOutbox';

import { FastifyApplication } from '@Bootstrap/Fastify/FastifyApplication';

/**
 * The composition root an application created Lite starts from (ADR 40): `clean-ddd create --profile
 * lite` gives it as `src/Bootstrap/Fastify/createApplication.ts`. It knows no context, not even the
 * Tracker: a Lite command is answered at once by its use case, so there is no operation to follow.
 * What it sets up is what every context will share — the transport, which gives each request its trace,
 * its caller and its unit of work, and the bus that carries what the contexts tell each other, relayed
 * from the outbox after each commit. Nobody signs in here: every caller is anonymous until a context
 * that owns accounts gives the transport its `authenticate`.
 *
 * A context is added here: its `LiteModule` registered, its routes under its own prefix, the module in
 * the routes' options —
 *
 *   .registerModule(localTasksModule)
 *   .registerRoutes('/tasks', taskRoutes, { module: localTasksModule });
 */
export async function createApplication({
  logger = new ConsoleLogger({ debug: false }),
  apiPrefix = process.env.API_PREFIX || 'v1',
  port = Number(process.env.PORT || 10000),
  webOrigins = String(process.env.WEB_ORIGINS || '')
    .split(',')
    .filter(Boolean),
}: { logger?: Logger; apiPrefix?: string; port?: number; webOrigins?: string[] } = {}): Promise<FastifyApplication> {
  const app = new FastifyApplication({ logger, apiPrefix, port, webOrigins }).setEventBus(
    new InMemoryEventBus({ eventEmitter: new EventEmitter(), clock: systemClock }),
  );

  await app.startModules();
  // What a previous run made durable and did not publish goes out now (ADR 24): nothing, with an
  // in-memory outbox, and the line is where a store's outbox would be relayed.
  await relayOutbox(InMemoryOutbox.shared, app.getEventBus(), app.executionContext('startup'));
  return app;
}
