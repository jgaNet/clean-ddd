import superagent from 'superagent';

import { startTestApplication, TestApplication } from '@Bootstrap/Fastify/application.spec-helper';

let app: TestApplication;
let api: string;
beforeAll(async () => {
  app = await startTestApplication();
  api = app.api;
});
afterAll(() => app.stop());

const login = (identifier: string, password: string) =>
  superagent.post(`${api}/auth/login`).send({ identifier, password });

describe('Login', () => {
  it('should return a token for valid credentials', async () => {
    const res = await login('admin@admin.fr', 'admin');
    expect(res.status).toBe(200);
    expect(res.body.token).toEqual(expect.any(String));
  });

  it('should answer 401 for an unknown account', async () => {
    let status: number | undefined;
    await login('error@admin.fr', 'admin').catch(err => (status = err.status));
    expect(status).toBe(401);
  });

  it('should ignore a forged token', async () => {
    const forged = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWJqZWN0SWQiOiJ4Iiwic3ViamVjdFR5cGUiOiJhZG1pbiJ9.bad';
    let status: number | undefined;
    await superagent
      .get(`${api}/auth/me`)
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
    const res = await superagent.post(`${api}/auth/signup`).send({ identifier: 'admin@admin.fr', password: 'admin' });
    expect(res.status).toBe(202);
    expect(res.body.operationId).toEqual(expect.any(String));

    const operation = await adminAgent.get(`${api}/tracker/operations/${res.body.operationId}`);
    expect(operation.body.status).toBe('ERROR');
  });

  it('should create a pending account, validated by an admin', async () => {
    const res = await superagent.post(`${api}/auth/signup`).send({ identifier: 'user@user.fr', password: 'user' });
    expect(res.status).toBe(202);

    const operation = await adminAgent.get(`${api}/tracker/operations/${res.body.operationId}`);
    expect(operation.body.status).toBe('SUCCESS');
    const accountId = operation.body.result;

    const pending = await adminAgent.get(`${api}/auth/accounts/${accountId}`);
    expect(pending.body).toEqual({ id: accountId, email: 'user@user.fr', role: 'USER', status: 'PENDING' });

    // A pending account cannot sign in yet
    let refused: number | undefined;
    await login('user@user.fr', 'user').catch(err => (refused = err.status));
    expect(refused).toBe(401);

    await adminAgent.get(`${api}/auth/accounts/${accountId}/validate`);

    const active = await adminAgent.get(`${api}/auth/accounts/${accountId}`);
    expect(active.body).toEqual({ id: accountId, email: 'user@user.fr', role: 'USER', status: 'ACTIVE' });

    const accepted = await login('user@user.fr', 'user');
    expect(accepted.body.token).toEqual(expect.any(String));
  });
});

describe('What a bible must not do', () => {
  let adminAgent: ReturnType<typeof superagent.agent>;
  beforeEach(async () => {
    adminAgent = await app.admin();
  });

  it('never stores or serves the password of a sign-up', async () => {
    const res = await superagent
      .post(`${api}/auth/signup`)
      .send({ identifier: 'frank@user.fr', password: 'S3cret-Plaintext' });

    const operation = await adminAgent.get(`${api}/tracker/operations/${res.body.operationId}`);
    expect(operation.body).not.toHaveProperty('payload');
    expect(JSON.stringify(operation.body)).not.toContain('S3cret-Plaintext');
  });

  it("refuses an anonymous caller who validates by id at once with 401, as an administrator's command (ADR 39)", async () => {
    const signUp = await superagent.post(`${api}/auth/signup`).send({ identifier: 'grace@user.fr', password: 'grace' });
    const accountId = (await adminAgent.get(`${api}/tracker/operations/${signUp.body.operationId}`)).body.result;

    const attempt = await superagent.get(`${api}/auth/accounts/${accountId}/validate`).ok(() => true);
    expect(attempt.status).toBe(401);
    expect(attempt.body).toEqual({ message: expect.any(String) });

    const traced = await adminAgent.get(`${api}/tracker/operations`).query({ traceId: attempt.headers['x-trace-id'] });
    expect(traced.body).toEqual([]);
    expect((await adminAgent.get(`${api}/auth/accounts/${accountId}`)).body.status).toBe('PENDING');
  });

  it('lets anyone follow the emailed link: the token is its proof (API-CALLER-AT-TRANSPORT)', async () => {
    const attempt = await superagent.get(`${api}/auth/validate`).query({ validation_token: 'not-a-token' });
    expect(attempt.status).toBe(202);

    const operation = await adminAgent.get(`${api}/tracker/operations/${attempt.body.operationId}`);
    expect(operation.body).toMatchObject({ name: 'ValidateAccount', status: 'ERROR', error: { type: 'NotAllowed' } });
  });
});
