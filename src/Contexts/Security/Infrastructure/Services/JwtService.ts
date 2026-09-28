import { SignJWT, jwtVerify } from 'jose';

import { IJwtService, TokenPayload } from '@Contexts/Security/Domain/Auth/Ports/IJwtService';

export interface JwtConfig {
  secret: string;
  /** e.g. '24h', '15m' */
  expiresIn: string;
}

/** HS256 tokens signed with a shared secret. `verify` rejects a bad signature or an expired token. */
export class JwtService implements IJwtService {
  #key: Uint8Array;
  #expiresIn: string;

  constructor({ secret, expiresIn }: JwtConfig) {
    this.#key = new TextEncoder().encode(secret);
    this.#expiresIn = expiresIn;
  }

  sign(payload: TokenPayload): Promise<string> {
    return new SignJWT({ subjectId: payload.subjectId, subjectType: payload.subjectType })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime(this.#expiresIn)
      .sign(this.#key);
  }

  async verify(token: string): Promise<TokenPayload | null> {
    try {
      const { payload } = await jwtVerify(token, this.#key, { algorithms: ['HS256'] });
      const { subjectId, subjectType } = payload as Partial<TokenPayload>;
      if (!subjectId || !subjectType) return null;

      return { subjectId, subjectType };
    } catch {
      return null;
    }
  }
}
