# 22. The storm is facilitated before the code, written as data, and the code is held to it

## Context

ADR 20 read the event storm from the code; ADR 21 held the four languages to one inventory of it. Both look backwards: they say what the code *is*. A feature starts the other way round, with people saying what they want in product words, and the discipline has a practice for turning that into a model: event storming, a facilitated session that puts the facts on a wall first, then who asks for them, what decides, what reacts, what a screen needs. The repository had nothing for that moment. A feature plan (`conventions/plans/`) states the shape of a change in one language's terms, after the model is known; the evaluations hand an agent a request and grade what it built; neither is the session, and nothing compared what a session decided to what the code then did.

The pieces were there. The inventory is the storm reduced to the words every language shares, and `compareInventories` names every difference between two of them. The question was only where the *expected* side comes from.

## Decision

**A feature's storm is facilitated before the code, written as data in the inventory's words, and the code is held to it afterwards.**

- **The facilitator is the agent**, under the `storm` skill: it asks for the facts in the past tense, places each in a context's lane using the language of the map, asks what triggers it, what decides, what reacts, what a screen needs, what is outside; it marks every doubt as a hot spot and never decides one alone. It knows the wall the code already is and adds to it. A fact that fits no lane, or a pivot the map does not relate, is a decision to make first, not a sticky to place.
- **The session ends as a file**, `conventions/storms/<feature>.yaml`: a *delta* — the commands with their actor, route, aggregate and events, the queries, the events, the policies and what they publish or reach, the links the feature uses — in the inventory's words, so that one file is true for every language; the hot spots with how each was decided; `done: false`. It generates no code and is not a source of truth: the code is, and this is what the code is compared to.
- **`storm validate` holds the file to the contract and the map**: a declared context, a verb of the HTTP grammar, an actor of the three, an event that exists or is brought by the storm, a pivot the map relates, a link the map declares. A refusal is a question for the session.
- **`storm --expect` compares the expected inventory** (the current one plus the delta) to the one read from the code, and names what the code still owes — before the work, that list is the work; after it, an empty list is the proof — and what the storm reshapes rather than adds (a command that now records one fact more, a link that gains a contract). What the code adds *beyond* the storm is not its question: the inventories are committed, so the diff of `docs/inventory/*.json` in the pull request is the list of what the code added, and the review reads it against the storm — a fact nobody foresaw is a discovery to bring back to the session. With `--markdown` or `--svg`, the expected stickies are laid over the board, dashed.
- **The check holds every storm under `conventions/storms`**: one marked `done` must be carried by the code, one not done must not be yet, every hot spot of a done storm must be decided. Since the inventories are held equal (ADR 21), a storm carried by one language is held to the four.
- A feature may bring its storm, as it may bring its plan: `conventions/storms` is allowed under the feature mode.

## Consequences

- The model is decided before the code and tested after it, in every language, at the level of the model rather than the API: a command missing, a policy reaching other facts, an actor broader than decided fails the check and is named. The scenario (ADR 16) says whether the servers agree on what a client sees; the storm says whether the code agrees with what the session decided.
- The words of the storm are the inventory's: public names, three actors, routes with `{param}`, policies by what they react to and reach. Everything a language owns stays out of it, which is why one file is true for four trees — and why a storm cannot say a file name, a class or a table, which a session should not decide anyway.
- The hot spots are kept with their decisions, in the words of the room. The record of why a model is the way it is lives beside the model, not in a chat that is gone.
- A delta is additions and reshapings: a command listed again with its new events replaces the one the code has (archiving a note that now also cancels its reminder), a link listed again gains contracts. What a storm cannot say — a query that now orders differently, a field on a read model — is below the inventory's words, and the plan, the guide and the review say it.
- The skill is the first in the repository whose output is a conversation's: it is tested the way the guides are, by handing a fresh agent a request in product words and reading the storm it writes, then the comparison once the feature is built. The first storm written this way is `pin-a-note`, from the request every evaluation has used; the first session actually held is `remind-a-note`, nine hot spots in four rounds of questions, which found that time has no sticky on the wall and gave it one (a scheduler that sends a command), and that a storm must be able to reshape a command, not only add one.

## When to revisit

If a storm ever needs to say something no language can read from its tree, the inventory is the place to widen first, in every language, or the storm is saying something the code cannot be held to. If sessions keep ending with the same hot spot, that question belongs in a guide, not in every storm. If the delta is not enough — features that remove or change stickies become common — the storm grows a `changes` and a `removes`, with the same comparison behind them.
