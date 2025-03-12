import { FastifyRequest } from 'fastify';
import { IAccountQueries } from '@Contexts/Security/Domain/Account/Ports/IAccountQueries';
import jwt from 'jsonwebtoken';

import { Role } from '@Primitives';
import { AccountToken } from '@Contexts/Security/Domain/Account/AccountToken';

export class AuthenticationMiddleware {
  private accountQueries: IAccountQueries;

  constructor(accountQueries: IAccountQueries) {
    this.accountQueries = accountQueries;
  }

  /**
   * Extracts token from request headers
   */
  private extractToken(request: FastifyRequest): string | null {
    const authHeader = request.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) return null;
    return authHeader.substring(7); // Remove "Bearer " prefix
  }

  /**
   * Middleware to authenticate requests
   * - Extracts token from request
   * - Validates token and attaches user info to request
   * - Does not block requests but marks them as authenticated or not
   */
  authenticate() {
    return async (request: FastifyRequest): Promise<void> => {
      const token = this.extractToken(request);

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

        const account = await this.accountQueries.findBySubject(subjectId, subjectType);

        if (!account || !account.isActive) {
          request.auth = {
            subjectId: '',
            role: Role.GUEST,
          };
          return;
        }

        // In a real implementation, you would get the role from a user service or from token claims
        // For now, we'll use a hardcoded role of USER

        if (decodedToken.subjectType && decodedToken.subjectType === 'admin') {
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
