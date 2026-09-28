import { CommandEvent, IResult, Result } from '@SharedKernel/Domain';
import { CommandHandler, Module, QueryHandler } from '@SharedKernel/Application';

class Greet extends CommandEvent<{ name: string }> {}
class GreetHandler extends CommandHandler<Greet> {
  async execute(): Promise<IResult> {
    return Result.ok();
  }
}
class Wave extends CommandEvent<undefined> {}
class WaveHandler extends CommandHandler<Wave> {
  async execute(): Promise<IResult> {
    return Result.ok();
  }
}
class CountGreetings extends QueryHandler<{ count(): number }, void, IResult<number>> {
  async execute(): Promise<IResult<number>> {
    return Result.ok(this.queriesService.count());
  }
}

describe('Module', () => {
  const greet = new GreetHandler();
  const count = new CountGreetings({ count: () => 3 });
  const module = new Module({
    name: 'Greetings',
    commands: [
      { event: Greet, handlers: [greet] },
      { event: Wave, handlers: [new WaveHandler()] },
    ],
    queries: [count],
  });

  it('finds a command handler by its class', () => {
    expect(module.getCommand(GreetHandler)).toBe(greet);
  });

  it('finds a query handler by its class', () => {
    expect(module.getQuery(CountGreetings)).toBe(count);
  });

  it('names what is missing', () => {
    class Bow extends CommandHandler<Wave> {
      async execute(): Promise<IResult> {
        return Result.ok();
      }
    }
    expect(() => module.getCommand(Bow)).toThrow('Missing command handler Bow in module Greetings');
  });

  it('subscribes every handler to its event name', async () => {
    const subscribed: string[] = [];
    await module.subscribe({
      connect: async () => undefined,
      publish: () => {
        throw new Error('not used');
      },
      subscribe: async (channel: string) => {
        subscribed.push(channel);
      },
    });

    expect(subscribed).toEqual(['Greet', 'Wave']);
  });
});
