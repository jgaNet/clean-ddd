export const SETTINGS = {
  name: 'Clean DDD',
  env: 'production',
  version: '0.0.1',
  protocol: 'http',
  baseUrl: String(process.env.BASE_URL || 'localhost'),
  port: parseInt(process.env.PORT || '10000'),
  swaggerUi: {
    active: true,
    routePrefix: '/docs',
    exposeRoute: true,
  },
};
