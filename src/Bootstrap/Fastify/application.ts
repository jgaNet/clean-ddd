#!/usr/bin/env node

import 'dotenv/config';

import { createApplication } from './createApplication';

// The process entry point: build the application and serve it. Everything else is in
// createApplication.ts, so that tests can build the same application without listening here.
try {
  const app = await createApplication();
  await app.run();
} catch (error) {
  // eslint-disable-next-line no-console
  console.error(error);
  process.exit(1);
}
