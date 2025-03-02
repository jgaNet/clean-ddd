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
    super({
      eventBus: localOperationsModule.services.eventBus,
      modules: [localOperationsModule, localUsersModule],
    });
    this.fastify = Fastify({ logger: false });
  }

  setup() {
    //HTTP Gateway With Swagger
    this.fastify.register(fastifySwagger, swaggerDescriptor);
    if (SETTINGS.swaggerUi.active) {
      this.fastify.register(fastifySwaggerUi, SETTINGS.swaggerUi);
    }

    // Routes
    this.fastify.register(homeRoutes, { settings: SETTINGS });

    this.fastify.register(operationRoutes, {
      prefix: '/operations',
      operationsManagerModule: localOperationsModule,
    });
    this.fastify.register(userRoutes, {
      prefix: '/users',
      usersManagementModule: localUsersModule,
    });
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

const app = new FastifyApplication();
await app.run();

export default app;
