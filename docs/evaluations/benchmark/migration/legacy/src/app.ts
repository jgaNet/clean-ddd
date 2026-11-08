import { randomUUID } from 'crypto';
import Fastify, { FastifyInstance } from 'fastify';

/**
 * linkbox, as it has been running for two years: a list of links with an activity feed. One
 * file, a Map for a database, the rules where the requests arrive. Every answer is synchronous:
 * a POST answers the thing it made or changed, and a refusal is a status code with `{ error }`.
 * The mobile application and two scripts speak this wire, and none of them can change this month.
 */

export interface Link {
  id: string;
  url: string;
  title: string;
  archived: boolean;
  createdAt: string;
}

export interface Activity {
  type: 'link.saved' | 'link.archived';
  linkId: string;
  title: string;
  at: string;
}

export interface Application {
  readonly server: FastifyInstance;
  readonly apiPrefix: string;
  readonly address: string;
  start(port?: number): Promise<void>;
  stop(): Promise<void>;
}

const TITLE_MAX = 80;

export async function createApplication({
  apiPrefix = process.env.API_PREFIX || 'v1',
  port = Number(process.env.PORT || 10000),
  now = () => new Date(),
}: { apiPrefix?: string; port?: number; now?: () => Date } = {}): Promise<Application> {
  const links = new Map<string, Link>();
  const activity: Activity[] = [];
  const server = Fastify();

  const newestFirst = <T extends { createdAt?: string; at?: string }>(items: T[]) => [...items].reverse(); // inserted in order; the newest was inserted last

  await server.register(
    async api => {
      api.post<{ Body: { url?: unknown; title?: unknown } }>('/links', async (request, reply) => {
        const body = request.body ?? {};
        const title = typeof body.title === 'string' ? body.title.trim() : '';
        if (!title) return reply.code(400).send({ error: 'title is required' });
        if (title.length > TITLE_MAX) {
          return reply.code(400).send({ error: `title is too long (${TITLE_MAX} characters at most)` });
        }
        const url = typeof body.url === 'string' ? body.url : '';
        if (!/^https?:\/\//.test(url)) {
          return reply.code(400).send({ error: 'url must start with http:// or https://' });
        }
        const link: Link = { id: randomUUID(), url, title, archived: false, createdAt: now().toISOString() };
        links.set(link.id, link);
        activity.push({ type: 'link.saved', linkId: link.id, title: link.title, at: link.createdAt });
        return reply.code(201).send(link);
      });

      api.get('/links', async () => newestFirst([...links.values()].filter(link => !link.archived)));

      api.get<{ Params: { id: string } }>('/links/:id', async (request, reply) => {
        const link = links.get(request.params.id);
        return link ?? reply.code(404).send({ error: 'link not found' });
      });

      api.post<{ Params: { id: string } }>('/links/:id/archive', async (request, reply) => {
        const link = links.get(request.params.id);
        if (!link) return reply.code(404).send({ error: 'link not found' });
        if (link.archived) return reply.code(409).send({ error: 'link is already archived' });
        link.archived = true;
        activity.push({ type: 'link.archived', linkId: link.id, title: link.title, at: now().toISOString() });
        return link;
      });

      api.get('/activity', async () => newestFirst(activity));
    },
    { prefix: `/${apiPrefix}` },
  );

  let address = '';
  return {
    server,
    apiPrefix,
    get address() {
      return address;
    },
    async start(listenOn = port) {
      address = await server.listen({ port: listenOn, host: '127.0.0.1' });
    },
    async stop() {
      await server.close();
    },
  };
}
