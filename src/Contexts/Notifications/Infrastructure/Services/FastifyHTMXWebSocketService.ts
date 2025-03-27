import { FastifyInstance, FastifyRequest } from 'fastify';
import fastifyWebsocket from '@fastify/websocket';
import { IResult, Result } from '@SharedKernel/Domain/Application';
import { IEventEmitter } from '@SharedKernel/Domain/Services/EventEmitter';
import { Notification } from '@Contexts/Notifications/Domain/Notification/Notification';
import { Logger, Role } from '@SharedKernel/Domain';
import { WebSocket } from 'ws';

export interface WebSocketClientMap {
  [userId: string]: Set<WebSocket>; // userId -> WebSocket connections
}

export interface IWebSocketService extends IEventEmitter {
  sendToUser(userId: string, notification: Notification): Promise<IResult<void>>;
  isUserConnected(userId: string): boolean;
}

export class FastifyHTMXWebSocketService implements IWebSocketService {
  private clients: WebSocketClientMap = {};

  constructor(private logger: Logger) {}

  async initialize(fastify: FastifyInstance): Promise<void> {
    // Register @fastify/websocket plugin
    await fastify.register(fastifyWebsocket, {
      options: {
        maxPayload: 1048576, // 1MB max message size
      },
    });

    // Setup WebSocket route
    fastify.register(async fastify => {
      fastify.get(
        '/ws',
        {
          websocket: true,
        },
        (socket, req: FastifyRequest<{ Querystring: { token: string } }>) => {
          this.setupConnection(socket, req);
        },
      );
    });

    this.logger.info('Fastify WebSocket service initialized');
  }

  private setupConnection(socket: WebSocket, req: FastifyRequest<{ Querystring: { token: string } }>): void {
    const userId = req.auth.subjectId;

    if (req.auth.role === Role.GUEST) {
      socket.close();
      return;
    }

    this.logger.info(`User ${userId} connected to WebSocket`);
    // Store connection for this user
    if (!this.clients[userId]) {
      this.clients[userId] = new Set();
    }
    this.clients[userId].add(socket);

    socket.on('message', (message: Buffer) => {
      req.executionContext.logger?.info(`WebSocket message received: ${message.toString()}`);
    });

    // Handle disconnection
    socket.on('close', () => {
      if (userId && this.clients[userId]) {
        this.clients[userId].delete(socket);

        if (this.clients[userId].size === 0) {
          delete this.clients[userId];
        }

        this.logger.info(`User ${userId} disconnected from WebSocket`);
      }
    });
  }

  emit(event: string, ...args: unknown[]): boolean {
    try {
      // Broadcast to all connections
      const message = JSON.stringify({
        type: event,
        payload: args.length === 1 ? args[0] : args,
      });

      Object.values(this.clients).forEach(connections => {
        connections.forEach(socket => {
          if (socket.readyState === WebSocket.OPEN) {
            socket.send(message);
          }
        });
      });

      return true;
    } catch (error) {
      this.logger.error('WebSocket broadcast error:', error);
      return false;
    }
  }

  addListener(_: string, __: (...args: unknown[]) => void): this {
    // This is a no-op as we're handling messages directly
    // We can implement custom event listening if needed
    this.logger.warn('addListener not implemented for WebSocketService');
    return this;
  }

  async sendToUser(userId: string, notification: Notification): Promise<IResult<void>> {
    const connections = this.clients[userId];

    if (!connections || connections.size === 0) {
      return Result.fail(new Error(`No active WebSocket connection for user ${userId}`));
    }

    try {
      // Send to all user's connections
      let sent = false;
      for (const socket of connections) {
        if (socket.readyState === WebSocket.OPEN) {
          socket.send(`<div id="notifications" hx-swap-oob="innerHTML">${notification.content}</div>`);
          sent = true;
        }
      }

      return sent ? Result.ok() : Result.fail(new Error(`Failed to send notification to user ${userId}`));
    } catch (error) {
      return Result.fail(error);
    }
  }

  isUserConnected(userId: string): boolean {
    return !!this.clients[userId] && this.clients[userId].size > 0;
  }
}
