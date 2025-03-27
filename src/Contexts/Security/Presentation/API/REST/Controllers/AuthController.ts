import { FastifyReply, FastifyRequest } from 'fastify';
import * as bcrypt from 'bcryptjs';
import {
  BasicLoginReqBody,
  BasicSignUpReqBody,
} from '@Contexts/Security/Presentation/API/REST/Routes/auth.routes.schema';

import { SecurityModule } from '@Contexts/Security/Application';
import {
  LoginCommandEvent,
  LoginCommandHandler,
  SignUpCommandEvent,
  ValidateAccountCommandEvent,
} from '@Contexts/Security/Application/Commands';

import { GetAccountQueryHandler } from '@Contexts/Security/Application/Queries';
import { InvalidTokenException } from '@Contexts/Security/Domain/Auth/Exceptions/InvalidTokenException';
import { NotAllowedException } from '@Contexts/@SharedKernel/Domain';

import { Role } from '@SharedKernel/Domain/AccessControl';
import { PresenterFactory } from '@Contexts/@SharedKernel/Domain';
import {
  LoginHTMXPresenter,
  LoggedInHTMXPresenter,
  LoggedInJSONPresenter,
  LogoutJSONPresenter,
  MeHTMXPresenter,
  MeJSONPresenter,
  ErrorJSONPresenter,
  ErrorHTMXPresenter,
} from '@Contexts/Security/Presentation/Presenters/Auth';

export class FastifyAuthController {
  #securityModule: SecurityModule;
  #presenterFactory: PresenterFactory = new PresenterFactory();

  constructor({ module: SecurityModule }: { module: SecurityModule }) {
    this.#securityModule = SecurityModule;
    this.#presenterFactory.register({
      name: 'getApiMe',
      presenters: [
        { format: 'json', presenter: new MeJSONPresenter() },
        { format: 'htmx', presenter: new MeHTMXPresenter() },
      ],
    });

    this.#presenterFactory.register({
      name: 'getApiLogout',
      presenters: [
        { format: 'json', presenter: new LogoutJSONPresenter() },
        { format: 'htmx', presenter: new LoginHTMXPresenter() },
      ],
    });

    this.#presenterFactory.register({
      name: 'getApiLogin',
      presenters: [
        { format: 'json', presenter: new LoggedInJSONPresenter() },
        { format: 'htmx', presenter: new LoggedInHTMXPresenter() },
      ],
    });

    this.#presenterFactory.register({
      name: 'getApiNotAllowedException',
      presenters: [
        { format: 'json', presenter: new ErrorJSONPresenter() },
        { format: 'htmx', presenter: new LoginHTMXPresenter() },
      ],
    });

    this.#presenterFactory.register({
      name: 'getApiError',
      presenters: [
        { format: 'json', presenter: new ErrorJSONPresenter() },
        { format: 'htmx', presenter: new ErrorHTMXPresenter() },
      ],
    });
  }

  async signUp(req: FastifyRequest<{ Body: BasicSignUpReqBody }>, reply: FastifyReply) {
    const context = req.executionContext;

    context.logger?.info('Creating new account', {
      traceId: context.traceId,
      email: req.body.identifier,
    });

    const hash = bcrypt.hashSync(req.body.password, bcrypt.genSaltSync());

    if (!hash) {
      return reply.code(500).send(hash);
    }

    const operation = context.eventBus.publish(
      SignUpCommandEvent.set({
        subjectId: req.body.identifier,
        subjectType: Role.USER,
        isActive: false,
        credentials: {
          type: 'password',
          value: hash,
        },
      }),
      context,
    );

    return reply.code(200).send({
      operationId: operation.id,
    });
  }

  async validate(req: FastifyRequest<{ Querystring: { validation_token: string } }>, reply: FastifyReply) {
    const context = req.executionContext;

    // WARNING : This is not the best way to do it. Maybe should i move it the command handler.
    const decodedToken = this.#securityModule.services.jwtService.verify(req.query.validation_token);
    if (!decodedToken) {
      return reply.code(401).send({
        error: new InvalidTokenException('Not allowed', context).message,
      });
    }

    const operation = context.eventBus.publish(ValidateAccountCommandEvent.set(decodedToken), context);

    return reply.code(200).send({
      operationId: operation.id,
    });
  }

  async login(req: FastifyRequest<{ Body: BasicLoginReqBody }>, reply: FastifyReply) {
    const format = req.headers['hx-request'] ? 'htmx' : 'json';
    const errorPresenter = this.#presenterFactory.get({ name: 'getApiError', format });
    const notAllowedPresenter = this.#presenterFactory.get({ name: 'getApiNotAllowedException', format });
    const presenter = this.#presenterFactory.get({ name: 'getApiLogin', format });
    try {
      const { identifier, password } = req.body as { identifier: string; password: string };

      // Create login command
      const loginCommand = LoginCommandEvent.set({ identifier, password });

      // Execute login command through the security module
      const loginResult = await (this.#securityModule.getCommand(LoginCommandEvent) as LoginCommandHandler).execute(
        loginCommand,
      );

      if (loginResult.isFailure()) {
        return reply.code(200).send(notAllowedPresenter?.present(loginResult.error?.message));
      }

      reply.setCookie('token', loginResult.data.token, {
        path: '/',
        httpOnly: true,
        secure: true,
        sameSite: 'strict',
      });

      return presenter?.present(loginResult.data);
    } catch (error) {
      return reply.code(500).send(errorPresenter?.present('Unexpected error'));
    }
  }

  async me(req: FastifyRequest, reply: FastifyReply) {
    const format = req.headers['hx-request'] ? 'htmx' : 'json';

    const presenter = this.#presenterFactory.get({ name: 'getApiMe', format });
    const notAllowedPresenter = this.#presenterFactory.get({ name: 'getApiNotAllowedException', format });
    const errorPresenter = this.#presenterFactory.get({ name: 'getApiError', format });

    try {
      const meResult = await this.#securityModule
        .getQuery(GetAccountQueryHandler)
        .executeWithContext(req.executionContext.auth.subjectId, req.executionContext);

      if (meResult.isFailure()) {
        throw meResult.error;
      }

      return presenter?.present(meResult.data);
    } catch (error) {
      if (error instanceof NotAllowedException) {
        if (format === 'htmx') {
          return notAllowedPresenter?.present(error.message);
        }

        return reply.code(401).send(notAllowedPresenter?.present(error.message));
      }

      return reply.code(500).send(errorPresenter?.present('An error occurred'));
    }
  }

  async logout(req: FastifyRequest, reply: FastifyReply) {
    const format = req.headers['hx-request'] ? 'htmx' : 'json';
    reply.clearCookie('token');

    return this.#presenterFactory.get({ name: 'getApiLogout', format })?.present('Logout successful');
  }
}
