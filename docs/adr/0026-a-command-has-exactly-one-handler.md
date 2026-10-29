# 26. A command has exactly one handler

## Context

Commands, domain events and integration events travel on one bus (every language subscribes its handlers by channel name; in Rust the transport spawns the dispatch, ADR 14), and a Module lists each of them as data: a channel and the handlers that answer it (ARCH-MODULES-DATA). The shape is the same for the three kinds, and nothing in it said that the kinds differ in what an answer *is*. A fact is told to whoever listens: zero subscribers is a fine outcome, three is common. A command is an intent whose outcome is its handler's result — the `Result` the operation carries, the status the client reads back. Two handlers would answer with two outcomes and the operation would carry one of them, chosen by subscription order; none would leave the operation pending forever, and a route that builds a command nobody is wired to answer is exactly that: a request accepted and never decided. An external review named the gap — commands and events on a common bus, and nothing verifying that a command has exactly one handler — and the reviewer was right that the wiring being data makes it a one-line check.

## Decision

**A command has exactly one handler, and the conventions check of every language holds it (ARCH-ONE-HANDLER).** The Module lists each command once, with one handler; every command a route or a policy builds is one the Module lists; a fact may have any number of subscribers.

- **Where it is read.** The same reading that writes the inventory (ADR 21) reads the wiring file of each context as data; it now keeps every handler a command is listed with, the commands the context's routes build and the commands its policies dispatch, and refuses, under the rule's id, a command with other than one handler, a command listed twice, and a command built or dispatched that the wiring does not answer. The TypeScript reading is [`storm.ts`](../../tools/src/storm.ts) (`oneHandlerProblems`), held by its spec; Rust, Python and Go read their own wiring shapes with their own tools and refuse the same three things in the same words.
- **Why a check, not a type.** A `Module` whose `commands` took one handler per entry would hold the first case in every language's type system, but not the second (the same command listed twice) nor the third (a command nobody answers), and the third is the one that hides a bug. The check sees the whole context — the wiring, the routes, the policies — which no single type does.
- **What it does not say.** Nothing about queries: a query is run by its handler directly (`module.getQuery(…)`), never published, so the bus cannot answer it twice. Nothing about how many commands a policy dispatches, or how many handlers a fact has.

## Consequences

- A second reaction to the same intent is a policy on the fact its handler records, not a second handler: the handler decides, the fact is published, whoever cares reacts. That was the intended shape; now the check says so when a wiring drifts from it.
- A route or a policy that builds a command before its handler is wired is refused by the check, in the language where it happens, with the command's name. A feature author sees it as the next file to write.
- A language's tool must read the commands its routes build. Each already did, to give every command its route (API-ONE-SURFACE); a route whose command the tool cannot see is a reading to fix, never a rule to relax.

## When to revisit

If a kind of command ever needed several handlers — a broadcast intent with no outcome — it would be a fact under another name, and the right move is to publish an event. If a language's bus grew a type that rejected a second handler at construction, the check would still stand for the two other cases.
