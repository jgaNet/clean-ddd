# 46. A rule is a named unit, with its origin and its evidence

## Context

J5 and J5b failed where a rule had no name: a shape, a meaning or a time taken early, untested where it was born, and
required by a later request. The kits answered with a conventions register (the kit standard): every convention a
later request relies on, with the request that sets it and the test that holds it there. An application has nothing
like it. Its rules live as exceptions in the domain, as sentences in a storm, and as tests, and nothing ties the three
together: a refusal can be thrown that no rule names, and a rule can be named that no test holds.

[RFC 0006](../rfc/0006-software-knowledge-as-a-projection.md) proposed, as K2, to make a rule a named unit with its
origin and its evidence, held by the check. The maintainer decided on 13 November: yes, before J6, in TypeScript first,
and not given to J6's arms (K4 measures it on the frozen J5b trees).

## Decision

**A rule is declared once, by its public name, in `conventions/rules.yaml`:** the name of the refusal a client reads
(the operation's `error.type`, ADR 41, without the suffix of its kind: `NoteNotFound`), with:
- `context`: the context whose domain decides it;
- `statement`: the rule in the business's words, one sentence;
- `origin`: where it was decided, one of `{ adr: <n> }`, `{ storm: <feature> }`, `{ request: <id> }`.

The file names no source file, like every file under `conventions/`.

**Its evidence is read from the code, never declared.** For each language that holds the register, its check finds:
- the refusal in the code: the exception the context's domain or application returns under that name;
- at least one test of that context that names the refusal.

**The check holds the three together:** a refusal the code can return that no rule names, a rule no code returns, and
a rule no test names, each a finding under `DOMAIN-RULE-NAMED`. A class that is only extended (a context's base
exception) is not a refusal.

**Where it applies.** The reference's TypeScript tree holds it from this decision; Rust, Python and Go after J6. An
application holds it when it has the file: `create --rules` writes it, with the rules of the contexts it is created
with, and the guide and the checklists then say that a new refusal is named in the register first. Without the file,
nothing changes: J6's arms are created without it.

## Consequences

- A refusal has a name, a sentence, an origin and a test, in one place a person or an agent can read; the read-only
  query of RFC 0006's K3 starts from it.
- A new refusal costs one entry in the file. That is the ceremony J6 does not pay; K4 says whether it is worth paying.
- The evidence is a test that names the refusal, not one that proves it holds: a test can name a refusal and assert
  nothing. Mutation testing would be the stronger evidence and is left for later.
- The rule is `enforcement: check` in the contract. A binding cannot lower one rule's enforcement, so Rust, Python and
  Go report it as a gap (their README's known gaps: held by review) until their checks hold it.
- A created application's contract lists the rule whether or not it has the register; without the file, its check
  holds nothing of it and its guide and checklists do not mention it.
- A generic refusal built from the building blocks (`NotFound`, `NotAllowed` with a message) and the shared kernel's
  are not a context's, and the register does not cover them yet.
- The feature mode allows the register: a feature that adds a refusal names it there first.
