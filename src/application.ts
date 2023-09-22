#!/usr/bin/env node

import 'dotenv/config';
import { Config } from './application.config';

import Fastify, { FastifyReply, FastifyRequest } from 'fastify';
import { userRoutes } from '@users-manager/presentation/api/http/routes/user';
import { homeRoutes } from '@users-manager/presentation/api/http/routes/home';
import { swaggerDescriptor } from './application.swagger';
import { localUsersManagerModule } from '@users-manager/users-manager.local';
import fastifySwagger from '@fastify/swagger';
import fastifySwaggerUi from '@fastify/swagger-ui';
import keycloak, { KeycloakOptions } from 'fastify-keycloak-adapter';

const opts: KeycloakOptions = {
  ...Config.keycloak,
  userPayloadMapper(userPayload: unknown): object {
    return userPayload as object;
  },
  unauthorizedHandler(_: FastifyRequest, reply: FastifyReply) {
    reply.status(401).send(`Invalid request`);
  },
};

const fastify = Fastify({ logger: false });

//HTTP Gateway With Swagger
fastify.register(fastifySwagger, swaggerDescriptor);
if (Config.swaggerUi.active) {
  fastify.register(fastifySwaggerUi, Config.swaggerUi);
}
fastify.register(homeRoutes);
fastify.register(userRoutes, { prefix: '/users', usersManagementModule: localUsersManagerModule });

fastify.register(keycloak, opts);

export default async function main(port: number = Config.port) {
  try {
    await localUsersManagerModule.start();
    await fastify.listen({ port });
    await fastify.ready();
    fastify.swagger();
    console.log(`[sys][http] Listening on port: ${port}`);
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
}

main();
