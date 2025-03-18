export enum Role {
  ADMIN = 'admin',
  USER = 'user',
  GUEST = 'guest',
}

export function isRole(value: unknown): value is Role {
  return Object.values(Role).includes(value as Role);
}
