import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

import { Exception } from '@Architecture/Domain';
import { awaitOperation, hasOutcome, Module } from '@Architecture/Application';

import { ArchiveLinkCommandEvent, SaveLinkCommandEvent } from '@Contexts/Links/Application/Commands';
import {
  GetActivityQueryHandler,
  GetLinkQueryHandler,
  GetLinksQueryHandler,
} from '@Contexts/Links/Application/Queries';

/**
 * The compatibility wire (ADR 35): linkbox's routes as its clients speak them, served while they
 * move to the contract's grammar. Each route is declared in conventions/typescript.yaml under
 * `migration`, bound to the one command or query it stands for. A command is published as a
 * controller publishes it, its outcome awaited, and the legacy's answer built from the read
 * model; a refusal is mapped from the rule's name to the legacy's status and sentence. Past the
 * deadline, the answer is the contract's: `202 { operationId }`, followed at the Tracker.
 *
 * Nothing here decides anything: the rules are the aggregate's, the shapes are the read model's,
 * and this file goes away with the last legacy client.
 */

/** The legacy's refusals, by the name of the rule that now refuses. */
const LEGACY_REFUSALS: Record<string, [number, string]> = {
  BlankLinkTitle: [400, 'title is required'],
  LinkTitleTooLong: [400, 'title is too long (80 characters at most)'],
  InvalidLinkUrl: [400, 'url must start with http:// or https://'],
  LinkNotFound: [404, 'link not found'],
  LinkAlreadyArchived: [409, 'link is already archived'],
};

const refuse = (reply: FastifyReply, error: Exception) => {
  const [status, message] = LEGACY_REFUSALS[error.type] ?? [400, error.message];
  reply.code(status);
  return { error: message };
};

export const legacyRoutes = function (
  fastify: FastifyInstance,
  { linksModule }: { linksModule: Module },
  done: () => void,
) {
  /** The legacy read a field as a string or treated it as missing; the domain then refuses what is missing. */
  const asString = (value: unknown) => (typeof value === 'string' ? value : '');

  const readLink = async (req: FastifyRequest, reply: FastifyReply, id: string, status: number) => {
    const result = await linksModule.getQuery(GetLinkQueryHandler).handle(id, req.executionContext);
    if (result.isFailure()) return refuse(reply, result.error);
    reply.code(status);
    return result.data;
  };

  fastify.post<{ Body: { url?: unknown; title?: unknown } }>('/links', async (req, reply) => {
    const body = req.body ?? {};
    const command = SaveLinkCommandEvent.set({ url: asString(body.url), title: asString(body.title) });
    const operation = await awaitOperation(req.executionContext.eventBus.publish(command, req.executionContext));
    if (!hasOutcome(operation)) return reply.code(202).send({ operationId: operation.id });
    if (operation.result?.isFailure()) return refuse(reply, operation.result.error);
    return readLink(req, reply, operation.result?.data as string, 201);
  });

  fastify.get('/links', async (req, reply) => {
    const result = await linksModule.getQuery(GetLinksQueryHandler).handle(undefined, req.executionContext);
    return result.isFailure() ? refuse(reply, result.error) : result.data;
  });

  fastify.get<{ Params: { id: string } }>('/links/:id', (req, reply) => readLink(req, reply, req.params.id, 200));

  fastify.post<{ Params: { id: string } }>('/links/:id/archive', async (req, reply) => {
    const command = ArchiveLinkCommandEvent.set({ linkId: req.params.id });
    const operation = await awaitOperation(req.executionContext.eventBus.publish(command, req.executionContext));
    if (!hasOutcome(operation)) return reply.code(202).send({ operationId: operation.id });
    if (operation.result?.isFailure()) return refuse(reply, operation.result.error);
    return readLink(req, reply, req.params.id, 200);
  });

  fastify.get('/activity', async (req, reply) => {
    const result = await linksModule.getQuery(GetActivityQueryHandler).handle(undefined, req.executionContext);
    return result.isFailure() ? refuse(reply, result.error) : result.data;
  });

  done();
};
