import { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { FastifyAuthController } from '../Controllers/AuthController';
import { SecurityModule } from '@Contexts/Security/Application';

import { loginSchema, signUpSchema, validateAccountSchema } from './auth.routes.schema';

export const authRoutes = function (
  fastify: FastifyInstance,
  opts: FastifyPluginOptions & { securityModule: SecurityModule },
  done: (err?: Error) => void,
): void {
  const authController = new FastifyAuthController({
    module: opts.securityModule,
  });

  fastify.post('/auth/login', { schema: loginSchema }, authController.login.bind(authController));
  fastify.post('/auth/account/signup', { schema: signUpSchema }, authController.signUp.bind(authController));
  fastify.post(
    '/auth/account/validate',
    { schema: validateAccountSchema },
    authController.validate.bind(authController),
  );

  done();
};
