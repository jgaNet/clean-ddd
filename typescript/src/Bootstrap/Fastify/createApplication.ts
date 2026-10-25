import { v4 as uuidv4 } from 'uuid';
import { dirname, join, resolve } from 'path';
import { existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { AddressInfo } from 'net';

import Fastify, { FastifyError, FastifyInstance, FastifyPluginCallback, FastifyPluginOptions } from 'fastify';
import fastifySwagger from '@fastify/swagger';
import fastifySwaggerUi from '@fastify/swagger-ui';
import fastifyStatic from '@fastify/static';
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

import { Application, ExecutionContext, Logger } from '@Architecture/Application';
import { formatOf } from '@Architecture/Presentation/Format';
import { ConsoleLogger } from '@Architecture/Infrastructure/Logging/ConsoleLogger';
import { InMemoryUnitOfWork } from '@Architecture/Infrastructure/UnitOfWork/InMemoryUnitOfWork';

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * The HTMX front end is shared by every language and lives at the repository root (`web/`),
 * beside the language directories; it is found by walking up from this file, so the sources
 * (`src/Bootstrap/Fastify/`), the bundle (`dist/`) and a Docker image laid out the same way all
 * reach it. `WEB_ROOT` overrides the lookup when the deployment lays things out differently.
 */
function webRoot(from: string): string {
  if (process.env.WEB_ROOT) return process.env.WEB_ROOT;
  let dir = from;
  for (;;) {
    const candidate = join(dir, 'web', 'index.html');
    if (existsSync(candidate)) return dirname(candidate);
    const parent = resolve(dir, '..');
    if (parent === dir) throw new Error(`No web/ directory found above ${from}; set WEB_ROOT`);
    dir = parent;
  }
}

const WEB = webRoot(__dirname);

/**
 * The composition root: the one place that knows every context, every route and the
 * transport. Nothing here is business; it is wiring, plus the two Fastify hooks that give
 * each request its identity (authentication) and its ExecutionContext.
 */
export class FastifyApplication extends Application {
  readonly fastify: FastifyInstance;
  readonly logger: Logger;

  constructor(logger: Logger) {
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
    this.fastify.register(fastifyStatic, { root: WEB, index: 'index.html' });
    this.fastify.setNotFoundHandler((_, reply) => {
      reply.sendFile('index.html');
    });
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
export async function createApplication(
  logger: Logger = new ConsoleLogger({ debug: SETTINGS.logger.debug }),
): Promise<FastifyApplication> {
  const app = new FastifyApplication(logger)
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
  return app.seed();
}
