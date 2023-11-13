#!/usr/bin/env node

import 'dotenv/config';
import { Config } from './application.config';
import Fastify, { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

import { userRoutes } from '@users-manager/presentation/api/http/routes/user';
import { homeRoutes } from '@users-manager/presentation/api/http/routes/home';

import { swaggerDescriptor } from './application.swagger';
import { localUsersManagerModule } from '@users-manager/users-manager.local';
import fastifySwagger from '@fastify/swagger';
import fastifySwaggerUi from '@fastify/swagger-ui';

import keycloak, { KeycloakOptions } from 'fastify-keycloak-adapter';

import { Application } from '@primitives/Application';

class MainApplication extends Application {
  fastify: FastifyInstance;

  constructor() {
    super({ modules: [localUsersManagerModule] });
    this.fastify = Fastify({ logger: false });
  }

  setup() {
    //HTTP Gateway With Swagger
    this.fastify.register(fastifySwagger, swaggerDescriptor);
    if (Config.swaggerUi.active) {
      this.fastify.register(fastifySwaggerUi, Config.swaggerUi);
    }

    // Routes
    this.fastify.register(homeRoutes);
    this.fastify.register(userRoutes, { prefix: '/users', usersManagementModule: localUsersManagerModule });

    // Keycloak
    const opts: KeycloakOptions = {
      ...Config.keycloak,
      userPayloadMapper(userPayload: unknown): object {
        return userPayload as object;
      },
      unauthorizedHandler(_: FastifyRequest, reply: FastifyReply) {
        reply.status(401).send(`Invalid request`);
      },
    };

    this.fastify.register(keycloak, opts);
  }

  async start(port: number = Config.port): Promise<void> {
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

const app = new MainApplication();
app.run();
