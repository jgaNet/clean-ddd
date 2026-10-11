/**
 * Hashing is a technical concern with a business meaning ("is this the right password?").
 * The port keeps the algorithm out of the domain and the application layer; the
 * infrastructure provides it (BcryptPasswordHasher), tests provide a fake.
 */
export interface IPasswordHasher {
  hash(plain: string): Promise<string>;
  compare(plain: string, hash: string): Promise<boolean>;
}
