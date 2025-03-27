import { FastifyReply, FastifyRequest } from 'fastify';
import { SecurityModule } from '@Contexts/Security/Application';
import { ValidateAccountCommandEvent } from '@Contexts/Security/Application/Commands/ValidateAccount/ValidateAccountCommandEvent';
import { Role } from '@SharedKernel/Domain/AccessControl';
import { GetAccountQueryHandler } from '@Contexts/Security/Application/Queries/GetAccount/GetAccountQueryHandler';
import { NotAllowedException } from '@Contexts/@SharedKernel/Domain';

export class FastifyAccountController {
  #securityModule: SecurityModule;

  constructor({ module: SecurityModule }: { module: SecurityModule }) {
    this.#securityModule = SecurityModule;
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
}
