import { FastifyInstance, FastifyRequest } from 'fastify';
import fastifyWebsocket from '@fastify/websocket';
import { WebSocket } from 'ws';

import { IResult, Result, Role } from '@SharedKernel/Domain';
import { Logger } from '@SharedKernel/Application';

import { Channel } from '@Contexts/Notifications/Domain/Notification/Channel';
import { Delivery, INotificationChannel } from '@Contexts/Notifications/Domain/Notification/Ports/INotificationChannel';

/**
 * Live delivery to a connected browser. The channel owns the sockets; what is written on
 * the wire is decided by the `render` function the wiring hands in (an HTMX presenter here),
 * so this adapter knows nothing about markup.
 */
export class WebSocketChannel implements INotificationChannel {
  readonly channel = Channel.WEBSOCKET;
  #clients = new Map<string, Set<WebSocket>>();

  constructor(
    private logger: Logger,
    private render: (delivery: Delivery) => string,
  ) {}

  /** Registers the `/ws` route. Called by the bootstrap before the server listens. */
  async initialize(fastify: FastifyInstance): Promise<void> {
    await fastify.register(fastifyWebsocket, { options: { maxPayload: 1048576 } });
    fastify.register(async instance => {
      instance.get('/ws', { websocket: true }, (socket, request) => this.accept(socket, request));
    });
    this.logger.info('WebSocket channel ready on /ws');
  }

  async isAvailableFor(recipientId: string): Promise<boolean> {
    return (this.#clients.get(recipientId)?.size ?? 0) > 0;
  }

  async deliver(delivery: Delivery): Promise<IResult> {
    const sockets = [...(this.#clients.get(delivery.recipientId) ?? [])].filter(s => s.readyState === WebSocket.OPEN);
    if (sockets.length === 0) {
      return Result.fail(new Error(`No open connection for ${delivery.recipientId}`));
    }

    const message = this.render(delivery);
    sockets.forEach(socket => socket.send(message));
    return Result.ok();
  }

  private accept(socket: WebSocket, request: FastifyRequest): void {
    const { subjectId, role } = request.auth;
    if (role === Role.GUEST) {
      socket.close();
      return;
    }

    if (!this.#clients.has(subjectId)) this.#clients.set(subjectId, new Set());
    this.#clients.get(subjectId)?.add(socket);
    this.logger.info(`User ${subjectId} connected to WebSocket`);

    socket.on('close', () => {
      const sockets = this.#clients.get(subjectId);
      sockets?.delete(socket);
      if (sockets?.size === 0) this.#clients.delete(subjectId);
      this.logger.info(`User ${subjectId} disconnected from WebSocket`);
    });
  }
}
