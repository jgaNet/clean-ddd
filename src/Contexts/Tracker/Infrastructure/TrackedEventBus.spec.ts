import { EventEmitter } from 'events';

import { CommandEvent, DomainEvent, IResult, NotFoundException, Result, Role } from '@SharedKernel/Domain';
import { CommandHandler, EventBus, EventHandler, ExecutionContext, OperationStatus } from '@SharedKernel/Application';
import { OperationCompleteIntegrationEvent } from '@SharedKernel/Application/IntegrationEvents/TrackerIntegrationEvents';
import { InMemoryDataSource } from '@SharedKernel/Infrastructure/DataSources/InMemoryDataSource';
import { InMemoryEventBus } from '@SharedKernel/Infrastructure/EventBus/InMemoryEventBus';

import { OperationRecord } from '@Contexts/Tracker/Application/ReadModel/OperationRecord';
import { InMemoryOperationRecords } from '@Contexts/Tracker/Infrastructure/InMemoryOperationRecords';
import { TrackedEventBus } from '@Contexts/Tracker/Infrastructure/TrackedEventBus';

class Greet extends CommandEvent<{ name: string }> {}

class GreetHandler extends CommandHandler<Greet> {
  async execute({ payload }: Greet): Promise<IResult<string>> {
    if (payload.name === 'nobody') return Result.fail(new NotFoundException('Test', 'Nobody to greet'));
    return Result.ok(`Hello ${payload.name}`);
  }
}

/** Stands in for the Notifications context: keeps the completion notices it receives. */
class CompletionRecorder extends EventHandler<OperationCompleteIntegrationEvent> {
  constructor(private completions: OperationCompleteIntegrationEvent[]) {
    super();
  }

  async execute(event: OperationCompleteIntegrationEvent): Promise<IResult> {
    this.completions.push(event);
    return Result.ok();
  }
}

const flush = () => new Promise(resolve => setTimeout(resolve, 0));

describe('TrackedEventBus', () => {
  let bus: EventBus;
  let store: InMemoryDataSource<OperationRecord>;
  let completions: OperationCompleteIntegrationEvent[];

  beforeEach(async () => {
    store = new InMemoryDataSource<OperationRecord>();
    completions = [];
    bus = new TrackedEventBus(
      new InMemoryEventBus({ eventEmitter: new EventEmitter() }),
      new InMemoryOperationRecords(store),
    );
    await bus.subscribe(Greet.name, new GreetHandler());
    await bus.subscribe(OperationCompleteIntegrationEvent.name, new CompletionRecorder(completions));
  });

  const contextFor = (subjectId?: string) =>
    new ExecutionContext({ traceId: 'trace-1', eventBus: bus, auth: { subjectId, role: Role.USER } });

  it('records a successful operation with the handler result', async () => {
    const operation = bus.publish(Greet.set({ name: 'Alice' }), contextFor('alice'));
    await flush();

    expect(store.collection.get(operation.id)).toMatchObject({
      name: 'Greet',
      status: OperationStatus.SUCCESS,
      traceId: 'trace-1',
      subjectId: 'alice',
      result: 'Hello Alice',
    });
  });

  it('records a failed operation with the error, in client words', async () => {
    const operation = bus.publish(Greet.set({ name: 'nobody' }), contextFor('alice'));
    await flush();

    expect(store.collection.get(operation.id)).toMatchObject({
      status: OperationStatus.ERROR,
      error: { type: 'NotFound', message: 'Nobody to greet' },
    });
  });

  it('notifies an authenticated caller once, when the command reaches its outcome', async () => {
    bus.publish(Greet.set({ name: 'Alice' }), contextFor('alice'));
    bus.publish(Greet.set({ name: 'nobody' }), contextFor('alice'));
    await flush();

    expect(completions.map(event => event.payload.status)).toEqual([OperationStatus.SUCCESS, OperationStatus.ERROR]);
    expect(completions[0].payload).toMatchObject({ userId: 'alice', type: 'Greet', result: 'Hello Alice' });
    expect(completions[1].payload).toMatchObject({ userId: 'alice', type: 'Greet', error: 'Nobody to greet' });
  });

  it('records domain events for the trace but never announces them (that would loop)', async () => {
    class Greeted extends DomainEvent<{ name: string }> {}
    bus.publish(Greeted.set({ name: 'Alice' }), contextFor('alice'));
    await flush();

    expect([...store.collection.values()].map(record => [record.name, record.status])).toEqual([
      ['Greeted', 'PENDING'],
    ]);
    expect(completions).toEqual([]);
  });

  it('does not notify an anonymous caller, and never tracks the completion notices themselves', async () => {
    bus.publish(Greet.set({ name: 'Alice' }), contextFor(undefined));
    await flush();

    expect(completions).toEqual([]);
    expect([...store.collection.values()].map(record => record.name)).toEqual(['Greet']);
  });
});
