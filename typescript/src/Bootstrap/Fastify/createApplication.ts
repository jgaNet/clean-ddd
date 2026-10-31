import fastifySwagger from '@fastify/swagger';
import fastifySwaggerUi from '@fastify/swagger-ui';
import fastifyCookie from '@fastify/cookie';

import { SETTINGS } from './application.settings';
import { swaggerDescriptor } from './application.swagger';
import { FastifyApplication } from './FastifyApplication';

import { localTrackerModule, trackedEventBus } from '@Contexts/Tracker/module.local';
import { localNotesModule } from '@Contexts/Notes/module.local';
import { localSecurityModule, authMiddleware, registerAdmin } from '@Contexts/Security/module.local';
import { localNotificationsModule, webSocketChannel } from '@Contexts/Notifications/module.local';

import { homeRoutes } from '@Bootstrap/Fastify/Home/home.routes';
import { noteRoutes } from '@Contexts/Notes/Presentation/API/REST/Routes';
import { operationRoutes } from '@Contexts/Tracker/Presentation/API/REST/Routes';
import { authRoutes } from '@Contexts/Security/Presentation/API/REST/Routes/auth.routes';
import { notificationRoutes } from '@Contexts/Notifications/Presentation/API/REST/Routes';

import { Logger, relayOutbox } from '@Architecture/Application';
import { ConsoleLogger } from '@Architecture/Infrastructure/Logging/ConsoleLogger';
import { InMemoryOutbox } from '@Architecture/Infrastructure/Outbox/InMemoryOutbox';

/**
 * The composition root: the one place that knows every context, every route and the
 * transport. Nothing here is business; it is wiring. The transport itself, which knows no
 * context, is FastifyApplication; what this application adds to it is its own: the cookie a
 * login sets, the documentation, the notification channel, and the administrator it is seeded with.
 */
export class ReferenceApplication extends FastifyApplication {
  /** The administrator account the settings describe, created before the first request. */
  async seed(): Promise<this> {
    if (SETTINGS.security.adminAccount) {
      await registerAdmin({
        email: SETTINGS.security.adminAccount.identifier,
        password: SETTINGS.security.adminAccount.password,
        eventBus: this.getEventBus(),
      });
    }
    return this;
  }

  setupSwagger(): this {
    this.fastify.register(fastifySwagger, swaggerDescriptor);
    if (SETTINGS.swaggerUi.active) {
      this.fastify.register(fastifySwaggerUi, SETTINGS.swaggerUi);
    }
    return this;
  }

  async start(port: number = this.port): Promise<void> {
    await webSocketChannel.initialize(this.fastify);
    await super.start(port);
    this.fastify.swagger();
  }
}

/**
 * Builds the whole application: wired, its modules listening on the bus, seeded; not yet
 * serving. The modules start before the seed so that the seed's events reach their handlers.
 */
export async function createApplication({
  logger = new ConsoleLogger({ debug: SETTINGS.logger.debug }),
  webOrigins = SETTINGS.webOrigins,
}: { logger?: Logger; webOrigins?: string[] } = {}): Promise<ReferenceApplication> {
  const app = new ReferenceApplication({
    logger,
    apiPrefix: SETTINGS.apiPrefix,
    port: SETTINGS.port,
    webOrigins,
    authenticate: authMiddleware.authenticate(),
  });
  // A login answers with a cookie as well as a token, for the pages served from here.
  app.fastify.register(fastifyCookie);
  app
    .setEventBus(trackedEventBus)
    .registerModule(localTrackerModule)
    .registerModule(localNotesModule)
    .registerModule(localSecurityModule)
    .registerModule(localNotificationsModule)
    .setupSwagger()
    .registerRoutes('/', homeRoutes, { settings: SETTINGS })
    .registerRoutes('/tracker/operations', operationRoutes, { operationsModule: localTrackerModule })
    .registerRoutes('/notes', noteRoutes, { notesModule: localNotesModule })
    .registerRoutes('/', authRoutes, { securityModule: localSecurityModule })
    .registerRoutes('/notifications', notificationRoutes, { notificationsModule: localNotificationsModule });

  await app.startModules();
  // What a previous run made durable and did not publish goes out now (ADR 24): nothing, with
  // an in-memory outbox, and the line is where a store's outbox would be relayed. The context is
  // one a request would get, with a unit of work of its own, so that each reaction it delivers
  // runs in a transaction of its own and publishes through the outbox, as after a request.
  relayOutbox(InMemoryOutbox.shared, app.getEventBus(), app.executionContext('startup'));
  return app.seed();
}
