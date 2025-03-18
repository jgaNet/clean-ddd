export enum TokenTypes {
  USER = 'user',
  ADMIN = 'admin',
  VALIDATION = 'validation',
}

export function isTokenType(value: unknown): value is TokenTypes {
  return Object.values(TokenTypes).includes(value as TokenTypes);
}
