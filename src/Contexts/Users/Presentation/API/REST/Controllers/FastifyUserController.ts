import { FastifyReply, FastifyRequest } from 'fastify';
import { CreateUserReqBody } from '@Contexts/Users/Presentation/API/REST/Routes/user.routes.schema';
import { CreateUserCommandEvent } from '@Contexts/Users/Application/Commands/CreateUser/CreateUserCommandEvent';
import { UsersModuleQueries } from '@Contexts/Users/Application/DTOs';
import { GetUsersQueryHandler } from '@Contexts/Users/Application/Queries/GetUsers/GetUsersQueryHandler';

export class FastifyUserController {
  #queries: UsersModuleQueries;

  constructor({ queries: ModuleQueries }: { queries: UsersModuleQueries }) {
    this.#queries = ModuleQueries;
  }

  async createUser(req: FastifyRequest<{ Body: CreateUserReqBody }>, reply: FastifyReply) {
    try {
      // Get the execution context from the request
      const context = req.executionContext;

      // Log the operation start using the context
      context.logger?.info('Creating a new user', {
        traceId: context.traceId,
        email: req.body.email,
      });

      // Create and dispatch the command using the context's event bus
      const operation = context.eventBus.dispatch(
        new CreateUserCommandEvent({
          profile: {
            email: req.body.email,
            nickname: req.body.nickname,
          },
        }),
        context,
      );

      // Log the operation ID
      context.logger?.info('Operation created', {
        operationId: operation.id,
      });

      reply.code(202);
      return {
        currentOperation: operation,
      };
    } catch (e) {
      // Log the error using the context
      req.executionContext.logger?.error('Error creating user', e, {
        traceId: req.executionContext.traceId,
        email: req.body.email,
      });

      reply.code(400);
      return e;
    }
  }

  async getUsers(req: FastifyRequest, reply: FastifyReply) {
    try {
      // Get the execution context from the request
      const context = req.executionContext;

      // Log the operation
      context.logger?.info('Fetching all users', {
        traceId: context.traceId,
      });

      // Get the query handler
      const query = this.#queries.find(q => q.name == GetUsersQueryHandler.name) as { handler: GetUsersQueryHandler };

      // Execute the query with context
      const result = await query?.handler.executeWithContext(undefined, context);

      if (result?.isFailure()) {
        throw result.error;
      }

      return result?.data;
    } catch (e) {
      // Log the error
      req.executionContext.logger?.error('Error fetching users', e, {
        traceId: req.executionContext.traceId,
      });

      reply.code(400);
      return e;
    }
  }
}
