export interface TokenPayload {
  subjectId: string;
  subjectType: string;
}

export interface IJwtService {
  sign(payload: TokenPayload): string;
  verify(token: string): TokenPayload | null;
}
