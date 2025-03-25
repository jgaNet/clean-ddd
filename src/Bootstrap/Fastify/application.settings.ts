const protocol = String(process.env.PROTOCOL || 'http');
const baseUrl = String(process.env.BASE_URL || 'localhost');
const port = parseInt(process.env.PORT || '10000');
const apiPrefix = String(process.env.API_PREFIX || 'v1');

export const SETTINGS = {
  name: 'Clean DDD',
  env: String(process.env.ENV || 'dev'),
  version: '0.0.1',
  protocol,
  baseUrl,
  apiPrefix,
  port,
  url: `${protocol}://${baseUrl}:${port}`,
  apiUrl: `${protocol}://${baseUrl}:${port}/${apiPrefix}`,
  swaggerUi: {
    active: true,
    routePrefix: `/${apiPrefix}/docs`,
    exposeRoute: true,
  },
  security: {
    jwt: {
      secret: process.env.JWT_SECRET || 'default-development-secret-do-not-use-in-production',
      expiresIn: process.env.JWT_EXPIRES_IN || '24h',
    },
    adminAccount: {
      identifier: process.env.ADMIN_IDENTIFIER || 'admin@admin.fr',
      password: process.env.ADMIN_PASSWORD || 'admin',
    },
  },
  logger: {
    debug: false,
  },
};
