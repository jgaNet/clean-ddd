#!/usr/bin/env node

import 'dotenv/config';

import { ConsoleLogger } from '@Architecture/Infrastructure/Logging/ConsoleLogger';

import { SETTINGS } from './application.settings';
import { createApplication } from './createApplication';

// The process entry point: build the application and serve it. Everything else is in
// createApplication.ts, so that tests can build the same application without listening here.
const logger = new ConsoleLogger({ debug: SETTINGS.logger.debug });

try {
  const app = await createApplication(logger);
  await app.start();
} catch (error) {
  logger.error('The application could not start', error);
  process.exit(1);
}
