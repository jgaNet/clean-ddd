import { FastifyReply, FastifyRequest } from 'fastify';

import { Event, Exception, NotAllowedException } from '@Architecture/Domain';
import { Module } from '@Architecture/Application';

import { LinkNotFoundException } from '@Contexts/Links/Domain/Link/LinkExceptions';
import { ArchiveLinkCommandEvent, SaveLinkCommandEvent } from '@Contexts/Links/Application/Commands';
import {
  GetActivityQueryHandler,
  GetLinkQueryHandler,
  GetLinksQueryHandler,
} from '@Contexts/Links/Application/Queries';
import { LinkIdParams, SaveLinkReqBody } from '@Contexts/Links/Presentation/API/REST/Routes/link.routes.schema';

/** The contract's grammar: a command is accepted (202) and followed at the Tracker; a query answers at once. */
export class FastifyLinkController {
  #links: Module;

  constructor({ module }: { module: Module }) {
    this.#links = module;
  }

  async saveLink(req: FastifyRequest<{ Body: SaveLinkReqBody }>, reply: FastifyReply) {
    return this.accept(req, reply, SaveLinkCommandEvent.set({ url: req.body.url, title: req.body.title }));
  }

  async archiveLink(req: FastifyRequest<{ Params: LinkIdParams }>, reply: FastifyReply) {
    return this.accept(req, reply, ArchiveLinkCommandEvent.set({ linkId: req.params.id }));
  }

  async getLinks(req: FastifyRequest, reply: FastifyReply) {
    const result = await this.#links.getQuery(GetLinksQueryHandler).handle(undefined, req.executionContext);
    return result.isFailure() ? this.refuse(reply, result.error) : result.data;
  }

  async getLink(req: FastifyRequest<{ Params: LinkIdParams }>, reply: FastifyReply) {
    const result = await this.#links.getQuery(GetLinkQueryHandler).handle(req.params.id, req.executionContext);
    return result.isFailure() ? this.refuse(reply, result.error) : result.data;
  }

  async getActivity(req: FastifyRequest, reply: FastifyReply) {
    const result = await this.#links.getQuery(GetActivityQueryHandler).handle(undefined, req.executionContext);
    return result.isFailure() ? this.refuse(reply, result.error) : result.data;
  }

  private accept(req: FastifyRequest, reply: FastifyReply, command: Event<unknown>) {
    const operation = req.executionContext.eventBus.publish(command, req.executionContext);
    reply.code(202);
    return { operationId: operation.id };
  }

  private refuse(reply: FastifyReply, error: Exception) {
    if (error instanceof NotAllowedException) reply.code(403);
    else if (error instanceof LinkNotFoundException) reply.code(404);
    else reply.code(400);
    return { message: error.message };
  }
}
