# J5b's repairs

The repair rule is J5's ([`repairs.md`](../j5/repairs.md)). For a triaged failure:
1. diagnose it from the tree's code;
2. correct it once, as a section of the tree's guide committed by the maintainer, stating a rule for every feature and never a test's answer;
3. replay the request from step 0 in a new run (`…-r1`) on the same tree.

A second failure after the correction's one rewording stops the tree for good.

## clean-3, request 61 `review-rules` (11 November)

- **The failure.** Every step failed three of 61's six hidden tests, also on the replay:
  - haiku, sonnet and opus, each split between Reviews and Moderation and integrated;
  - then the control, one opus agent.

  The test received `"[object Object]"` where the rule's name (`"COMMENT_TOO_SHORT"`) was expected. The Tracker's projection answered an operation's `error` as `{ type, message }` at every head.
- **The verdict:** failed (the maintainer, 11 November).
  - Request 61 says that "a refusal later is the operation's `{ status: "ERROR", error: "<NAME>" }`".
  - simple-3 passed it.
  - No earlier hidden test reads the object.
- **The correction: R3, reworded.** It was in the tree's guide from request 50. Replay: `clean-3-r1.yaml`.

  > ## The API's shapes
  >
  > When a request says what the API answers, that is the shape, even where the code already answers otherwise: change
  > the code that projects the answer — the read model, its projection and its route's schema — and the tree's own tests
  > that read the old shape, never the request. An operation's `error`, as `GET /operations/{id}` answers it, is a
  > string: the name of the rule that refused it (`"<NAME>"`), the same name a refusal at once carries; never an object.

## simple-3, request 73 `transfer-proof` (11 November)

- **The failure.** haiku, sonnet and opus each failed one of 73's seven hidden tests, also on the replay.
  - The read-time part passed: unconfirmed with nobody acting, which R1 is about.
  - Just after the host side contests a transfer past its `dueBy`, the booking's `payment` read `null`. The tree answers `null` for a booking lapsed unpaid, and the sweep lapses it within a second, as request 30 says.
- **The verdict:** failed (the maintainer, 11 November). Request 27 makes `payment` `null` "for a request still waiting" only, and request 30 gives it a `dueBy`.
- **The correction: R5, new.** Replay: `simple-3-r1.yaml`. It would reach simple-2, had it run, and goes to the next campaign's simple guide.

  > ## What null means
  >
  > A field a request says is `null` in one case is `null` in that case only: in every other state the thing reaches,
  > later ones included, it keeps the value the requests give it. A state a later request adds does not make an earlier
  > value disappear.

### simple-3, request 73, the replay under R5 (11 November)

- **The failure.** haiku, sonnet and opus failed the same line again. Just after the contest, `payment` read `null`, and the tree's reader still answered `null` for a lapsed booking at every head.
- **The verdict:** failed (the maintainer).
- **The correction: R5 reworded, its one rewording.** Replay: `simple-3-r2.yaml`. A failure after it stops simple-3 for good.

  > ## What null means
  >
  > A field a request says is `null` in one case is `null` in that case only. When a later request adds a state the
  > thing can be in, its fields keep in that state the values the requests give them, unless the request that adds the
  > state says otherwise. Code that answers `null` for a state no request makes `null` is wrong: change it, with its
  > tests, as soon as that state appears. Before a field answers `null`, find the request that says so.

## clean-3, request 61, the replay under R3 reworded (11 November)

- **Delivered at step 0 (haiku), split, in the integrator's first round.** The Tracker's projection now answers an operation's `error` as the rule's name.
