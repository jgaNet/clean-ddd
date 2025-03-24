import { FastifyReply, FastifyRequest } from 'fastify';
import {
  BasicLoginReqBody,
  BasicSignUpReqBody,
} from '@Contexts/Security/Presentation/API/REST/Routes/auth.routes.schema';
import { LoginCommandEvent } from '@Contexts/Security/Application/Commands/Login/LoginCommandEvent';
import { SecurityModule } from '@Contexts/Security/Application';
import { LoginCommandHandler } from '@Contexts/Security/Application/Commands';
import { SignUpCommandEvent } from '@Contexts/Security/Application/Commands';
import * as bcrypt from 'bcryptjs';
import { ValidateAccountCommandEvent } from '@Contexts/Security/Application/Commands/ValidateAccount/ValidateAccountCommandEvent';
import { InvalidTokenException } from '@Contexts/Security/Domain/Auth/Exceptions/InvalidTokenException';
import { Role } from '@SharedKernel/Domain/AccessControl';
import { GetAccountQueryHandler } from '@Contexts/Security/Application/Queries/GetAccount/GetAccountQueryHandler';
import { NotAllowedException } from '@Contexts/@SharedKernel/Domain';

export class FastifyAuthController {
  #securityModule: SecurityModule;

  constructor({ module: SecurityModule }: { module: SecurityModule }) {
    this.#securityModule = SecurityModule;
  }

  async login(req: FastifyRequest<{ Body: BasicLoginReqBody }>, reply: FastifyReply) {
    try {
      const { identifier, password } = req.body as { identifier: string; password: string };

      // Create login command
      const loginCommand = LoginCommandEvent.set({ identifier, password });

      // Execute login command through the security module
      const loginResult = await (this.#securityModule.getCommand(LoginCommandEvent) as LoginCommandHandler).execute(
        loginCommand,
      );

      if (loginResult.isFailure()) {
        return reply.code(401).send({
          error: loginResult.error?.message,
        });
      }

      // Return token and user ID on successful login
      return {
        token: loginResult.data.token,
      };
    } catch (error) {
      return reply.code(500).send({
        error: error instanceof Error ? error.message : 'An error occurred during login',
      });
    }
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

  async validateAccountById(req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
    const context = req.executionContext;

    const operation = context.eventBus.publish(
      ValidateAccountCommandEvent.set({ subjectId: req.params.id, subjectType: Role.ADMIN }),
      context,
    );

    return reply.code(200).send({
      operationId: operation.id,
    });
  }

  async me(req: FastifyRequest, reply: FastifyReply) {
    try {
      const meResult = await this.#securityModule
        .getQuery(GetAccountQueryHandler)
        .executeWithContext(req.executionContext.auth.subjectId, req.executionContext);

      if (meResult.isFailure()) {
        throw meResult.error;
      }

      return meResult.data;
    } catch (error) {
      if (error instanceof NotAllowedException) {
        return reply.code(401).send({
          error: error.message,
        });
      }
      return reply.code(500).send({
        error: error instanceof Error ? error.message : 'An error occurred during login',
      });
    }
  }

  async getAccountById(req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
    try {
      const meResult = await this.#securityModule
        .getQuery(GetAccountQueryHandler)
        .executeWithContext(req.params.id, req.executionContext);

      if (meResult.isFailure()) {
        return reply.code(401).send({
          error: meResult.error?.message,
        });
      }

      return meResult.data;
    } catch (error) {
      if (error instanceof NotAllowedException) {
        return reply.code(401).send({
          error: error.message,
        });
      }
      return reply.code(500).send({
        error: error instanceof Error ? error.message : 'An error occurred during login',
      });
    }
  }
}
