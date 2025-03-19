import { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { FastifyAuthController } from '../Controllers/AuthController';
import { SecurityModule } from '@Contexts/Security/Application';

import {
  getAccountByIdSchema,
  loginSchema,
  meSchema,
  signUpSchema,
  validateAccountSchema,
  validateAccountByIdSchema,
} from './auth.routes.schema';

export const authRoutes = function (
  fastify: FastifyInstance,
  opts: FastifyPluginOptions & { securityModule: SecurityModule },
  done: (err?: Error) => void,
): void {
  const authController = new FastifyAuthController({
    module: opts.securityModule,
  });

  fastify.post('/auth/login', { schema: loginSchema }, authController.login.bind(authController));
  fastify.post('/auth/signup', { schema: signUpSchema }, authController.signUp.bind(authController));
  fastify.get('/auth/validate', { schema: validateAccountSchema }, authController.validate.bind(authController));
  fastify.get(
    '/auth/accounts/:id/validate',
    { schema: validateAccountByIdSchema },
    authController.validateAccountById.bind(authController),
  );
  fastify.get('/auth/accounts/me', { schema: meSchema }, authController.me.bind(authController));
  fastify.get(
    '/auth/accounts/:id',
    { schema: getAccountByIdSchema },
    authController.getAccountById.bind(authController),
  );

  done();
};
