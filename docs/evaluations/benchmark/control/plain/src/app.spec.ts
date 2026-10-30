import { createApplication } from './app';

describe('the application', () => {
  it('starts, answers under its prefix, and stops', async () => {
    const app = await createApplication();
    await app.start(0);
    const response = await fetch(`${app.address}/${app.apiPrefix}/nothing-here`);
    expect(response.status).toBe(404);
    await app.stop();
  });
});
