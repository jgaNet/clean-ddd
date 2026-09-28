const ErrorSchema = { type: 'object', properties: { message: { type: 'string' } } } as const;

const AcceptedSchema = {
  description: 'Accepted: the command is being processed, poll the operation to know its outcome',
  type: 'object',
  properties: { operationId: { type: 'string', format: 'uuid' } },
} as const;

const NotificationListItemSchema = {
  type: 'object',
  properties: {
    id: { type: 'string', format: 'uuid' },
    recipientId: { type: 'string' },
    title: { type: 'string' },
    content: { type: 'string' },
    status: { type: 'string', enum: ['PENDING', 'SENT', 'READ', 'FAILED'] },
    channels: { type: 'array', items: { type: 'string', enum: ['WEBSOCKET', 'EMAIL'] } },
    deliveredVia: { type: 'string', enum: ['WEBSOCKET', 'EMAIL'] },
    createdAt: { type: 'string', format: 'date-time' },
    sentAt: { type: 'string', format: 'date-time' },
    readAt: { type: 'string', format: 'date-time' },
    metadata: { type: 'object', additionalProperties: true },
  },
} as const;

export const notificationSchema = {
  getAccountNotifications: {
    tags: ['notifications'],
    params: {
      type: 'object',
      required: ['recipientId'],
      properties: { recipientId: { type: 'string' } },
    },
    querystring: {
      type: 'object',
      properties: {
        limit: { type: 'number' },
        offset: { type: 'number' },
        onlyUnread: { type: 'boolean' },
      },
    },
    response: {
      200: {
        type: 'object',
        properties: {
          notifications: { type: 'array', items: NotificationListItemSchema },
          total: { type: 'number' },
          unread: { type: 'number' },
        },
      },
      403: ErrorSchema,
      400: ErrorSchema,
    },
  },
  markAsRead: {
    tags: ['notifications'],
    params: {
      type: 'object',
      required: ['id'],
      properties: { id: { type: 'string', format: 'uuid' } },
    },
    response: { 202: AcceptedSchema },
  },
  sendNotification: {
    tags: ['notifications'],
    body: {
      type: 'object',
      required: ['recipientId', 'title', 'content', 'channels'],
      properties: {
        recipientId: { type: 'string' },
        title: { type: 'string' },
        content: { type: 'string' },
        channels: { type: 'array', minItems: 1, items: { type: 'string', enum: ['WEBSOCKET', 'EMAIL'] } },
        metadata: { type: 'object', additionalProperties: true },
      },
    },
    response: { 202: AcceptedSchema },
  },
} as const;
