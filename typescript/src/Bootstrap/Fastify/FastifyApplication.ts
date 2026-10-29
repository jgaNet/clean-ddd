import { v4 as uuidv4 } from 'uuid';
import { AddressInfo } from 'net';

import Fastify, {
  FastifyError,
  FastifyInstance,
  FastifyPluginCallback,
  FastifyPluginOptions,
  FastifyRequest,
} from 'fastify';
import fastifyCors from '@fastify/cors';

import { Role } from '@SharedKernel/Domain';
import { Application, ExecutionContext, Logger } from '@Architecture/Application';
import { formatOf } from '@Architecture/Presentation/Format';
import { InMemoryUnitOfWork } from '@Architecture/Infrastructure/UnitOfWork/InMemoryUnitOfWork';

const ANONYMOUS = { subjectId: '', role: Role.GUEST };

export interface FastifyApplicationOptions {
  logger: Logger;
  /** Every route is served under it: `v1` serves `/notes` at `/v1/notes`. */
  apiPrefix: string;
  /** The port `start()` listens on when it is given none; 0 asks the OS for a free one. */
  port?: number;
  /** The origins a front end may call the API from (CORS); none: same-origin clients only. */
  webOrigins?: string[];
  /**
   * Says who is calling, by setting `request.auth`; the context that owns accounts provides it.
   * Without one, every caller is anonymous.
   */
  authenticate?(request: FastifyRequest): Promise<void>;
}

/**
 * The transport, and nothing of the business: a Fastify server that gives each request its
 * identity and its ExecutionContext, serves the routes it is given under one prefix, and
 * listens. It names no context; a composition root (createApplication.ts) builds one, sets the
 * bus, registers the modules and the routes, and starts it.
 */
export class FastifyApplication extends Application {
  readonly fastify: FastifyInstance;
  readonly logger: Logger;
  readonly apiPrefix: string;
  readonly port: number;

  constructor({ logger, apiPrefix, port = 0, webOrigins = [], authenticate }: FastifyApplicationOptions) {
    super();
    this.logger = logger;
    this.apiPrefix = apiPrefix;
    this.port = port;
    this.fastify = Fastify({ logger: false });

    // Anonymous until the authentication says otherwise; without one, anonymous throughout.
    this.fastify.addHook('onRequest', async request => {
      request.auth = ANONYMOUS;
      await authenticate?.(request);
    });

    // One execution context per request: its trace, its caller, and its own unit of work.
    // A unit of work is a request-scoped thing; sharing one instance across requests would
    // make concurrent commands join each other's transaction.
    this.fastify.addHook('preHandler', (request, reply, done) => {
      const traceId = (request.headers['x-trace-id'] as string) || uuidv4();

      request.executionContext = new ExecutionContext({
        traceId,
        auth: { subjectId: request.auth.subjectId, role: request.auth.role },
        eventBus: this.getEventBus(),
        unitOfWork: new InMemoryUnitOfWork(),
        logger: this.logger,
      });

      reply.header('x-trace-id', traceId);
      done();
    });

    // An HTMX answer is an HTML fragment; Fastify would label a string text/plain.
    this.fastify.addHook('onSend', async (request, reply, payload) => {
      const contentType = String(reply.getHeader('content-type') ?? '');
      if (formatOf(request) === 'htmx' && typeof payload === 'string' && contentType.startsWith('text/plain')) {
        reply.type('text/html; charset=utf-8');
      }
      return payload;
    });
    // The front end is a client like any other, served from wherever: a page on another origin
    // calls the API with a bearer token, never a cookie, and CORS lets it, for the origins given.
    if (webOrigins.length > 0) {
      this.fastify.register(fastifyCors, {
        origin: webOrigins,
        methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
        allowedHeaders: [
          'authorization',
          'content-type',
          'hx-request',
          'hx-target',
          'hx-trigger',
          'hx-current-url',
          'hx-boosted',
          'hx-push-url',
        ],
        exposedHeaders: ['x-trace-id'],
      });
    }
    // Only programming errors and schema violations get here: expected failures are Results.
    this.fastify.setErrorHandler((error: FastifyError, req, reply) => {
      const format = req.headers['hx-request'] ? 'htmx' : 'json';
      if (format === 'htmx') {
        return reply.code(error.statusCode || 500).send(`<div>${error.message}</div>`);
      }
      return reply.code(error.statusCode || 500).send(error);
    });
  }

  /** A context's routes, under `/<apiPrefix><prefix>`; `/` serves them at the prefix itself. */
  registerRoutes<Options extends FastifyPluginOptions>(
    prefix: string,
    routes: FastifyPluginCallback<Options>,
    options: Options,
  ): this {
    this.fastify.register(routes, {
      prefix: prefix === '/' ? `/${this.apiPrefix}` : `/${this.apiPrefix}${prefix}`,
      ...options,
    });
    return this;
  }

  /** Listens. Port 0 asks the OS for a free one (tests); `address` then says which. */
  async start(port: number = this.port): Promise<void> {
    await this.fastify.listen({ port, host: '127.0.0.1' });
    await this.fastify.ready();
    this.logger.info(`Listening on ${this.address}`);
  }

  async stop(): Promise<void> {
    await this.fastify.close();
  }

  get address(): string {
    const { address, port } = this.fastify.server.address() as AddressInfo;
    return `http://${address}:${port}`;
  }
}
