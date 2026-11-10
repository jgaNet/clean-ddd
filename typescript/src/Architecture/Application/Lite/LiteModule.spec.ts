import { expect, jest } from '@jest/globals';

import { IntegrationEvent, IResult, Result } from '@Architecture/Domain';
import { EventBus, EventHandler } from '@Architecture/Application';
import { LiteModule } from '@Architecture/Application/Lite/LiteModule';
import { command, query } from '@Architecture/Application/Lite/UseCase';

/** The wiring of a Lite context (ADR 40): its use cases as data, found by their definition; its reactions subscribed. */

const greet = command('Greet', (greetings: string[]) => async ({ name }: { name: string }) => {
  greetings.push(name);
  return Result.ok();
});
const countGreetings = query('CountGreetings', (greetings: string[]) => async () => Result.ok(greetings.length));
const wave = command('Wave', () => async () => Result.ok());

class Arrived extends IntegrationEvent<{ name: string }> {}
class ArrivedHandler extends EventHandler<Arrived> {
  async execute(): Promise<IResult<unknown>> {
    return Result.ok();
  }
}

describe('LiteModule', () => {
  const greetings: string[] = [];
  const greeting = greet(greetings);
  const module = new LiteModule({
    name: 'Greetings',
    useCases: [greeting, countGreetings(greetings)],
    integrationEvents: [{ event: Arrived, handlers: [new ArrivedHandler()] }],
  });

  it('finds the use case the wiring built, by its definition, typed by it', async () => {
    expect(module.useCase(greet)).toBe(greeting);
    expect(module.useCase(countGreetings).name).toBe('CountGreetings');
  });

  it('names a use case it does not list: a wiring error, not a refusal', () => {
    expect(() => module.useCase(wave)).toThrow('Missing use case Wave in module Greetings');
  });

  it('subscribes its reactions to the bus as any Module does, and no use case: a route calls those', async () => {
    const eventBus = { connect: jest.fn(async () => {}), publish: jest.fn(), subscribe: jest.fn() } as EventBus;
    await module.start(eventBus);
    expect(jest.mocked(eventBus.subscribe).mock.calls.map(([name]) => name)).toEqual(['Arrived']);
  });
});
