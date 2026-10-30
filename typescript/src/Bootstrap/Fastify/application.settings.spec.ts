import { adminAccountFrom } from '@Bootstrap/Fastify/application.settings';

describe('the administrator the application is seeded with', () => {
  it('exists only when both the identifier and the password are set', () => {
    expect(adminAccountFrom('root@example.com', 's3cret')).toEqual({
      identifier: 'root@example.com',
      password: 's3cret',
    });
    expect(adminAccountFrom(undefined, undefined)).toBeUndefined();
    expect(adminAccountFrom('root@example.com', undefined)).toBeUndefined();
    expect(adminAccountFrom(undefined, 's3cret')).toBeUndefined();
    expect(adminAccountFrom('', '')).toBeUndefined();
  });
});
