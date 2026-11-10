# OpenStay's J5b: requests 51 to 100 again, on one tree per arm, with everything J5 taught (written before any run)

J5 closed on 10 November without a tree at a hundred ([its record](../../../2026-11-08-openstay-j5.md)). J5b asks
whether the rules written during J5 carry one tree of each arm there, with the Clean DDD tree written by one agent per
context.

**What this pilot can show:** whether the corrections and the bench's fixes carry a tree of each arm to a hundred.

**What it cannot show:**
- It is in sample. Every correction was written after seeing failures on these same requests.
- It has one tree per arm, and J5 showed trees of one arm stopping 13 requests apart.
- It cannot separate the architecture from the fan-out, since only the Clean DDD tree is split.

The comparison the hypothesis needs is the [three-arms protocol](../../three-arms/README.md), on requests no kit was
tuned on.

## The maintainer's decisions (10 November)

- **The trees:** simple-3 and clean-3, from their J4 heads at request 50 (`trees/simple-3`, `trees/clean-3` of the
  OpenStay repository). They are the trees that went furthest in their arm.
- **The Clean DDD tree is written by one agent per context** on every request whose storm lists several contexts:
  - 14 of the 50: 55, 56, 61, 65, 66, 67, 68, 72, 73, 76, 79, 80, 93, 97;
  - with the integrator of [ADR 38](../../../../adr/0038-the-integrator-is-one-role-every-multi-agent-run-has.md): one
    module, two rounds, the relationship tests on the merged result only.

  The other requests, and every request of the simple tree, have one agent.
- **Everything J5 taught, from the first request:**

  | | simple-3 | clean-3 |
  | --- | --- | --- |
  | [Repairs](../j5/repairs.md), as sections of the tree's guide | R0, R1, R2, R3, R4 | R0, R2, R3, R4 |
  | The Full+ kit | | identity born once; a relationship crossed is tested ([ADR 33](../../../../adr/0033-identity-is-born-once-and-a-relationship-crossed-is-tested.md)–[35](../../../../adr/0035-a-relationship-is-crossed-where-the-change-touches-its-contracts.md)); who reaches a command, narrowed by correction 2 of [`next-campaign.md`](../j5/next-campaign.md); the current tooling |

  - R1 is for the simple tree only: the clean tree's reads are queries already (`next-campaign.md`, item 4).
  - R2, R3 and R4 hold for every feature in either arm. Corrections 1, 5 and 6 of `next-campaign.md` change requests
    1 and 26, which both trees have passed, so they reach the trees as R2 and R3.
- **The bench:**
  - two ladders at once, one per arm, on a machine of 4 CPUs and 15 GB;
  - a grading is given 120 minutes;
  - a regression is checked on the start twice (`next-campaign.md`, item 7);
  - after each delivery, each tree's `main` and its log are pushed to the OpenStay repository (`j5b/<tree>`,
    `j5b-logs/<tree>`).
- **Budgets** (proposed, to be confirmed before the run): $60 for simple-3 and $160 for clean-3. In J5, a simple tree
  cost $13 to $21 to its stop, and a Full+ tree $38 to $67. The fan-out adds one agent per extra context to 14
  requests.

## The kit

- **The requests, the storms, the hidden tests and the triage rule are J5's** ([`../j5`](../j5/README.md)), unchanged.
  The plans point at it.
- **The plans:** [`simple-3.yaml`](simple-3.yaml) and [`clean-3.yaml`](clean-3.yaml).
  - The ladder is haiku, then sonnet, then opus.
  - An attempt is given 90 minutes and $12.
  - It is sent back once.
- **A failure goes through [`triage.md`](../j5/triage.md).** A tree that fails is repaired once by [the repair
  rule](../j5/repairs.md), in its arm's medium, and continues. A second failure after the repair's one rewording stops
  it.

## What is measured

As in J5, per tree:
- how far it goes;
- the step of each request;
- the cost, the escalations and their reasons;
- the repairs it needed.

For the Clean DDD tree's split requests, also:
- the owners' turns and their cost;
- the integrator's rounds, and what each round routed to whom;
- the channel's messages.

These are read from the logs (`owner-verdict`, `integrator`, `integrated`).

## Preparing the trees

- The trees are prepared from their J4 heads and pushed before the first run (`j5b/simple-3`, `j5b/clean-3`).
- Each prepared head passes:
  - its own checks;
  - every hidden test of requests 1 to 50.
- clean-3's migration to the Full+ kit is committed step by step, by the maintainer, with an ADR in the tree for who
  reaches a command.
- Before the ladder starts, the fan-out is rehearsed on clean-3 without an agent (`agent.runner: command`), through two
  owners, the integrator and a grading.
