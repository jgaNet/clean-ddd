import { TokenTypes } from '@Contexts/Security/Domain/Auth/TokenTypes';

export interface TokenPayload {
  subjectId: string;
  subjectType: TokenTypes;
}

export interface IJwtService {
  sign(payload: TokenPayload): string;
  verify(token: string): TokenPayload | null;
}
