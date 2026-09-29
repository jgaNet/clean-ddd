import superagent from 'superagent';

import { SETTINGS } from '@Bootstrap/Fastify/application.settings';
import { createApplication } from '@Bootstrap/Fastify/createApplication';

export interface TestApplication {
  /** Base URL of the API of this instance, e.g. http://127.0.0.1:53210/v1 */
  api: string;
  login(identifier: string, password: string): Promise<superagent.Response>;
  /** A superagent agent carrying the bearer token of that account. */
  agentAs(identifier: string, password: string): Promise<ReturnType<typeof superagent.agent>>;
  admin(): Promise<ReturnType<typeof superagent.agent>>;
  stop(): Promise<void>;
}

/**
 * Boots the real application in this process, on a free port, with fresh in-memory stores,
 * seeded with the administrator from the settings. Each end-to-end suite starts its own and
 * stops it afterwards, so suites neither share state nor depend on their order. The tests
 * still talk HTTP: what they prove is what a client would see.
 */
export async function startTestApplication(): Promise<TestApplication> {
  const app = await createApplication();
  await app.start(0);

  const api = `${app.address}/${SETTINGS.apiPrefix}`;
  const login = (identifier: string, password: string) =>
    superagent.post(`${api}/auth/login`).send({ identifier, password });
  const agentAs = async (identifier: string, password: string) =>
    superagent.agent().set('authorization', `Bearer ${(await login(identifier, password)).body.token}`);

  return {
    api,
    login,
    agentAs,
    admin: () => agentAs(SETTINGS.security.adminAccount.identifier, SETTINGS.security.adminAccount.password),
    stop: () => app.stop(),
  };
}
