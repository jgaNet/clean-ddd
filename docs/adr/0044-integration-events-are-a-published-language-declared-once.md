# 44. Integration events are a published language, declared once, versioned, and held in every language

## Context

Contexts talk through integration events and owned ports (CTX-CONTRACTS), and the context map says which pairs talk
and why (CTX-MAP-DECLARED). Neither says what an event *carries*. Its payload was written by hand in each language,
in the shared kernel, and nothing compared them:
- the inventories (ARCH-ONE-APPLICATION) held the four trees to the same events, by name only;
- an event that announces a thing first made elsewhere must carry the id it was born with (DOMAIN-IDENTITY, ADR 33),
  and that was held by review alone;
- an event's payload could change in place, and nothing told a change that breaks a consumer from one that does not.

The [architecture review of 12 November](../evaluations/2026-11-12-architecture-review.md) found the drift this lets
through (F5), and proposed I2. Reading the four trees for this decision found two cases of it already:
`OperationComplete` names its command `kind` in Rust and `type` in the three others, and its `error` is a required
string in Go and an optional one elsewhere. The maintainer took I2 before J6 (RFC 0005, "Decided", 13 November).

## Decision

**The published language is data, in one file for every language: `conventions/integration-events.yaml`.** It
declares each integration event once, by its public name (API-ONE-SURFACE's names: `NoteShared`):
- `publisher`: the context that publishes it, a context of the domain map;
- `announces`, for an event that announces a thing's birth: the thing, and the payload field that carries its id;
- `versions`: the history of its payload, oldest first, numbered from 1. A payload maps each field, by its public
  name in lowerCamel, to `string`, `number`, `boolean`, `object`, `array` or `any`, with `?` when it may be absent.

**Every language's code carries the last version, field for field, and the check holds it.** Each language's tool
writes the payload of each integration event its tree publishes into its inventory, in those words:
```json
"integrationEvents": [{ "name": "NoteShared", "publisher": "Notes", "payload": { "noteId": "string", "…": "…" } }]
```
A field's name is its public name whatever the language spells it (`note_id`, `NoteID` and `noteId` are `noteId`);
its type is the one of the six the language's type maps to, and `?` when the language lets it be absent (an optional
property, an `Option`, a pointer, a default of `None`). The TypeScript check holds every inventory to the file:
an event the code publishes and the file does not declare, an event declared and published by none, another
publisher, or another payload than the last version's, is a difference, named.

**A version once merged is frozen.** The gate, which knows the base it is run from, refuses a version of the base
changed in the head, unless the change is an added optional field. A field removed, renamed or retyped is a new
version, appended. A consumer reads the version its code was written for; within one tree, publisher and consumers
change together, and the version history is what an outbox entry written before the change is read against.

**An event that announces a thing carries its id.** The check refuses an `announces` whose id field is not a
`string` of the last version's payload. That a receiving context builds its object on that id stays a review item
of DOMAIN-IDENTITY.

The rule is `CTX-PUBLISHED-LANGUAGE`, enforced by the check. A created application starts with the file and the
events of the contexts it is created with (a Full application keeps the Tracker, and so `OperationComplete`; a Lite
one starts with none), as it starts with their part of the domain map. A new integration event is declared there
before the code publishes it, as a relationship is declared in the map before the code carries it, and the feature
mode allows the file for that: a feature may add an event or an optional field, and the gate keeps it from changing
a merged version.

## Consequences

- Payload drift between languages is a failing check, not a review finding. The two cases above are fixed with this
  ADR: Rust spells the field `type` (`r#type`), Go's `error` may be absent.
- Breaking an event in place is refused by the gate; the change that breaks it says so with a new version.
- A new integration event costs one entry in the file, beside the class in each language. Lite and Full applications
  pay it; a plain one has no file.
- The types are checked against the file, not generated from it: an agent reads the event's class where it always
  did. Generating them is left for later, if hand-written types drift in a way the check does not see.
- Reading an outbox entry of an earlier version (an upgrade with events not yet relayed) is not handled by this
  decision; the history makes it possible.
