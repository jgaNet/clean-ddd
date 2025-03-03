#!/usr/bin/env node

import 'dotenv/config';
import { SETTINGS } from './application.settings';
import Fastify, { FastifyInstance } from 'fastify';

import { homeRoutes } from '@SharedKernel/Presentation/API/REST/Routes';
import { localOperationsModule } from '@Contexts/Operations/module.local';
import { localUsersModule } from '@Contexts/Users/module.local';
import { userRoutes } from '@Contexts/Users/Presentation/API/REST/Routes';
import { operationRoutes } from '@Contexts/Operations/Presentation/API/REST/Routes';

import { swaggerDescriptor } from './application.swagger';
import fastifySwagger from '@fastify/swagger';
import fastifySwaggerUi from '@fastify/swagger-ui';

import { Application } from '@Primitives';

class FastifyApplication extends Application {
  fastify: FastifyInstance;

  constructor() {
    super();
    this.fastify = Fastify({ logger: false });
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
      console.log(`[sys][http] Listening on port: ${port}`);
    } catch (err) {
      this.fastify.log.error(err);
      process.exit(1);
    }
  }
}

export default await new FastifyApplication()
  .setEventBus(localOperationsModule.eventBus)
  .registerModule(localOperationsModule)
  .registerModule(localUsersModule)
  .setupSwagger()
  .registerRoutes('/', homeRoutes, {
    settings: SETTINGS,
  })
  .registerRoutes('/operations', operationRoutes, {
    operationsModule: localOperationsModule,
  })
  .registerRoutes('/users', userRoutes, {
    usersModule: localUsersModule,
  })
  .run();
