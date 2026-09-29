import { FastifyRequest } from 'fastify';

import { Role, isRole } from '@SharedKernel/Domain';

import { IAccountQueries } from '@Contexts/Security/Domain/Account/Ports/IAccountQueries';
import { IJwtService } from '@Contexts/Security/Domain/Auth/Ports/IJwtService';
import { AccountStatus } from '@Contexts/Security/Domain/Account/AccountStatus';

const GUEST = { subjectId: '', role: Role.GUEST };

/**
 * Identifies the caller of every request. It never blocks: a missing or bad token simply
 * makes the request anonymous (GUEST), and each handler's guard decides what a guest may do.
 *
 * A token is accepted only if its signature and expiry check out (IJwtService.verify), the
 * account still exists and is active, and the role it claims is the account's current role.
 */
export class AuthenticationMiddleware {
  constructor(
    private accountQueries: IAccountQueries,
    private jwtService: IJwtService,
  ) {}

  authenticate() {
    return async (request: FastifyRequest<{ Querystring: { token?: string } }>): Promise<void> => {
      request.auth = GUEST;

      const token = this.tokenFromCookie(request) || this.tokenFromHeader(request) || request.query?.token;
      if (!token) return;

      const claims = await this.jwtService.verify(token);
      if (!claims || !isRole(claims.subjectType)) return; // validation tokens do not sign anyone in

      const account = await this.accountQueries.findById(claims.subjectId);
      if (!account || account.status !== AccountStatus.ACTIVE || account.role !== claims.subjectType) return;

      request.auth = { subjectId: account.id, role: account.role };
    };
  }

  private tokenFromHeader(request: FastifyRequest): string | undefined {
    const header = request.headers.authorization;
    return header?.startsWith('Bearer ') ? header.slice('Bearer '.length) : undefined;
  }

  private tokenFromCookie(request: FastifyRequest): string | undefined {
    const cookie = request.headers.cookie;
    if (!cookie) return undefined;

    const pair = cookie.split(/\s*;\s*/).find(part => part.startsWith('token='));
    return pair ? pair.slice('token='.length) : undefined;
  }
}
