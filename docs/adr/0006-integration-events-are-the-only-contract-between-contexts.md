# 6. Integration events are the only contract between contexts

## Context

Notifications must react when a note is shared or an account is created. The shortest path is to import the other context's domain event, or its aggregate, or its repository. Each of those couples the two contexts at the level that changes most often, and turns every refactoring of `Note` into a change in Notifications.

## Decision

A context exposes **integration events** only ([`@SharedKernel/Application/IntegrationEvents`](../../src/Contexts/@SharedKernel/Application/IntegrationEvents)): named, versionable payloads that are a promise to other contexts, deliberately distinct from the domain events inside. Three roles:

1. Inside the publishing context, a domain event handler translates the domain event into the integration event ([`NoteSharedHandler.ts`](../../src/Contexts/Notes/Application/Events/NoteSharedHandler.ts)). This is where a fact leaves its context.
2. The integration event carries everything the consumer needs, so the consumer never queries back. It is published whenever the fact happens, not only when a known consumer cares, and it uses the publishing context's public words (`recipientIds`), not the aggregate's internal field names.
3. Inside the consuming context, an **anti-corruption layer** ([`NoteSharedIntegrationEventHandler.ts`](../../src/Contexts/Notifications/Application/Events/NoteSharedIntegrationEventHandler.ts)) depends on the contract and nothing else, and restates the fact in local terms.

The ESLint boundary rules (`eslint.config.js`, generated per context) forbid a context's Domain, Application and Presentation from importing any other context; the Application layer may import `@SharedKernel/Application/IntegrationEvents`, an Infrastructure adapter may read another context's Domain (ports and read models), and a wiring file may import another context's wiring for what it exports. Nothing else crosses the border.

When a context must *ask* another one something rather than react to it (Notes: "does this account exist?"), the same rule holds in the other direction: the asking context declares a port in its own words ([`IAccountDirectory.ts`](../../src/Contexts/Notes/Domain/Note/Ports/IAccountDirectory.ts)), and only its infrastructure knows how to answer it — here from Security's read model ([`SecurityAccountDirectory.ts`](../../src/Contexts/Notes/Infrastructure/Directories/SecurityAccountDirectory.ts)), in separate deployments from Security's API. The domain never imports the other context.

## Consequences

- `Note` can be refactored freely; only `NoteSharedHandler` must keep producing the same integration event.
- Adding a consumer never touches the producer.
- The integration events live in the shared kernel, so *both* sides see the same file; changing one is a visible, reviewable change to a contract.
- Some data is duplicated in payloads (the note title travels with the event). That is the price of not querying back, and it is cheap.

## When to revisit

When contexts become separate deployables, the integration events become messages on a broker and the folder becomes a published schema package. The handlers on both sides stay as they are.
