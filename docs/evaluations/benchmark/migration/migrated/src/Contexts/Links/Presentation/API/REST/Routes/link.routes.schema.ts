const AcceptedResSchema = {
  description: 'Accepted: the command is being processed, follow the operation to know its outcome',
  type: 'object',
  properties: { operationId: { type: 'string', format: 'uuid' } },
} as const;

const ErrorResSchema = {
  type: 'object',
  properties: { message: { type: 'string' } },
} as const;

/** A link, as a client sees it: the shape the legacy answered. */
export const LinkViewSchema = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    url: { type: 'string' },
    title: { type: 'string' },
    archived: { type: 'boolean' },
    createdAt: { type: 'string', format: 'date-time' },
  },
} as const;

export const ActivityEntrySchema = {
  type: 'object',
  properties: {
    type: { type: 'string' },
    linkId: { type: 'string' },
    title: { type: 'string' },
    at: { type: 'string', format: 'date-time' },
  },
} as const;

// The shape only (API-BODY-SHAPE): whether a title is blank or a url is http(s) is the domain's to refuse.
export const SaveLinkReqBodySchema = {
  type: 'object',
  properties: { url: { type: 'string' }, title: { type: 'string' } },
  required: ['url', 'title'],
} as const;
export interface SaveLinkReqBody {
  url: string;
  title: string;
}

export const LinkIdParamsSchema = {
  type: 'object',
  properties: { id: { type: 'string' } },
  required: ['id'],
} as const;
export interface LinkIdParams {
  id: string;
}

export const CommandResSchema = { 202: AcceptedResSchema, 400: ErrorResSchema } as const;
export const GetLinksResSchema = { 200: { type: 'array', items: LinkViewSchema } } as const;
export const GetLinkResSchema = { 200: LinkViewSchema, 404: ErrorResSchema } as const;
export const GetActivityResSchema = { 200: { type: 'array', items: ActivityEntrySchema } } as const;
