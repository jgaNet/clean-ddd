import superagent from 'superagent';

import { startTestApplication, TestApplication } from '@Bootstrap/Fastify/application.spec-helper';

// One application for the whole suite, shared by its tests in order: carol is signed up once and
// her plan changes as the cases go; each case is written relative to what the earlier ones left.
let app: TestApplication;
let api: string;
let admin: ReturnType<typeof superagent.agent>;
let carol: ReturnType<typeof superagent.agent>;
let carolId: string;

beforeAll(async () => {
  app = await startTestApplication();
  api = app.api;
  admin = await app.admin();

  const signUp = await superagent
    .post(`${api}/auth/signup`)
    .send({ identifier: 'carol@billing.fr', password: 'carol' });
  carolId = (await admin.get(`${api}/tracker/operations/${signUp.body.operationId}`)).body.result;
  await admin.get(`${api}/auth/accounts/${carolId}/validate`);
  carol = await app.agentAs('carol@billing.fr', 'carol');
});
afterAll(() => app.stop());

const operation = async (operationId: string) => (await admin.get(`${api}/tracker/operations/${operationId}`)).body;

describe('GET billing/accounts/:accountId/plan', () => {
  it('answers the free plan for an account nobody touched', async () => {
    const res = await admin.get(`${api}/billing/accounts/${carolId}/plan`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ accountId: carolId, plan: 'FREE' });
  });

  it('lets an account read its own plan, and no one else’s', async () => {
    const own = await carol.get(`${api}/billing/accounts/${carolId}/plan`);
    expect(own.body).toEqual({ accountId: carolId, plan: 'FREE' });

    let status: number | undefined;
    await carol.get(`${api}/billing/accounts/someone-else/plan`).catch(err => (status = err.status));
    expect(status).toBe(403);
  });

  it('refuses an anonymous caller', async () => {
    let status: number | undefined;
    await superagent.get(`${api}/billing/accounts/${carolId}/plan`).catch(err => (status = err.status));
    expect(status).toBe(403);
  });
});

describe('PUT billing/accounts/:accountId/plan', () => {
  it('lets an administrator put an account on the pro plan', async () => {
    const res = await admin.put(`${api}/billing/accounts/${carolId}/plan`).send({ plan: 'PRO' });
    expect(res.status).toBe(202);
    expect((await operation(res.body.operationId)).status).toBe('SUCCESS');

    const plan = await admin.get(`${api}/billing/accounts/${carolId}/plan`);
    expect(plan.body).toEqual({ accountId: carolId, plan: 'PRO' });
  });

  it('refuses the plan the account is already on, on the operation', async () => {
    const res = await admin.put(`${api}/billing/accounts/${carolId}/plan`).send({ plan: 'PRO' });
    expect(res.status).toBe(202);
    expect(await operation(res.body.operationId)).toMatchObject({ status: 'ERROR', error: { type: 'AlreadyOnPlan' } });
  });

  it('refuses a user, even for their own account', async () => {
    const res = await carol.put(`${api}/billing/accounts/${carolId}/plan`).send({ plan: 'FREE' });
    expect(res.status).toBe(202);
    expect(await operation(res.body.operationId)).toMatchObject({ status: 'ERROR', error: { type: 'NotAllowed' } });

    expect((await admin.get(`${api}/billing/accounts/${carolId}/plan`)).body.plan).toBe('PRO');
  });

  it('refuses an account that does not exist, through the port to Security', async () => {
    const res = await admin
      .put(`${api}/billing/accounts/00000000-0000-4000-8000-000000000000/plan`)
      .send({ plan: 'PRO' });
    expect(res.status).toBe(202);
    expect(await operation(res.body.operationId)).toMatchObject({ status: 'ERROR', error: { type: 'UnknownAccount' } });
  });

  it('rejects a value that is not a plan at the door', async () => {
    let status: number | undefined;
    await admin
      .put(`${api}/billing/accounts/${carolId}/plan`)
      .send({ plan: 'GOLD' })
      .catch(err => (status = err.status));
    expect(status).toBe(400);
  });
});
