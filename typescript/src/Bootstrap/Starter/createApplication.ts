import { Logger, Outbox, relayOutbox, UnitOfWork } from '@Architecture/Application';
import { ConsoleLogger } from '@Architecture/Infrastructure/Logging/ConsoleLogger';
import { InMemoryOutbox } from '@Architecture/Infrastructure/Outbox/InMemoryOutbox';
import { InMemoryUnitOfWork } from '@Architecture/Infrastructure/UnitOfWork/InMemoryUnitOfWork';
import { PostgresDatabase } from '@Architecture/Infrastructure/Postgres/PostgresDatabase';
import { PostgresOutbox } from '@Architecture/Infrastructure/Postgres/PostgresOutbox';
import { PostgresUnitOfWork } from '@Architecture/Infrastructure/Postgres/PostgresUnitOfWork';

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
 *
 * The store is in memory until `DATABASE_URL` names a PostgreSQL database (ADR 47): then every
 * unit of work is a transaction on it, the outbox is its `outbox` table, and what a previous run
 * made durable and did not publish is published at start, once. A context's adapters write
 * through that unit of work's connection; the Tracker's stay in memory here, which is why the
 * restart suite reads the fact back through the Tracker and not from a table of its own.
 */
export async function createApplication({
  logger = new ConsoleLogger({ debug: false }),
  apiPrefix = process.env.API_PREFIX || 'v1',
  port = Number(process.env.PORT || 10000),
  webOrigins = String(process.env.WEB_ORIGINS || '')
    .split(',')
    .filter(Boolean),
  databaseUrl = process.env.DATABASE_URL,
}: {
  logger?: Logger;
  apiPrefix?: string;
  port?: number;
  webOrigins?: string[];
  databaseUrl?: string;
} = {}): Promise<FastifyApplication> {
  const store = await openStore(databaseUrl);
  const app = new FastifyApplication({ logger, apiPrefix, port, webOrigins, unitOfWork: store.unitOfWork })
    .setEventBus(trackedEventBus)
    .registerModule(localTrackerModule)
    .registerRoutes('/tracker/operations', operationRoutes, { operationsModule: localTrackerModule })
    .onStop(store.close);

  await app.startModules();
  // What a previous run made durable and did not publish goes out now (ADR 24): nothing, with an
  // in-memory outbox; with a database, what a crash between the commit and the relay left
  // pending. The context is one a request would get, with a unit of work of its own, so that each
  // reaction it delivers runs in a transaction of its own and publishes through the outbox, as
  // after a request.
  await relayOutbox(store.outbox, app.getEventBus(), app.executionContext('startup'));
  return app;
}

/** The store the application runs on: a database when a URL names one, the process's memory otherwise. */
async function openStore(
  databaseUrl?: string,
): Promise<{ unitOfWork(): UnitOfWork; outbox: Outbox; close(): Promise<void> }> {
  if (!databaseUrl) {
    return { unitOfWork: () => new InMemoryUnitOfWork(), outbox: InMemoryOutbox.shared, close: async () => {} };
  }
  const database = new PostgresDatabase(databaseUrl);
  await database.ensureSchema();
  return {
    unitOfWork: () => new PostgresUnitOfWork(database),
    outbox: new PostgresOutbox(database),
    close: () => database.close(),
  };
}
