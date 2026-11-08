import { FastifyInstance } from 'fastify';

import { Module } from '@Architecture/Application';

import { FastifyLinkController } from '@Contexts/Links/Presentation/API/REST/Controllers/FastifyLinkController';
import {
  CommandResSchema,
  GetActivityResSchema,
  GetLinkResSchema,
  GetLinksResSchema,
  LinkIdParams,
  LinkIdParamsSchema,
  SaveLinkReqBody,
  SaveLinkReqBodySchema,
} from '@Contexts/Links/Presentation/API/REST/Routes/link.routes.schema';

export const linkRoutes = function (
  fastify: FastifyInstance,
  { linksModule }: { linksModule: Module },
  done: () => void,
) {
  const controller = new FastifyLinkController({ module: linksModule });

  fastify.post<{ Body: SaveLinkReqBody }>(
    '/',
    { schema: { body: SaveLinkReqBodySchema, response: CommandResSchema } },
    controller.saveLink.bind(controller),
  );
  fastify.get('/', { schema: { response: GetLinksResSchema } }, controller.getLinks.bind(controller));
  // A static segment under the context's prefix, so that it cannot collide with /:id.
  fastify.get('/activity', { schema: { response: GetActivityResSchema } }, controller.getActivity.bind(controller));
  fastify.get<{ Params: LinkIdParams }>(
    '/:id',
    { schema: { params: LinkIdParamsSchema, response: GetLinkResSchema } },
    controller.getLink.bind(controller),
  );
  fastify.post<{ Params: LinkIdParams }>(
    '/:id/archive',
    { schema: { params: LinkIdParamsSchema, response: CommandResSchema } },
    controller.archiveLink.bind(controller),
  );

  done();
};
