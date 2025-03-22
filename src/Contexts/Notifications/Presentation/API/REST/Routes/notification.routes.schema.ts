export const notificationSchema = {
  getAccountNotifications: {
    tags: ['notifications'],
    params: {
      type: 'object',
      required: ['recipientId'],
      properties: {
        recipientId: { type: 'string', format: 'uuid' },
      },
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
          notifications: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                id: { type: 'string', format: 'uuid' },
                recipientId: { type: 'string', format: 'uuid' },
                type: { type: 'string' },
                title: { type: 'string' },
                content: { type: 'string' },
                status: { type: 'string' },
                createdAt: { type: 'string' },
                sentAt: { type: ['string', 'null'] },
                readAt: { type: ['string', 'null'] },
                metadata: { type: 'object' },
              },
            },
          },
          total: { type: 'number' },
          unread: { type: 'number' },
        },
      },
      400: {
        type: 'object',
        properties: {
          error: { type: 'string' },
        },
      },
      500: {
        type: 'object',
        properties: {
          error: { type: 'string' },
        },
      },
    },
  },

  markAsRead: {
    tags: ['notifications'],
    params: {
      type: 'object',
      required: ['id'],
      properties: {
        id: { type: 'string', format: 'uuid' },
      },
    },
    response: {
      200: {
        type: 'object',
        properties: {
          operationId: { type: 'string' },
        },
      },
      400: {
        type: 'object',
        properties: {
          error: { type: 'string' },
        },
      },
    },
  },

  sendNotification: {
    tags: ['notifications'],
    body: {
      type: 'object',
      required: ['recipientId', 'type', 'title', 'content'],
      properties: {
        recipientId: { type: 'string', format: 'uuid' },
        type: {
          type: 'string',
          enum: ['EMAIL', 'PUSH', 'SMS', 'IN_APP'],
        },
        title: { type: 'string' },
        content: { type: 'string' },
        metadata: { type: 'object' },
      },
    },
    response: {
      201: {
        type: 'object',
        properties: {
          operationId: { type: 'string' },
        },
      },
      500: {
        type: 'object',
        properties: {
          error: { type: 'string' },
        },
      },
    },
  },
};
