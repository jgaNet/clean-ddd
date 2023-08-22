#!/usr/bin/env node

/**
 * This is a sample HTTP server.
 * Replace this with your implementation.
 */
import 'dotenv/config';
import { Config } from './config.js';

import Fastify from 'fastify';
import { userRoutes } from '@core/presentation/gateways/http/routes/user';
import { homeRoutes } from '@core/presentation/gateways/http/routes/home';
import { swaggerDescriptor } from '@core/presentation/gateways/http/swagger';
import { localApplication } from '@core/infrastructure/app/application.local';
import fastifySwagger from '@fastify/swagger';
import fastifySwaggerUi from '@fastify/swagger-ui';

const swaggerUiOptions = {
  routePrefix: '/docs',
  exposeRoute: true,
};

const fastify = Fastify({ logger: false });

//HTTP Gateway With Swagger
fastify.register(fastifySwagger, swaggerDescriptor);
fastify.register(fastifySwaggerUi, swaggerUiOptions);
fastify.register(homeRoutes);
fastify.register(userRoutes, { prefix: '/users' });

export default async function main(port: number = Config.port) {
  try {
    await localApplication.start();
    await fastify.listen({ port });
    await fastify.ready();
    fastify.swagger();
    console.log(`[sys][http] Listening on port: ${port}`);
  } catch (err) {
    console.log(err);
    fastify.log.error(err);
    process.exit(1);
  }
}

main();
