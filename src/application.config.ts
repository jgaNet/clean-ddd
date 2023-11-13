export const Config = {
  env: 'production',
  version: '0.0.1',
  baseUrl: String(process.env.BASE_URL || 'localhost'),
  port: parseInt(process.env.PORT || '10000'),
  swaggerUi: {
    active: true,
    routePrefix: '/docs',
    exposeRoute: true,
  },
  keycloak: {
    active: true,
    appOrigin: `http://${process.env.BASE_URL || 'localhost'}:${process.env.PORT || '10000'}`,
    clientId: process.env.KEYCLOAK_CLIENT_ID || 'web-app',
    clientSecret: process.env.KEYCLOAK_CLIENT_SECRET || '',
    keycloakSubdomain: process.env.KEYCLOAK_SUBDOMAIN || 'keycloak.exostic.com/realms/clean-ddd',
    useHttps: true,
    autoRefreshToken: true,
  },
  kafka: {
    active: false,
    brokers: ['localhost:9092', 'localhost:9093', 'localhost:9094'],
    clientId: process.env.KAFKA_CLIENT_ID || 'my-app',
  },
};
