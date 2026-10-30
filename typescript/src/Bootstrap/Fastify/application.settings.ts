import { randomBytes } from 'crypto';

import packageJson from '../../../package.json' with { type: 'json' };

const protocol = String(process.env.PROTOCOL || 'http');
const baseUrl = String(process.env.BASE_URL || 'localhost');
const port = parseInt(process.env.PORT || '10000');
const apiPrefix = String(process.env.API_PREFIX || 'v1');

/**
 * The administrator the application is seeded with: only when both are set, never a default, since
 * known credentials would open every deployment that forgot them, as a fixed token secret would.
 */
export function adminAccountFrom(identifier?: string, password?: string) {
  return identifier && password ? { identifier, password } : undefined;
}

export const SETTINGS = {
  name: packageJson.name,
  env: String(process.env.ENV || 'dev'),
  version: packageJson.version,
  protocol,
  baseUrl,
  apiPrefix,
  port,
  url: `${protocol}://${baseUrl}:${port}`,
  apiUrl: `${protocol}://${baseUrl}:${port}/${apiPrefix}`,
  swaggerUi: {
    active: true,
    routePrefix: `/${apiPrefix}/docs`,
    exposeRoute: true,
  },
  security: {
    jwt: {
      // Without JWT_SECRET, a secret drawn at random for this process, never a fixed string: a fixed
      // fallback signs tokens anyone who reads this file can forge, and it gets copied (the phase-4
      // control found an agent's application doing so). Tokens then do not survive a restart.
      secret: process.env.JWT_SECRET || randomBytes(32).toString('hex'),
      expiresIn: process.env.JWT_EXPIRES_IN || '24h',
    },
    adminAccount: adminAccountFrom(process.env.ADMIN_IDENTIFIER, process.env.ADMIN_PASSWORD),
  },
  /** The origins a front end may call the API from (CORS); none: same-origin clients only. */
  webOrigins: String(process.env.WEB_ORIGINS || '')
    .split(',')
    .filter(Boolean),
  logger: {
    debug: false,
  },
};
