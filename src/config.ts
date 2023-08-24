export const Config = {
  port: parseInt(process.env.PORT || '10000'),
  swaggerUi: {
    active: false,
    routePrefix: '/docs',
    exposeRoute: true,
  },
};
