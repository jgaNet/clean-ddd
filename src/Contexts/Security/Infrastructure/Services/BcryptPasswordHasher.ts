import bcrypt from 'bcryptjs';

import { IPasswordHasher } from '@Contexts/Security/Domain/Auth/Ports/IPasswordHasher';

export class BcryptPasswordHasher implements IPasswordHasher {
  constructor(private rounds: number = 10) {}

  hash(plain: string): Promise<string> {
    return bcrypt.hash(plain, this.rounds);
  }

  compare(plain: string, hash: string): Promise<boolean> {
    return bcrypt.compare(plain, hash);
  }
}
