import { SETTINGS } from '@Bootstrap/Fastify/application.settings';
import superagent from 'superagent';

const login = (identifier: string, password: string) =>
  superagent.post(`${SETTINGS.apiUrl}/auth/login`).send({ identifier, password });

describe('Login', () => {
  it('should return a token for valid credentials', async () => {
    const res = await login('admin@admin.fr', 'admin');
    expect(res.status).toBe(200);
    expect(res.body.token).toEqual(expect.any(String));
  });

  it('should not return a token for an unknown account', async () => {
    const res = await login('error@admin.fr', 'admin');
    expect(res.body.token).toBeUndefined();
  });

  it('should ignore a forged token', async () => {
    const forged = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWJqZWN0SWQiOiJ4Iiwic3ViamVjdFR5cGUiOiJhZG1pbiJ9.bad';
    let status: number | undefined;
    await superagent
      .get(`${SETTINGS.apiUrl}/auth/me`)
      .set('authorization', `Bearer ${forged}`)
      .catch(err => (status = err.status));
    expect(status).toBe(401);
  });
});

describe('SignUp', () => {
  let adminAgent: ReturnType<typeof superagent.agent>;
  beforeEach(async () => {
    const res = await login('admin@admin.fr', 'admin');
    adminAgent = superagent.agent().set('authorization', `Bearer ${res.body.token}`);
  });

  it('should fail if account already exists', async () => {
    const res = await superagent
      .post(`${SETTINGS.apiUrl}/auth/signup`)
      .send({ identifier: 'admin@admin.fr', password: 'admin' });
    expect(res.status).toBe(200);
    expect(res.body.operationId).toEqual(expect.any(String));

    const operation = await adminAgent.get(`${SETTINGS.apiUrl}/tracker/operations/${res.body.operationId}`);
    expect(operation.body.status).toBe('ERROR');
  });

  it('should create a pending account, validated by an admin', async () => {
    const res = await superagent
      .post(`${SETTINGS.apiUrl}/auth/signup`)
      .send({ identifier: 'user@user.fr', password: 'user' });
    expect(res.status).toBe(200);

    const operation = await adminAgent.get(`${SETTINGS.apiUrl}/tracker/operations/${res.body.operationId}`);
    expect(operation.body.status).toBe('SUCCESS');
    const accountId = operation.body.result.data;

    const pending = await adminAgent.get(`${SETTINGS.apiUrl}/auth/accounts/${accountId}`);
    expect(pending.body).toEqual({ id: accountId, email: 'user@user.fr', role: 'user', status: 'pending' });

    // A pending account cannot sign in yet
    const refused = await login('user@user.fr', 'user');
    expect(refused.body.token).toBeUndefined();

    await adminAgent.get(`${SETTINGS.apiUrl}/auth/accounts/${accountId}/validate`);

    const active = await adminAgent.get(`${SETTINGS.apiUrl}/auth/accounts/${accountId}`);
    expect(active.body).toEqual({ id: accountId, email: 'user@user.fr', role: 'user', status: 'active' });

    const accepted = await login('user@user.fr', 'user');
    expect(accepted.body.token).toEqual(expect.any(String));
  });
});
