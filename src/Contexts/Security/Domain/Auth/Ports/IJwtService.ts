import { TokenTypes } from '@Contexts/Security/Domain/Auth/TokenTypes';
import { Role } from '@Contexts/@SharedKernel/Domain';

export interface TokenPayload {
  subjectId: string;
  subjectType: TokenTypes | Role;
}

export interface IJwtService {
  sign(payload: TokenPayload): string;
  verify(token: string): TokenPayload | null;
}
