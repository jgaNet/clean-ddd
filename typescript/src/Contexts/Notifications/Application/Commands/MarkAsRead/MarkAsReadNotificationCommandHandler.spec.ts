import { expect, jest } from '@jest/globals';

import { Role } from '@SharedKernel/Domain';
import { EventBus, ExecutionContext } from '@Architecture/Application';
import { InMemoryDataSource } from '@Architecture/Infrastructure/DataSources/InMemoryDataSource';

import { INotification } from '@Contexts/Notifications/Domain/Notification/DTOs';
import { NotificationNotFoundException } from '@Contexts/Notifications/Domain/Notification/NotificationExceptions';
import { InMemoryNotificationRepository } from '@Contexts/Notifications/Infrastructure/Repositories/InMemoryNotificationRepository';
import { MarkAsReadNotificationCommandEvent } from './MarkAsReadNotificationCommandEvent';
import { MarkAsReadNotificationCommandHandler } from './MarkAsReadNotificationCommandHandler';

const eventBus = { connect: jest.fn(), publish: jest.fn(), subscribe: jest.fn() } as EventBus;
const at = new Date('2026-01-01T10:00:00Z');

describe('MarkAsReadNotificationCommandHandler', () => {
  it('refuses a notification that does not exist with NotificationNotFound', async () => {
    const handler = new MarkAsReadNotificationCommandHandler(
      new InMemoryNotificationRepository(new InMemoryDataSource<INotification>()),
      () => at,
    );

    const result = await handler.execute(
      MarkAsReadNotificationCommandEvent.set({ notificationId: 'nowhere' }),
      new ExecutionContext({ traceId: 'trace', eventBus, auth: { subjectId: 'carol', role: Role.USER } }),
    );

    expect(result.error).toBeInstanceOf(NotificationNotFoundException);
    expect(result.error?.type).toBe('NotificationNotFound');
  });
});
