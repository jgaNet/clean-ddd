import { FastifyRequest } from 'fastify';

import { IAccountQueries } from '@Contexts/Security/Domain/Account/Ports/IAccountQueries';
import { Role } from '@SharedKernel/Domain/AccessControl';
import { AccountToken } from '@Contexts/Security/Domain/Account/AccountToken';

import jwt from 'jsonwebtoken';

export class AuthenticationMiddleware {
  private accountQueries: IAccountQueries;

  constructor(accountQueries: IAccountQueries) {
    this.accountQueries = accountQueries;
  }

  /**
   * Extracts token from request headers
   */
  private extractTokenFromHeader(request: FastifyRequest): string | null {
    const authHeader = request.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) return null;
    return authHeader.substring(7); // Remove "Bearer " prefix
  }

  private extractTokenFromQueryParams(request: FastifyRequest<{ Querystring: { token?: string } }>): string | null {
    const token = request.query?.token;
    if (!token) return null;
    return token;
  }

  private parseCookie(cookie: string | null): Record<string, string> | null {
    if (!cookie) return null;
    const output: Record<string, string> = {};
    cookie.split(/\s*;\s*/).forEach(function (pair: string | string[]) {
      if (typeof pair === 'string') {
        pair = pair.split(/\s*=\s*/);
        output[pair[0]] = pair.splice(1).join('=');
      }
    });

    return output;
  }

  private extractTokenFromCookie(request: FastifyRequest): string | null {
    if (!request.headers.cookie) return null;
    const token = this.parseCookie(request.headers.cookie)?.token;
    if (!token) return null;
    return token;
  }

  /**
   * Middleware to authenticate requests
   * - Extracts token from request
   * - Validates token and attaches user info to request
   * - Does not block requests but marks them as authenticated or not
   */
  authenticate() {
    return async (request: FastifyRequest<{ Querystring: { token?: string } }>): Promise<void> => {
      const token =
        this.extractTokenFromCookie(request) ||
        this.extractTokenFromHeader(request) ||
        this.extractTokenFromQueryParams(request);

      if (!token) {
        // No token, continue as guest
        request.auth = {
          subjectId: '',
          role: Role.GUEST,
        };
        return;
      }

      const decodedToken = jwt.decode(token) as AccountToken;
      if (!decodedToken) {
        request.auth = {
          subjectId: '',
          role: Role.GUEST,
        };

        return;
      }

      try {
        const subjectId = decodedToken.subjectId?.toString();
        const subjectType = decodedToken.subjectType?.toString();

        if (!subjectId) {
          request.auth = {
            subjectId: '',
            role: Role.GUEST,
          };
          return;
        }

        const account = await this.accountQueries.findById(subjectId);

        if (!account || !account.isActive) {
          request.auth = {
            subjectId: '',
            role: Role.GUEST,
          };
          return;
        }

        if (account?.subjectType !== subjectType) {
          request.auth = {
            subjectId: '',
            role: Role.GUEST,
          };
          return;
        }
        // In a real implementation, you would get the role from a user service or from token claims
        // For now, we'll use a hardcoded role of USER

        if (decodedToken.subjectType && decodedToken.subjectType === Role.ADMIN) {
          request.auth = {
            subjectId: subjectId,
            role: Role.ADMIN,
          };

          return;
        }

        request.auth = {
          subjectId: subjectId,
          role: Role.USER,
        };
      } catch (error) {
        // Token validation failed, continue as guest
        request.auth = {
          subjectId: '',
          role: Role.GUEST,
        };
      }
    };
  }
}
