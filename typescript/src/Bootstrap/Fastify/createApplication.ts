import { v4 as uuidv4 } from 'uuid';
import { AddressInfo } from 'net';

import Fastify, { FastifyError, FastifyInstance, FastifyPluginCallback, FastifyPluginOptions } from 'fastify';
import fastifySwagger from '@fastify/swagger';
import fastifySwaggerUi from '@fastify/swagger-ui';
import fastifyCors from '@fastify/cors';
import fastifyCookie from '@fastify/cookie';

import { SETTINGS } from './application.settings';
import { swaggerDescriptor } from './application.swagger';

import { localTrackerModule, trackedEventBus } from '@Contexts/Tracker/module.local';
import { localNotesModule } from '@Contexts/Notes/module.local';
import { localSecurityModule, authMiddleware, registerAdmin } from '@Contexts/Security/module.local';
import { localNotificationsModule, webSocketChannel } from '@Contexts/Notifications/module.local';

import { homeRoutes } from '@Bootstrap/Fastify/Home/home.routes';
import { noteRoutes } from '@Contexts/Notes/Presentation/API/REST/Routes';
import { operationRoutes } from '@Contexts/Tracker/Presentation/API/REST/Routes';
import { authRoutes } from '@Contexts/Security/Presentation/API/REST/Routes/auth.routes';
import { notificationRoutes } from '@Contexts/Notifications/Presentation/API/REST/Routes';

import { Application, ExecutionContext, Logger, relayOutbox } from '@Architecture/Application';
import { formatOf } from '@Architecture/Presentation/Format';
import { ConsoleLogger } from '@Architecture/Infrastructure/Logging/ConsoleLogger';
import { InMemoryUnitOfWork } from '@Architecture/Infrastructure/UnitOfWork/InMemoryUnitOfWork';
import { InMemoryOutbox } from '@Architecture/Infrastructure/Outbox/InMemoryOutbox';

/**
 * The composition root: the one place that knows every context, every route and the
 * transport. Nothing here is business; it is wiring, plus the two Fastify hooks that give
 * each request its identity (authentication) and its ExecutionContext.
 */
export class FastifyApplication extends Application {
  readonly fastify: FastifyInstance;
  readonly logger: Logger;

  constructor(logger: Logger, webOrigins: string[]) {
    super();
    this.logger = logger;
    this.fastify = Fastify({ logger: false });

    this.fastify.addHook('onRequest', authMiddleware.authenticate());

    // One execution context per request: its trace, its caller, and its own unit of work.
    // A unit of work is a request-scoped thing; sharing one instance across requests would
    // make concurrent commands join each other's transaction.
    this.fastify.addHook('preHandler', (request, reply, done) => {
      const traceId = (request.headers['x-trace-id'] as string) || uuidv4();

      request.executionContext = new ExecutionContext({
        traceId,
        auth: { subjectId: request.auth?.subjectId, role: request.auth?.role },
        eventBus: this.getEventBus(),
        unitOfWork: new InMemoryUnitOfWork(),
        logger: this.logger,
      });

      reply.header('x-trace-id', traceId);
      done();
    });

    // An HTMX answer is an HTML fragment; Fastify would label a string text/plain.
    this.fastify.addHook('onSend', async (request, reply, payload) => {
      const contentType = String(reply.getHeader('content-type') ?? '');
      if (formatOf(request) === 'htmx' && typeof payload === 'string' && contentType.startsWith('text/plain')) {
        reply.type('text/html; charset=utf-8');
      }
      return payload;
    });
    this.fastify.register(fastifyCookie);
    // The front end is a client like any other, served from wherever (`web/`): a page on another
    // origin calls the API with a bearer token, never a cookie, and CORS lets it, for the
    // origins the settings allow (none: same-origin clients only).
    if (webOrigins.length > 0) {
      this.fastify.register(fastifyCors, {
        origin: webOrigins,
        methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
        allowedHeaders: [
          'authorization',
          'content-type',
          'hx-request',
          'hx-target',
          'hx-trigger',
          'hx-current-url',
          'hx-boosted',
          'hx-push-url',
        ],
        exposedHeaders: ['x-trace-id'],
      });
    }
    // Only programming errors and schema violations get here: expected failures are Results.
    this.fastify.setErrorHandler((error: FastifyError, req, reply) => {
      const format = req.headers['hx-request'] ? 'htmx' : 'json';
      if (format === 'htmx') {
        return reply.code(error.statusCode || 500).send(`<div>${error.message}</div>`);
      }
      return reply.code(error.statusCode || 500).send(error);
    });
  }

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

  registerRoutes<Options extends FastifyPluginOptions>(
    prefix: string,
    routes: FastifyPluginCallback<Options>,
    options: Options,
  ): this {
    this.fastify.register(routes, {
      prefix: prefix === '/' ? `${SETTINGS.apiPrefix}` : SETTINGS.apiPrefix + prefix,
      ...options,
    });
    return this;
  }

  /** Listens. Port 0 asks the OS for a free one (tests); `address` then says which. */
  async start(port: number = SETTINGS.port): Promise<void> {
    await webSocketChannel.initialize(this.fastify);
    await this.fastify.listen({ port, host: '127.0.0.1' });
    await this.fastify.ready();
    this.fastify.swagger();
    this.logger.info(`Listening on ${this.address}`);
  }

  async stop(): Promise<void> {
    await this.fastify.close();
  }

  get address(): string {
    const { address, port } = this.fastify.server.address() as AddressInfo;
    return `http://${address}:${port}`;
  }
}

/**
 * Builds the whole application: wired, its modules listening on the bus, seeded; not yet
 * serving. The modules start before the seed so that the seed's events reach their handlers.
 */
export async function createApplication({
  logger = new ConsoleLogger({ debug: SETTINGS.logger.debug }),
  webOrigins = SETTINGS.webOrigins,
}: { logger?: Logger; webOrigins?: string[] } = {}): Promise<FastifyApplication> {
  const app = new FastifyApplication(logger, webOrigins)
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
  // an in-memory outbox, and the line is where a store's outbox would be relayed.
  relayOutbox(
    InMemoryOutbox.shared,
    app.getEventBus(),
    new ExecutionContext({ traceId: 'startup', auth: {}, eventBus: app.getEventBus(), logger }),
  );
  return app.seed();
}
