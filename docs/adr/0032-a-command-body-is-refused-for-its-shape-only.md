# 32. A command's body is refused for its shape only; whether a value is allowed is the domain's

## Context

A command answers `202` with an operation, and a refusal is the operation's `ERROR`, named by the rule's exception ([ADR 1](0001-result-instead-of-exceptions.md), DOMAIN-RESULT). The request schema stood in front of that. The TypeScript guide said its schemas "describe shape (`type`, `required`), not business rules", and in the same sentence that "an enum of allowed values is shape: list it from the domain enum". So a value outside a list was refused by the transport with a `400` that names no rule, before the domain saw it.

Three things showed the cost:

- **An agent followed the guide, and the product disagreed.** With the weaker model, one agent ([the extensions' E1](../evaluations/2026-10-30-flow-extensions.md#e1--a-weaker-model)) put the plans in the request schema (`enum: ['free', 'unlimited']`), as the guide says. The request asked that an unknown plan be refused on the operation. The hidden test failed on a `400`. The gate passed, correctly: nothing in the contract said otherwise. The records first called this a gap of the gate. It was a contradiction between the guide and what a client needs.
- **The reference did it too.** `POST /notifications` declared its channels with `enum` and `minItems: 1`. An unknown channel, or none, was refused by the schema, although the domain already had a rule for an empty strategy, `EmptyDeliveryStrategy`, which the schema kept from ever running. Each language held the same list a second time in its own transport: Python in its body model, Rust in a deserialised enum.
- **The client cannot tell refusals apart.** A `400` from the schema and a `NotAllowed` on the operation are two ways of refusing one request, read in two places. A screen that shows "this plan does not exist" needs the rule's name, which only the domain has.

## Decision

**A command's request body is refused by the transport for its shape only; whether a value is allowed is the domain's to decide** (rule API-BODY-SHAPE).

- **Shape, answered `400`:** the body is JSON, its fields have the types the schema says (`string`, `array`, `object`), and the required fields are present. These are what a transport can check without knowing the business, and a client that sends the wrong shape has a bug, not a choice to make.
- **Values, answered on the operation:** whether a value is one of a list, has a format, a length, a range, or a count. The body carries it as it came, the command passes it on, and the value object or the aggregate turns it into the domain's type or refuses it with its exception. For example, `isChannel()` and `UnknownChannel`, the way `isRole()` already worked.
- **Not concerned:** the answer's schema, which describes what the API sends, and a path parameter, which names a resource rather than carrying a value.

**How it is held.**
- **In every language, by tests.** The shared API scenario sends `POST /notifications` with an unknown channel and with none, and expects a `202` and the operation's `UnknownChannel` and `EmptyDeliveryStrategy`. Each language answers it in its own idiom.
- **In TypeScript, statically too.** The linter refuses a value keyword (`enum`, `pattern`, `format`, lengths, ranges, counts) inside a `body` schema in a Presentation file. A created application carries the same linter, so the gate holds the rule there.

## Consequences

- **The reference's four languages change one route.** `POST /notifications` takes its channels as strings. Its domain refuses an unknown one (`UnknownChannel`, new in every language) and an empty list (`EmptyDeliveryStrategy`, which the schema had hidden until now).
- **The TypeScript guide loses "an enum of allowed values is shape".** It now says what the rule says. The other guides say the same in their idiom.
- **A refused value now costs a round trip.** The client gets a `202`, then reads the refusal on the operation, instead of an immediate `400`. That is already how every other refusal reaches it.
- **Only the TypeScript tree is held statically.** Python, Go and Rust have no linter for request models. Their bindings hold the rule by the scenario and point at the route that shows it. A request model that rules on a value passes their checks until a test sends the value.

## When to revisit

- **If clients need immediate validation for a form,** add a query that answers it, rather than a schema that refuses on the domain's behalf.
- **If a value rule turns out to be purely technical,** such as a size cap that protects the server, it belongs to the transport. Write it as a transport limit (a body size limit), not as a value keyword in the schema.
