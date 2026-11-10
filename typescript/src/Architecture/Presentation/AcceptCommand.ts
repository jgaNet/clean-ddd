import { CommandEvent, Event } from '@Architecture/Domain';
import { ExecutionContext } from '@Architecture/Application/ExecutionContext';
import { Module } from '@Architecture/Application/Module';

/**
 * Who reaches a command is the transport's to say, at once (API-CALLER-AT-TRANSPORT, ADR 39).
 *
 * A route whose command's outcome is read later calls `acceptCommand()` and nothing else: it
 * publishes the command and answers `202 { operationId }`, or, when nobody is signed in and the
 * command's handler does not say anyone may ask for it (`anyoneMayAsk()`), answers `401` and
 * publishes nothing. The client learns at once that it must sign in, instead of following an
 * operation that was never going to succeed. The linter refuses a route that publishes a command
 * any other way.
 *
 * What a signed-in caller may do is not decided here: the handler still asks for its caller's id,
 * and the aggregate still refuses what that caller may not do, on the operation. A command
 * answered at once (a login) does not come through here and keeps its own refusal.
 *
 *   async archiveNote(req, reply) {
 *     return acceptCommand(req, reply, this.#notesModule, ArchiveNoteCommandEvent.set({ noteId: req.params.id }));
 *   }
 *
 * The request and the reply are typed by what is used of them, so the building blocks name no
 * HTTP framework.
 */
export function acceptCommand(
  req: { executionContext: ExecutionContext },
  reply: { code(statusCode: number): unknown },
  module: Module,
  command: Event<unknown>,
): { operationId: string } | { message: string } {
  const context = req.executionContext;

  if (!signedIn(context) && !anyoneMayAsk(module, command)) {
    reply.code(401);
    return { message: AUTHENTICATION_REQUIRED };
  }

  const operation = context.eventBus.publish(command, context);
  reply.code(202);
  return { operationId: operation.id };
}

/**
 * The status of a refusal a query answers at once (`NotAllowedException`): `401` to a caller who is
 * not signed in, as HTTP says for missing credentials, `403` to a signed-in caller the rule refuses.
 * One refusal has one status, for a command and a query alike.
 */
export const notAllowedStatus = (context: ExecutionContext): 401 | 403 => (signedIn(context) ? 403 : 401);

/** The body of a `401`, the same on every route. */
export const AUTHENTICATION_REQUIRED = 'Authentication required';

const signedIn = (context: ExecutionContext): boolean => Boolean(context.auth.subjectId);

/** What the handler the Module lists for this command says; a command no handler answers is a wiring error. */
function anyoneMayAsk(module: Module, command: Event<unknown>): boolean {
  const handlers = module.commands.find(({ event }) => command instanceof event)?.handlers ?? [];
  if (!handlers.length) {
    throw new Error(`No handler for ${command.name} in module ${module.name}: list it in the context's wiring`);
  }
  return handlers.every(handler => handler.anyoneMayAsk(command as CommandEvent<unknown>));
}
