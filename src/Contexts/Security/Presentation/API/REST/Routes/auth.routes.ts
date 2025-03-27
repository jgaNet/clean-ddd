import { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { FastifyAuthController } from '../Controllers/AuthController';
import { FastifyAccountController } from '../Controllers/AccountController';
import { SecurityModule } from '@Contexts/Security/Application';

import {
  getAccountByIdSchema,
  loginSchema,
  meSchema,
  signUpSchema,
  validateAccountSchema,
  validateAccountByIdSchema,
  logoutSchema,
} from './auth.routes.schema';

export const authRoutes = function (
  fastify: FastifyInstance,
  opts: FastifyPluginOptions & { securityModule: SecurityModule },
  done: (err?: Error) => void,
): void {
  const authController = new FastifyAuthController({
    module: opts.securityModule,
  });

  const accountController = new FastifyAccountController({
    module: opts.securityModule,
  });

  fastify.post('/auth/signup', { schema: signUpSchema }, authController.signUp.bind(authController));
  fastify.get('/auth/validate', { schema: validateAccountSchema }, authController.validate.bind(authController));
  fastify.get('/auth/me', { schema: meSchema }, authController.me.bind(authController));
  fastify.post('/auth/login', { schema: loginSchema }, authController.login.bind(authController));
  fastify.post('/auth/logout', { schema: logoutSchema }, authController.logout.bind(authController));

  fastify.get(
    '/auth/accounts/:id/validate',
    { schema: validateAccountByIdSchema },
    accountController.validateAccountById.bind(accountController),
  );

  fastify.get(
    '/auth/accounts/:id',
    { schema: getAccountByIdSchema },
    accountController.getAccountById.bind(accountController),
  );

  done();
};
