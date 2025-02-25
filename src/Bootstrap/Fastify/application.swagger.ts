import { SwaggerOptions } from '@fastify/swagger';
import { SETTINGS } from './application.settings';

export const swaggerDescriptor: SwaggerOptions = {
  swagger: {
    info: {
      title: `${SETTINGS.name} - ${SETTINGS.env}`,
      description: `${SETTINGS.env} API`,
      version: SETTINGS.version,
    },
    host: `${SETTINGS.baseUrl}:${SETTINGS.port}`,
    schemes: [SETTINGS.protocol],
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
