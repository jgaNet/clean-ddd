#!/usr/bin/env node

import 'dotenv/config';
import { SETTINGS } from './application.settings';
import Fastify, { FastifyInstance } from 'fastify';

import { homeRoutes } from '@SharedKernel/Presentation/API/REST/Routes';
import { localTrackerModule } from '@Contexts/Tracker/module.local';
import { localUsersModule } from '@Contexts/Users/module.local';
import { userRoutes } from '@Contexts/Users/Presentation/API/REST/Routes';
import { operationRoutes } from '@Contexts/Tracker/Presentation/API/REST/Routes';

import { swaggerDescriptor } from './application.swagger';
import fastifySwagger from '@fastify/swagger';
import fastifySwaggerUi from '@fastify/swagger-ui';

import { Application } from '@Primitives';
import { ExecutionContext } from '@Primitives/ExecutionContext';
import { ConsoleLogger } from '@SharedKernel/Infrastructure/Logging/ConsoleLogger';
import { InMemoryUnitOfWork } from '@SharedKernel/Infrastructure/UnitOfWork/InMemoryUnitOfWork';
import { v4 as uuidv4 } from 'uuid';

// Create shared services
const logger = new ConsoleLogger();
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

    // Add hook to create execution context for each request
    this.fastify.addHook('onRequest', (request, reply, done) => {
      // Generate a trace ID for this request
      const traceId = (request.headers['x-trace-id'] as string) || uuidv4();

      // Create execution context
      const context = new ExecutionContext({
        traceId,
        userId: request.headers['x-user-id'] as string,
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
    this.fastify.register(routes, { prefix: prefix === '/' ? '' : prefix, ...options });
    return this;
  }

  async start(port: number = SETTINGS.port): Promise<void> {
    try {
      await this.fastify.listen({ port });
      await this.fastify.ready();
      this.fastify.swagger();
      // eslint-disable-next-line
      this.logger.info(`Listening on port: ${port}`);
    } catch (err) {
      this.fastify.log.error(err);
      process.exit(1);
    }
  }
}

export default await new FastifyApplication()
  .setEventBus(localTrackerModule.services.eventBus)
  .registerModule(localTrackerModule)
  .registerModule(localUsersModule)
  .setupSwagger()
  .registerRoutes('/', homeRoutes, {
    settings: SETTINGS,
  })
  .registerRoutes('/tracker/operations', operationRoutes, {
    operationsModule: localTrackerModule,
  })
  .registerRoutes('/users', userRoutes, {
    usersModule: localUsersModule,
  })
  .run();
