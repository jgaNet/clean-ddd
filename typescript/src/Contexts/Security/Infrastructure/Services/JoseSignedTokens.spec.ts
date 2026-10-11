import { Role } from '@SharedKernel/Domain';

import { JoseSignedTokens } from '@Contexts/Security/Infrastructure/Services/JoseSignedTokens';

describe('JoseSignedTokens', () => {
  const service = new JoseSignedTokens({ secret: 'test-secret', expiresIn: '1h' });

  it('issues a token and verifies it back', async () => {
    const token = await service.issue({ subjectId: 'account-1', subjectType: Role.USER });

    expect(await service.verify(token)).toEqual({ subjectId: 'account-1', subjectType: Role.USER });
  });

  it('rejects a token signed with another secret', async () => {
    const token = await new JoseSignedTokens({ secret: 'other', expiresIn: '1h' }).issue({
      subjectId: 'account-1',
      subjectType: Role.ADMIN,
    });

    expect(await service.verify(token)).toBeNull();
  });

  it('rejects a tampered token', async () => {
    const token = await service.issue({ subjectId: 'account-1', subjectType: Role.USER });
    const [header, , signature] = token.split('.');
    const forgedPayload = Buffer.from(JSON.stringify({ subjectId: 'account-1', subjectType: Role.ADMIN })).toString(
      'base64url',
    );

    expect(await service.verify(`${header}.${forgedPayload}.${signature}`)).toBeNull();
  });

  it('rejects an expired token', async () => {
    const token = await new JoseSignedTokens({ secret: 'test-secret', expiresIn: '-1s' }).issue({
      subjectId: 'account-1',
      subjectType: Role.USER,
    });

    expect(await service.verify(token)).toBeNull();
  });
});
