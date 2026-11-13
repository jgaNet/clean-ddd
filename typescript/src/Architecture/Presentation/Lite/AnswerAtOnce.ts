import {
  ConcurrencyConflictException,
  Exception,
  NotAllowedException,
  NotFoundException,
  UnknownException,
} from '@Architecture/Domain';
import { ExecutionContext } from '@Architecture/Application/ExecutionContext';
import { UseCase } from '@Architecture/Application/Lite/UseCase';
import { AUTHENTICATION_REQUIRED, notAllowedStatus } from '@Architecture/Presentation/AcceptCommand';

/**
 * The transport of the Lite profile (ADR 40; the contract's `http-lite` grammar): a route runs the use
 * case its Module lists, in the request's context, and answers its result at once — no `202`, no
 * operation to follow. Every Lite route answers through here, so that who may call a use case is held in
 * one place and a refusal has one status on every route:
 *
 * - a use case that needs a signed-in caller — every one that does not say `{ caller: 'anyone' }` where
 *   it is defined — is refused at once with `401 { type: 'NotAllowed', message }` when the request has
 *   no caller the transport proved (no token, or one it did not accept), before the use case runs:
 *   nothing is read, written or published (API-CALLER-AT-TRANSPORT, ADR 43, as `acceptCommand()` holds
 *   it for Full's `202` routes). What a signed-in caller may do is still the use case's: "administrators
 *   only" is asked through the shared kernel and answered with its own `403`;
 * - a command that brings a thing into existence answers `201 { id }` (`created: true`), the id its
 *   use case generated and returned (DOMAIN-IDENTITY);
 * - any other command answers `200` with what its use case returns, or `204` when it returns nothing;
 *   a query answers `200` with its read model;
 * - a refusal answers at once, named by the rule's exception (`{ type, message }`): `403` to a signed-in
 *   caller the rule refuses (`NotAllowedException`), or `401` if nobody is signed in (a use case anyone
 *   may call that still refuses who is not), `404` for a thing that is not
 *   there (`NotFoundException` and its kind), `409` for one another writer changed since it was read
 *   (`ConcurrencyConflictException`, after the use case's retries), `400` for any other rule;
 * - an unexpected failure (a throw the use case turned into a failed Result) answers `500` and says
 *   nothing of it.
 *
 *   fastify.post('/', { schema }, (req, reply) =>
 *     answerAtOnce(req, reply, module.useCase(addTask), { title: req.body.title }, { created: true }));
 *
 * The request and the reply are typed by what is used of them, so the building blocks name no HTTP
 * framework.
 */
export async function answerAtOnce<Input, Output>(
  req: { executionContext: ExecutionContext },
  reply: AtOnceReply,
  useCase: UseCase<Input, Output>,
  input: Input,
  { created = false }: { created?: boolean } = {},
): Promise<unknown> {
  const context = req.executionContext;
  if (useCase.whoMayCall === 'signed-in' && !context.auth.subjectId) {
    reply.code(401);
    return { type: 'NotAllowed', message: AUTHENTICATION_REQUIRED };
  }
  const result = await useCase.run(input, context);

  if (result.isFailure()) {
    const error: unknown = result.error;
    reply.code(refusalStatus(error, context));
    return Exception.isException(error) && !(error instanceof UnknownException)
      ? { type: error.type, message: error.message }
      : { message: INTERNAL_ERROR };
  }
  if (created) {
    reply.code(201);
    return { id: result.data };
  }
  if (result.data === undefined) return reply.code(204).send();
  reply.code(200);
  return result.data;
}

/** What `answerAtOnce` uses of a reply: its status, and an empty answer for a `204`. */
export interface AtOnceReply {
  code(statusCode: number): { send(): unknown };
}

/** The status of a refusal answered at once, by the kind of the rule's exception. */
export function refusalStatus(error: unknown, context: ExecutionContext): number {
  if (error instanceof NotAllowedException) return notAllowedStatus(context);
  if (error instanceof NotFoundException) return 404;
  if (error instanceof ConcurrencyConflictException) return 409;
  // A throw the use case turned into a failed Result is not a rule's refusal.
  if (error instanceof UnknownException || !Exception.isException(error)) return 500;
  return 400;
}

/** The body of a `500`: a programming error is logged by the use case, never told to the client. */
export const INTERNAL_ERROR = 'Internal error';
