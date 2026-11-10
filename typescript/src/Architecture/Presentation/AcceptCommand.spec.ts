import { expect, jest } from '@jest/globals';

import { CommandEvent, IResult, Result } from '@Architecture/Domain';
import { CommandHandler, EventBus, ExecutionContext, IOperation, Module } from '@Architecture/Application';
import { acceptCommand, AUTHENTICATION_REQUIRED, notAllowedStatus } from '@Architecture/Presentation/AcceptCommand';

class PostCommandEvent extends CommandEvent<{ text: string }> {}
class PostCommandHandler extends CommandHandler<PostCommandEvent> {
  async execute(): Promise<IResult<unknown>> {
    return Result.ok();
  }
}

class KnockCommandEvent extends CommandEvent<{ withKey: boolean }> {}
/** Anyone may knock with a key: the key is the proof; without one, only a signed-in caller. */
class KnockCommandHandler extends CommandHandler<KnockCommandEvent> {
  anyoneMayAsk({ payload }: KnockCommandEvent): boolean {
    return payload.withKey;
  }

  async execute(): Promise<IResult<unknown>> {
    return Result.ok();
  }
}

class StrayCommandEvent extends CommandEvent<undefined> {}

const probeModule = new Module({
  name: 'Probe',
  commands: [
    { event: PostCommandEvent, handlers: [new PostCommandHandler()] },
    { event: KnockCommandEvent, handlers: [new KnockCommandHandler()] },
  ],
});

let eventBus: EventBus;
let reply: { code: jest.Mock<(statusCode: number) => unknown> };
beforeEach(() => {
  eventBus = {
    connect: jest.fn(),
    publish: jest.fn(() => ({ id: 'operation-1' }) as IOperation<never>),
    subscribe: jest.fn(),
  } as unknown as EventBus;
  reply = { code: jest.fn() };
});

const requestFrom = (subjectId?: string) => ({
  executionContext: new ExecutionContext({
    traceId: 'trace',
    eventBus,
    auth: { subjectId, role: subjectId && 'USER' },
  }),
});

describe('acceptCommand (API-CALLER-AT-TRANSPORT)', () => {
  it('publishes the command of a signed-in caller and answers 202 with the operation', () => {
    const command = PostCommandEvent.set({ text: 'hello' });

    const answer = acceptCommand(requestFrom('alice'), reply, probeModule, command);

    expect(answer).toEqual({ operationId: 'operation-1' });
    expect(reply.code).toHaveBeenCalledWith(202);
    expect(eventBus.publish).toHaveBeenCalledWith(command, expect.any(ExecutionContext));
  });

  it('refuses a caller who is not signed in with 401, and publishes nothing', () => {
    const answer = acceptCommand(requestFrom(), reply, probeModule, PostCommandEvent.set({ text: 'hello' }));

    expect(answer).toEqual({ message: AUTHENTICATION_REQUIRED });
    expect(reply.code).toHaveBeenCalledWith(401);
    expect(eventBus.publish).not.toHaveBeenCalled();
  });

  it('lets anyone ask for a command whose handler says so, and only for what it says', () => {
    expect(acceptCommand(requestFrom(), reply, probeModule, KnockCommandEvent.set({ withKey: true }))).toEqual({
      operationId: 'operation-1',
    });
    expect(reply.code).toHaveBeenLastCalledWith(202);

    expect(acceptCommand(requestFrom(), reply, probeModule, KnockCommandEvent.set({ withKey: false }))).toEqual({
      message: AUTHENTICATION_REQUIRED,
    });
    expect(reply.code).toHaveBeenLastCalledWith(401);
    expect(eventBus.publish).toHaveBeenCalledTimes(1);
  });

  it('treats a command no handler of the module answers as a wiring error', () => {
    expect(() => acceptCommand(requestFrom(), reply, probeModule, StrayCommandEvent.set(undefined))).toThrow(
      /No handler for StrayCommandEvent in module Probe/,
    );
    expect(eventBus.publish).not.toHaveBeenCalled();
  });
});

describe('notAllowedStatus', () => {
  it('is 401 for a caller who is not signed in, 403 for a signed-in caller the rule refuses', () => {
    expect(notAllowedStatus(requestFrom().executionContext)).toBe(401);
    expect(notAllowedStatus(requestFrom('alice').executionContext)).toBe(403);
  });
});
