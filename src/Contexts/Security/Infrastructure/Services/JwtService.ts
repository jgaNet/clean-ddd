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
      return jwt.verify(token, this.config.secret) as TokenPayload;
    } catch (error) {
      return null;
    }
  }
}
