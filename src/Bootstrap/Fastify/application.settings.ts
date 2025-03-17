export const SETTINGS = {
  name: 'Clean DDD',
  env: String(process.env.ENV || 'dev'),
  version: '0.0.1',
  protocol: 'http',
  baseUrl: String(process.env.BASE_URL || 'localhost'),
  port: parseInt(process.env.PORT || '10000'),
  swaggerUi: {
    active: true,
    routePrefix: '/docs',
    exposeRoute: true,
  },
  security: {
    jwt: {
      secret: process.env.JWT_SECRET || 'default-development-secret-do-not-use-in-production',
      expiresIn: process.env.JWT_EXPIRES_IN || '24h',
    },
    adminAccount: {
      identifier: process.env.ADMIN_IDENTIFIER || 'admin',
      password: process.env.ADMIN_PASSWORD || 'admin',
    },
  },
};
