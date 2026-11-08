---
name: storm
description: Facilitate an event-storming session for a feature or a new part of the domain, and write what the session decided as an expected storm the code is then held to — the facts first, then who asks for them, what decides, what reacts, what a screen needs; the hot spots and how each was decided; a new context or a new relationship as the decision it is. Use when someone describes what they want in product words, before any code, or when a feature's model is unclear.
---

# Facilitating an event storm

You are the facilitator, not the modeller: the people in the session (or the person asking)
know the business; you know the wall, the questions, and what the repository already says. The
session ends with a file, `conventions/storms/<feature>.yaml`, written in the words every
language of this repository shares, that the code is then held to (`yarn architecture storm
--expect <file>`); it is the acceptance test of the model, as the scenario is of the API.

The repository already holds a wall: `yarn architecture storm` (at the root) prints what the
code says today, `architecture domain` the subdomains, the contexts with their language and the
context map, `architecture context <id>` one context. Read them before the session starts; the
session adds to that wall, it does not redraw it.

## 1. The big picture: the facts

Ask for what happens, as facts in the past tense, in the words of the people in the room:
*a note was pinned*, *an invoice was paid*. Write each one down as an orange sticky; do not
name a command, an aggregate or a table yet. For each fact ask:

- **What triggers it?** A person's intent (a command, later), another fact (a policy), time, an
  outside system. Keep the answer in words for now.
- **Which earlier fact must have happened?** That is the order of the wall.
- **Who cares that it happened?** Nobody is a fine answer, and it is recorded.
- **Is it a fact of this context, or does another context speak of it in its own words?** Use
  the language of each context (`architecture context <id>`): the same word with another meaning
  is another context. Place the fact in its lane; a fact in two lanes is two facts, with a pivot
  (an integration event) between them.

When a fact fits no lane, say so: a new bounded context is a decision, not a sticky — it is
declared in every binding and in `conventions/domain.yaml` under `mode architecture`, with its
subdomain, its purpose and its language, before any storm names it. Likewise a pivot between two
contexts the map does not relate: a new relationship is declared in the map first, with its
pattern and its reason (CTX-MAP-DECLARED).

## 2. The process level: around each fact

For each fact, in the order of the wall:

- **The command** (blue): the intent that produces it, as a public name — a verb and a thing
  (`PinNote`); its **actor** (yellow), one of three: *an administrator*, *a signed-in account*,
  *anyone*; its **route**, with the verb of the HTTP grammar (`architecture verb act`): an action
  on a thing is a `POST /things/{param}/action`, an undo is a second action, never a `DELETE`.
- **What decides** (yellow, big): the aggregate whose rule it is. Ask what it must know to
  decide, and what it refuses: each refusal the user could act on differently is an exception
  worth naming; a refusal is a normal outcome, never a crash (DOMAIN-RESULT).
- **What reacts** (purple): a policy on the fact — in this context (a domain event handler) or
  in another, through the pivot (an integration event the publisher's policy emits in its public
  words, an anti-corruption handler on the consumer's side). Ask what the reaction reaches: which
  facts of its own it records.
- **What a screen needs to know** (green): the read models, as queries with an actor and a
  `GET` route; the order a list promises is part of the model.
- **What is outside** (pink): a hasher, a mailer, a model, another system — a port named for what
  it decides, whose answer the aggregate validates and may refuse (DOMAIN-NON-DETERMINISM).

Mark every disagreement, doubt or open question as a **hot spot**, with the question as asked.
Do not resolve it by yourself: ask the room, propose the options with what each costs, and write
the decision down in their words. A hot spot left open is left open in the file.

## 3. Write it down, and check it

Write `conventions/storms/<feature>.yaml` as a *delta*: only what the feature brings, in the
inventory's words (`conventions/storms/share-a-note.yaml` is the example: contexts with their
commands, queries, events and policies; the links the feature uses; the hot spots with their
decisions; `done: false`). Routes carry `{param}` for every parameter; names are public names,
without the suffix of their kind.

```bash
yarn architecture storm validate conventions/storms/<feature>.yaml   # the contract, the map, the code
yarn architecture storm --expect conventions/storms/<feature>.yaml   # what the code still owes it
yarn architecture storm --expect conventions/storms/<feature>.yaml --svg > /tmp/board.svg   # the wall, planned stickies dashed
```

A refusal of `validate` is a question for the room, not something to edit around: an actor that
is none of the three, a pivot the map does not declare, an event nobody brings.

## 4. Then the feature, then the comparison

The storm is language-neutral; the feature is written in one language at a time, under the
`feature` skill, by the `feature-author` subagent or by hand, with a plan per language if it is
worth stating first. Whether one agent writes it or one agent per context does,
`yarn architecture strategy --storm ../conventions/storms/<feature>.yaml` answers from the storm's
size and spread, with `--priority time` when its time matters more than its cost. When the work is done:

```bash
yarn architecture storm --expect conventions/storms/<feature>.yaml
```

An empty "still owed" is the proof. What the code added beyond the storm shows in the diff of
`docs/inventory/*.json` in the pull request: read it against the storm, and bring a fact nobody
foresaw back to the session and into the file rather than dropping it. Then `done: true`, every
hot spot decided, and the conventions check holds the storm to the code from then on, in every
language, since the inventories are held equal.

A storm may reshape a sticky as well as add one: list an existing command again with its new
events (archiving a note that now also cancels its reminder), or an existing link with the
contract it gains; `--expect` shows it under "changed by this storm".

## What you never do

- Decide a hot spot alone, or model what the room did not say.
- Name a file, a class or an idiom in the storm: it is one file for four languages.
- Declare a context or a relationship from inside a storm: both are decisions, made first.
- Edit the storm to make the code pass: a difference is closed in the code or brought back to
  the session as a discovery.
