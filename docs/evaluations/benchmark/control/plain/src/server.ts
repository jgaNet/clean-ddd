import { createApplication } from './app';

const app = await createApplication();
await app.start();
process.stdout.write(`listening on ${app.address}/${app.apiPrefix}\n`);
