export enum TokenTypes {
  VALIDATION = 'VALIDATION',
}

export function isTokenType(value: unknown): value is TokenTypes {
  return Object.values(TokenTypes).includes(value as TokenTypes);
}
