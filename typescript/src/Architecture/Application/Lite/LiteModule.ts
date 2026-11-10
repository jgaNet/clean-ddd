/**
 * The wiring of a context held to the Lite profile (ADR 40), as data (ARCH-MODULES-DATA): its name,
 * the use cases it answers — each built with its ports, listed once (ARCH-ONE-HANDLER) — and the
 * reactions it subscribes to the bus, which stay Full's `EventHandler`: a reaction runs in a
 * transaction of its own and the bus hands it a message once (ADR 30, ADR 24), and none of that is
 * ceremony to drop. It is a `Module`, so the application registers and starts it like any other.
 *
 * ```typescript
 * export const localTasksModule = new LiteModule({
 *   name: 'Tasks',
 *   useCases: [addTask(taskStore), listMyTasks(taskStore)],
 *   integrationEvents: [{ event: AccountClosedIntegrationEvent, handlers: [new AccountClosedHandler(taskStore)] }],
 * });
 * ```
 *
 * A route finds the use case the wiring built by its definition, and answers it at once:
 *
 * ```typescript
 * fastify.post('/', { schema }, (req, reply) => answerAtOnce(req, reply, module.useCase(addTask), req.body, { created: true }));
 * ```
 */

import { Module, EventSubscription } from '@Architecture/Application/Module';
import { UseCase, UseCaseDefinition } from '@Architecture/Application/Lite/UseCase';

export class LiteModule extends Module {
  readonly useCases: UseCase<never, unknown>[];

  constructor({
    name,
    useCases = [],
    domainEvents = [],
    integrationEvents = [],
  }: {
    name: string;
    useCases?: UseCase<never, unknown>[];
    domainEvents?: EventSubscription[];
    integrationEvents?: EventSubscription[];
  }) {
    super({ name, domainEvents, integrationEvents });
    this.useCases = useCases;
  }

  /** The use case the wiring built from `definition`; one the Module does not list is a wiring error, not a refusal. */
  useCase<Ports extends unknown[], Input, Output>(
    definition: UseCaseDefinition<Ports, Input, Output>,
  ): UseCase<Input, Output> {
    const found = this.useCases.find(useCase => useCase.definition === definition);
    if (!found) {
      throw new Error(
        `Missing use case ${definition.useCaseName} in module ${this.name}: list it in the context's wiring`,
      );
    }
    return found as unknown as UseCase<Input, Output>;
  }
}
