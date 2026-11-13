# Simple, Lite and Full at the same time, on requests no kit was tuned on (draft protocol)

**Status:** a draft. It is registered (committed with its kit and its criteria, the kit passing `kit-check.mjs`) before any run, and it waits on [RFC 0002](../../../rfc/0002-architecture-profiles-lite-and-full.md)'s implementation plan up to its step 5 (`create --profile lite`).

**Decided by the maintainer on 8 November.** RFC 0002 had decided to compare Lite alone against the records of J2–J4, and kept three arms run at the same time as the stronger design if that comparison were inconclusive. The review of J5 (8 November) showed why it would be. The records were made on another machine, another harness and another kit, and Lite's rules were designed from the very requests they would be evaluated on. The maintainer chose the stronger design from the start:
- three arms run at the same time;
- on requests none of the three was tuned on;
- with a calibration all three share.

**Decided by the maintainer on 13 November** ([RFC 0005](../../../rfc/0005-what-the-literature-and-j5b-say-before-j6.md),
"Decided"):
- three trees per arm;
- every arm's agents receive the kit's API fragments;
- the cost of change is the first score, with one unannounced change per ten requests;
- the split by context only where the estimate recommends it;
- Lite with its decisions as pure functions, and its use cases declaring who may call them.
- the calibration's request 1 (OpenStay 1–10) fixes an operation's `error` as the contract's `{ type, message }`
  ([ADR 41](../../../adr/0041-an-operation-read-is-in-the-contract.md)), not OpenStay's `"<NAME>"`, so no departure is
  declared.

**Before registration:** [RFC 0005](../../../rfc/0005-what-the-literature-and-j5b-say-before-j6.md) proposes what J6
carries and measures, from the literature and J5b: Lite's decisions as pure functions, the API's specification as data,
guides as checks, and the cost of change as the first score. Its decisions D1 to D5 are taken before the kit and Lite's
profile data are hashed.

## The question

For a given kind of application, at a given size, with a given risk and number of agents, which architecture costs least while keeping the guarantees the application needs?

One campaign cannot answer that across kinds of application. It answers one cell of the table well, and says which cell it is.

## The arms

| Arm | What the agent is given | Held by |
| --- | --- | --- |
| **Simple** | A plain project and a guide, with J5's corrections from the first request: a read never changes what is stored; the wire shape is the request's | its own checks (`yarn verify`) |
| **Lite** | A project `create --profile lite` made: the boundaries of Full (integration events, outbox, owned ports, the map, wiring as data), no ceremony inside a context | the gate, with Lite's profile data |
| **Full** | A project `create` made, with ADR 33 and 34, and RFC 0003 if it is decided by then | the gate |

**Three trees per arm,** each feature from the smallest model up, on the same ladder, with the same triage rule written before any run (J5's [`triage.md`](../openstay/j5/triage.md)).

## Requests no kit was tuned on

The kits of J5's follow-on arms and Lite's design both read OpenStay's requests 1 to 73. So:

- **A new application, written before any run.** It has a domain of its own, so that no arm's rules were drawn from it. It has two to four contexts, at least two relationships between them, money or another invariant under concurrent writers, and one change not announced in advance.
- **About forty requests,** in checkpoints of ten, the hidden tests written and reviewed before the first run, as OpenStay's were.
- **A kit held to the [kit standard](../kit-standard.md) before registration.** Every request with an API table has its fragment (`api/<n>-<id>.yaml`), every convention a later request relies on is registered with the request that sets it and the test that holds it there (`conventions.yaml`), every state added is read whole where it is added, and the operation is decided in request 1 against the contract's ([ADR 41](../../../adr/0041-an-operation-read-is-in-the-contract.md)). The kit must pass [`kit-check.mjs`](../../../../.claude/flow/kit-check.mjs) with no finding, then its rehearsal ([`dry-run.mjs`](../../../../.claude/flow/dry-run.mjs)), before the campaign is registered; both reports are committed with the kit. J5 and J5b paid three times for a convention untested where it was born (requests 61, 73 and 80); this campaign's kit does not.
- **OpenStay's requests 1 to 10 as the calibration.** All three arms run them first, on the same machine, at the same time. The calibration is not counted. It shows that the machine, the harness and the budgets treat the three arms alike before anything is compared.

## The machine and the harness

- Every ladder starts through [`machine.mjs`](../../../../.claude/flow/machine.mjs): the Node the projects declare, first on every command's PATH, and at most three ladders at once. One tree per arm runs at a time, three at once.
- **Equal budgets** per feature and per tree in every arm. A budget no arm reaches is the aim: J4's and J5's budgets differed by arm.
- **The same triage, the same judge, the same kit amendments** for every arm. An amendment found on one arm's tree is applied to all three and graded again.

## Measures, kept apart

- **Correctness:** hidden tests, triaged failures, where each tree stops.
- **Cost:**
  - tokens, dollars and agent time per delivered feature, with the median and the range per arm;
  - escalations, real or not.
- **Robustness:** the chaos suite (concurrent servers, crashes between commit and publication, webhooks replayed).
- **Maintainability:** an independent reading, blind to the arm where it can be, against a rubric written before.
- **Cost of change:** the change not announced in advance, the files and rule files it touched.
- **Lite's decisions.** A frequent worry about a profile with conditional mechanisms is that the agent pays to decide, at each feature, what to bring in. This is measured:
  - how often a Lite feature brings a mechanism in;
  - whether the trigger called for it;
  - what the gate refused for a mechanism missing or added without its trigger.

## The decision it serves (RFC 0002, H8, unchanged)

Lite is "supported" only when all of these hold:
- its median cost per delivered feature is at most 0.6 times Full's, with no overlap of the ranges;
- it keeps Full's structural passes;
- it has no more triaged failures or real regressions than Full.

Otherwise Lite is kept as an experiment or dropped, and the record says which, and why.

## Hot spots, for the maintainer before registration

- **The application.** Which domain, and who writes it. It must not be one any of the three arms' guides use as an example.
- **Trees per arm.** Three, as before, or five, for ranges that separate.
- **Multi-agent.** Whether a fourth dimension runs: each arm's cross-context requests through the integrator of [RFC 0004](../../../rfc/0004-the-integrator-is-a-role-of-the-flow.md). The recommendation is no: it is its own campaign, after this one.
- **Budget.**
