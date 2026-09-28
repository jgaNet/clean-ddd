import { FastifyReply, FastifyRequest } from 'fastify';

import { NotAllowedException } from '@SharedKernel/Domain';
import { Module } from '@SharedKernel/Application';
import { formatOf, present } from '@SharedKernel/Presentation/Format';

import {
  LoginCommandEvent,
  LoginCommandHandler,
  SignUpCommandEvent,
  ValidateAccountCommandEvent,
} from '@Contexts/Security/Application/Commands';
import { GetAccountQueryHandler } from '@Contexts/Security/Application/Queries';
import {
  BasicLoginReqBody,
  BasicSignUpReqBody,
} from '@Contexts/Security/Presentation/API/REST/Routes/auth.routes.schema';
import {
  ErrorHTMXPresenter,
  ErrorJSONPresenter,
  LoggedInHTMXPresenter,
  LoggedInJSONPresenter,
  LoginHTMXPresenter,
  LogoutJSONPresenter,
  MeHTMXPresenter,
  MeJSONPresenter,
} from '@Contexts/Security/Presentation/Presenters/Auth';

/** The same use case answered in two formats; which one is decided per request from the headers. */
const presenters = {
  loggedIn: { json: new LoggedInJSONPresenter(), htmx: new LoggedInHTMXPresenter() },
  me: { json: new MeJSONPresenter(), htmx: new MeHTMXPresenter() },
  loggedOut: { json: new LogoutJSONPresenter(), htmx: new LoginHTMXPresenter() },
  error: { json: new ErrorJSONPresenter(), htmx: new ErrorHTMXPresenter() },
  // For the HTMX front end, "not signed in" is answered with the login form itself.
  signInAgain: { json: new ErrorJSONPresenter(), htmx: new LoginHTMXPresenter() },
};

export class FastifyAuthController {
  #securityModule: Module;

  constructor({ module }: { module: Module }) {
    this.#securityModule = module;
  }

  async signUp(req: FastifyRequest<{ Body: BasicSignUpReqBody }>, reply: FastifyReply) {
    const context = req.executionContext;
    context.logger?.info('Creating new account', { traceId: context.traceId, email: req.body.identifier });

    // The password is hashed by the handler, behind the IPasswordHasher port.
    const operation = context.eventBus.publish(
      SignUpCommandEvent.set({ email: req.body.identifier, password: req.body.password }),
      context,
    );

    return reply.code(200).send({ operationId: operation.id });
  }

  async validate(req: FastifyRequest<{ Querystring: { validation_token: string } }>, reply: FastifyReply) {
    const context = req.executionContext;

    // The token is verified by the handler; whether it is valid is the operation's outcome.
    const operation = context.eventBus.publish(
      ValidateAccountCommandEvent.set({ validationToken: req.query.validation_token }),
      context,
    );

    return reply.code(200).send({ operationId: operation.id });
  }

  /** Login answers synchronously: the client needs the token, so the command is executed here, not published. */
  async login(req: FastifyRequest<{ Body: BasicLoginReqBody }>, reply: FastifyReply) {
    const format = formatOf(req);
    const { identifier, password } = req.body;

    const loginResult = await this.#securityModule
      .getCommand(LoginCommandHandler)
      .execute(LoginCommandEvent.set({ identifier, password }), req.executionContext);

    if (loginResult.isFailure()) {
      return reply.code(401).send(present(presenters.error, format, { message: loginResult.error.message }));
    }

    reply.setCookie('token', loginResult.data.token, { path: '/', httpOnly: true, secure: true, sameSite: 'strict' });
    return present(presenters.loggedIn, format, loginResult.data);
  }

  async me(req: FastifyRequest, reply: FastifyReply) {
    const format = formatOf(req);

    const meResult = await this.#securityModule
      .getQuery(GetAccountQueryHandler)
      .handle(req.executionContext.auth.subjectId ?? '', req.executionContext);

    if (meResult.isFailure()) {
      const message = { message: meResult.error.message };
      if (meResult.error instanceof NotAllowedException) {
        // HTMX swaps the login form back in; an API client gets a 401.
        if (format === 'htmx') return present(presenters.signInAgain, format, message);
        return reply.code(401).send(present(presenters.signInAgain, format, message));
      }
      return reply.code(400).send(present(presenters.error, format, message));
    }

    return present(presenters.me, format, meResult.data);
  }

  async logout(req: FastifyRequest, reply: FastifyReply) {
    reply.clearCookie('token');
    return present(presenters.loggedOut, formatOf(req), { message: 'Logout successful' });
  }
}
