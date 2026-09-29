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
    expect(pending.body).toEqual({
      id: accountId,
      email: 'user@user.fr',
      role: 'USER',
      status: 'PENDING',
      plan: 'FREE',
    });

    // A pending account cannot sign in yet
    let refused: number | undefined;
    await login('user@user.fr', 'user').catch(err => (refused = err.status));
    expect(refused).toBe(401);

    await adminAgent.get(`${api}/auth/accounts/${accountId}/validate`);

    const active = await adminAgent.get(`${api}/auth/accounts/${accountId}`);
    expect(active.body).toEqual({
      id: accountId,
      email: 'user@user.fr',
      role: 'USER',
      status: 'ACTIVE',
      plan: 'FREE',
    });

    const accepted = await login('user@user.fr', 'user');
    expect(accepted.body.token).toEqual(expect.any(String));
  });
});

describe('Plans', () => {
  let adminAgent: ReturnType<typeof superagent.agent>;
  let accountId: string;
  let user: ReturnType<typeof superagent.agent>;
  beforeAll(async () => {
    adminAgent = await app.admin();
    // A fresh, validated account: heidi, on the free plan like every new account
    const signUp = await superagent.post(`${api}/auth/signup`).send({ identifier: 'heidi@user.fr', password: 'heidi' });
    accountId = (await adminAgent.get(`${api}/tracker/operations/${signUp.body.operationId}`)).body.result;
    await adminAgent.get(`${api}/auth/accounts/${accountId}/validate`);
    user = await app.agentAs('heidi@user.fr', 'heidi');
  });

  it('starts every account on the free plan, which its owner can see', async () => {
    const me = await user.get(`${api}/auth/me`);
    expect(me.body.plan).toBe('FREE');
  });

  it('lets an administrator put an account on the pro plan and see it', async () => {
    const res = await adminAgent.put(`${api}/auth/accounts/${accountId}/plan`).send({ plan: 'PRO' });
    expect(res.status).toBe(202);

    const operation = await adminAgent.get(`${api}/tracker/operations/${res.body.operationId}`);
    expect(operation.body.status).toBe('SUCCESS');

    const account = await adminAgent.get(`${api}/auth/accounts/${accountId}`);
    expect(account.body.plan).toBe('PRO');
  });

  it('does not let a user change a plan, not even their own', async () => {
    const attempt = await user.put(`${api}/auth/accounts/${accountId}/plan`).send({ plan: 'FREE' });
    expect(attempt.status).toBe(202);

    const operation = await adminAgent.get(`${api}/tracker/operations/${attempt.body.operationId}`);
    expect(operation.body).toMatchObject({ status: 'ERROR', error: { type: 'NotAllowed' } });
    expect((await adminAgent.get(`${api}/auth/accounts/${accountId}`)).body.plan).toBe('PRO');
  });

  it('refuses a plan that does not exist at the door', async () => {
    let status: number | undefined;
    await adminAgent
      .put(`${api}/auth/accounts/${accountId}/plan`)
      .send({ plan: 'PLATINUM' })
      .catch(err => (status = err.status));
    expect(status).toBe(400);
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

  it('does not let an anonymous caller validate an account', async () => {
    const signUp = await superagent.post(`${api}/auth/signup`).send({ identifier: 'grace@user.fr', password: 'grace' });
    const accountId = (await adminAgent.get(`${api}/tracker/operations/${signUp.body.operationId}`)).body.result;

    const attempt = await superagent.get(`${api}/auth/accounts/${accountId}/validate`);
    expect(attempt.status).toBe(202);

    const operation = await adminAgent.get(`${api}/tracker/operations/${attempt.body.operationId}`);
    expect(operation.body).toMatchObject({ status: 'ERROR', error: { type: 'NotAllowed' } });
    expect((await adminAgent.get(`${api}/auth/accounts/${accountId}`)).body.status).toBe('PENDING');
  });
});
