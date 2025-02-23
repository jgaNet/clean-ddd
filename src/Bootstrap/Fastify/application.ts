#!/usr/bin/env node

import 'dotenv/config';
import { SETTINGS } from './application.settings';
import Fastify, { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

import { localUsersManagerModule } from '@Contexts/UsersManager/usersManagerModule.local';
import { userRoutes } from '@Contexts/UsersManager/Presentation/API/REST/Routes/user';
import { homeRoutes } from '@Shared/Presentation/API/REST/Routes/home';

import { swaggerDescriptor } from './application.swagger';
import fastifySwagger from '@fastify/swagger';
import fastifySwaggerUi from '@fastify/swagger-ui';

import keycloak, { KeycloakOptions } from 'fastify-keycloak-adapter';

import { Application } from '@Primitives/Application';

class FastifyApplication extends Application {
  fastify: FastifyInstance;

  constructor() {
    super({ modules: [localUsersManagerModule] });
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
    this.fastify.register(userRoutes, { prefix: '/users', usersManagementModule: localUsersManagerModule });

    if (SETTINGS.keycloak.active) {
      const opts: KeycloakOptions = {
        ...SETTINGS.keycloak,
        userPayloadMapper(userPayload: unknown): object {
          return userPayload as object;
        },
        unauthorizedHandler(_: FastifyRequest, reply: FastifyReply) {
          reply.status(401).send(`Invalid request`);
        },
      };

      this.fastify.register(keycloak, opts);
    }
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
app.run();
