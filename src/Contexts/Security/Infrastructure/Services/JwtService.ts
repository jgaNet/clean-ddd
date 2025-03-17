import { IJwtService, TokenPayload } from '@Contexts/Security/Domain/Auth/Ports/IJwtService';
import jwt from 'jsonwebtoken';

export interface JwtConfig {
  secret: string;
  expiresIn: string;
}

export class JwtService implements IJwtService {
  constructor(private config: JwtConfig) {}

  sign(payload: TokenPayload): string {
    return jwt.sign(payload, this.config.secret);
  }

  verify(token: string): TokenPayload | null {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const decodedToken = jwt.verify(token, this.config.secret) as any;

      if (!decodedToken.subjectType) {
        throw new Error('Invalid token');
      }

      if (!decodedToken.subjectId) {
        throw new Error('Invalid token');
      }

      return {
        subjectId: decodedToken.subjectId,
        subjectType: decodedToken.subjectType,
      };
    } catch (error) {
      return null;
    }
  }
}
