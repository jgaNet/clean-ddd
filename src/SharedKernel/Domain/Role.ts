export enum Role {
  ADMIN = 'ADMIN',
  USER = 'USER',
  GUEST = 'GUEST',
}

export function isRole(value: unknown): value is Role {
  return Object.values(Role).includes(value as Role);
}
