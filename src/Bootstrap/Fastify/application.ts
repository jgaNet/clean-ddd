#!/usr/bin/env node

import 'dotenv/config';
import { v4 as uuidv4 } from 'uuid';
import bcrypt from 'bcryptjs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

import Fastify, { FastifyInstance } from 'fastify';
import fastifySwagger from '@fastify/swagger';
import fastifySwaggerUi from '@fastify/swagger-ui';
import fastifyStatic from '@fastify/static';

import { SETTINGS } from './application.settings';
import { swaggerDescriptor } from './application.swagger';

import { localTrackerModule } from '@Contexts/Tracker/module.local';
import { localNotesModule } from '@Contexts/Notes/module.local';
import { localSecurityModule } from '@Contexts/Security/module.local';
import { localNotificationsModule } from '@Contexts/Notifications/module.local';

import { homeRoutes } from '@SharedKernel/Presentation/API/REST/Routes';
import { noteRoutes } from '@Contexts/Notes/Presentation/API/REST/Routes';
import { operationRoutes } from '@Contexts/Tracker/Presentation/API/REST/Routes';
import { authRoutes } from '@Contexts/Security/Presentation/API/REST/Routes/auth.routes';
import { notificationRoutes } from '@Contexts/Notifications/Presentation/API/REST/Routes';

import { Application, ExecutionContext } from '@SharedKernel/Domain/Application';
import { ConsoleLogger } from '@SharedKernel/Infrastructure/Logging/ConsoleLogger';
import { InMemoryUnitOfWork } from '@SharedKernel/Infrastructure/UnitOfWork/InMemoryUnitOfWork';

// Create shared services
const logger = new ConsoleLogger({ debug: SETTINGS.logger.debug });
const unitOfWork = new InMemoryUnitOfWork();

class FastifyApplication extends Application {
  fastify: FastifyInstance;
  logger: ConsoleLogger;
  unitOfWork: InMemoryUnitOfWork;

  constructor() {
    super();
    this.fastify = Fastify({ logger: false });
    this.logger = logger;
    this.unitOfWork = unitOfWork;

    this.fastify.addHook('onRequest', localSecurityModule.services.authMiddleware.authenticate());
    // Add hook to create execution context for each request
    this.fastify.addHook('preHandler', (request, reply, done) => {
      // Generate a trace ID for this request
      const traceId = (request.headers['x-trace-id'] as string) || uuidv4();

      // Create execution context
      const context = new ExecutionContext({
        traceId,
        auth: {
          subjectId: request.auth?.subjectId,
          role: request.auth?.role,
        },
        eventBus: this.getEventBus(),
        unitOfWork: this.unitOfWork,
        logger: this.logger,
      });

      // Add context to request for use in route handlers
      request.executionContext = context;

      // Add trace ID to response headers
      reply.header('x-trace-id', traceId);

      done();
    });

    this.fastify.register(fastifyStatic, {
      root: join(__dirname, 'public'),
      index: 'index.html',
    });
  }

  seed() {
    if (SETTINGS.security.adminAccount) {
      localSecurityModule.services.admin.register({
        identifier: SETTINGS.security.adminAccount.identifier,
        password: bcrypt.hashSync(SETTINGS.security.adminAccount.password, 10),
      });
    }
    return this;
  }

  setupSwagger() {
    this.fastify.register(fastifySwagger, swaggerDescriptor);
    if (SETTINGS.swaggerUi.active) {
      this.fastify.register(fastifySwaggerUi, SETTINGS.swaggerUi);
    }
    return this;
  }

  registerRoutes(
    prefix: string,
    // eslint-disable-next-line
    routes: (app: FastifyInstance, opts: any, done: () => void) => void,
    options: Record<string, unknown> = {},
  ) {
    this.fastify.register(routes, {
      prefix: prefix === '/' ? `${SETTINGS.apiPrefix}` : SETTINGS.apiPrefix + prefix,
      ...options,
    });
    return this;
  }

  async start(port: number = SETTINGS.port): Promise<void> {
    try {
      await this.fastify.listen({ port });
      await this.fastify.ready();
      this.fastify.swagger();
      this.logger.info(`Listening on port: ${port}`);
    } catch (err) {
      this.fastify.log.error(err);
      process.exit(1);
    }
  }
}

const app = new FastifyApplication();

export default await app
  .setEventBus(localTrackerModule.services.eventBus)
  .registerModule(localTrackerModule)
  .registerModule(localNotesModule)
  .registerModule(localSecurityModule)
  .registerModule(localNotificationsModule)
  .setupSwagger()
  .registerRoutes('/', homeRoutes, {
    settings: SETTINGS,
  })
  .registerRoutes('/tracker/operations', operationRoutes, {
    operationsModule: localTrackerModule,
  })
  .registerRoutes('/notes', noteRoutes, {
    notesModule: localNotesModule,
  })
  .registerRoutes('/', authRoutes, {
    securityModule: localSecurityModule,
  })
  .registerRoutes('/notifications', notificationRoutes, {
    notificationsModule: localNotificationsModule,
  })
  .seed()
  .run();
