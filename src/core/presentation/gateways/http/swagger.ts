import { SwaggerOptions } from '@fastify/swagger';

export const swaggerDescriptor: SwaggerOptions = {
  swagger: {
    info: {
      title: 'API',
      description: 'Testing the API',
      version: '0.0.1',
    },
    host: 'localhost:8080',
    schemes: ['http'],
    consumes: ['application/json'],
    produces: ['application/json'],
    tags: [],
    definitions: {},
    securityDefinitions: {
      apiKey: {
        type: 'apiKey',
        name: 'apiKey',
        in: 'header',
      },
    },
  },
};
