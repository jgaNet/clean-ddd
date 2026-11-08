import { EventEmitter } from 'events';
import { expect } from '@jest/globals';

import { ExecutionContext } from '@Architecture/Application';
import { InMemoryDataSource } from '@Architecture/Infrastructure/DataSources/InMemoryDataSource';
import { InMemoryEventBus } from '@Architecture/Infrastructure/EventBus/InMemoryEventBus';
import { InMemoryUnitOfWork } from '@Architecture/Infrastructure/UnitOfWork/InMemoryUnitOfWork';

import { ILink } from '@Contexts/Links/Domain/Link/DTOs';
import { InMemoryLinkRepository } from '@Contexts/Links/Infrastructure/Repositories/InMemoryLinkRepository';
import {
  ArchiveLinkCommandEvent,
  ArchiveLinkCommandHandler,
  SaveLinkCommandEvent,
  SaveLinkCommandHandler,
} from './index';

describe('the Links commands', () => {
  let store: InMemoryDataSource<ILink>;
  let save: SaveLinkCommandHandler;
  let archive: ArchiveLinkCommandHandler;
  let context: ExecutionContext;

  beforeEach(() => {
    store = new InMemoryDataSource<ILink>();
    const repository = new InMemoryLinkRepository(store);
    save = new SaveLinkCommandHandler(repository);
    archive = new ArchiveLinkCommandHandler(repository);
    context = new ExecutionContext({
      traceId: 'trace',
      auth: {},
      eventBus: new InMemoryEventBus({ eventEmitter: new EventEmitter() }),
      unitOfWork: new InMemoryUnitOfWork(),
    });
  });

  it('saves a link for anyone and answers its id', async () => {
    const result = await save.execute(SaveLinkCommandEvent.set({ url: 'https://example.org', title: ' A ' }), context);

    expect(result.isSuccess()).toBe(true);
    expect(store.collection.get(result.data as string)).toMatchObject({ title: 'A', url: 'https://example.org' });
  });

  it("refuses what the link refuses, by the rule's name", async () => {
    const result = await save.execute(SaveLinkCommandEvent.set({ url: 'ftp://x', title: 'A' }), context);

    expect(result.isFailure() && result.error.type).toBe('InvalidLinkUrl');
    expect(store.collection.size).toBe(0);
  });

  it('archives a saved link once, and refuses an unknown one and a second time', async () => {
    const saved = await save.execute(SaveLinkCommandEvent.set({ url: 'https://example.org', title: 'A' }), context);
    const linkId = saved.data as string;

    expect((await archive.execute(ArchiveLinkCommandEvent.set({ linkId }), context)).isSuccess()).toBe(true);
    expect(store.collection.get(linkId)?.status).toBe('ARCHIVED');
    const again = await archive.execute(ArchiveLinkCommandEvent.set({ linkId }), context);
    expect(again.isFailure() && again.error.type).toBe('LinkAlreadyArchived');
    const unknown = await archive.execute(ArchiveLinkCommandEvent.set({ linkId: 'nope' }), context);
    expect(unknown.isFailure() && unknown.error.type).toBe('LinkNotFound');
  });
});
