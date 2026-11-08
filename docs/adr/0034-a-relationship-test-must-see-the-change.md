# 34. A relationship test must see the change: its new cases fail without it

## Context

[ADR 33](0033-identity-is-born-once-and-a-relationship-crossed-is-tested.md) made the gate ask for a test, named for the pair, for every relationship between two contexts that a change crosses. The step checks only that such a test changed. It reads nothing of what the test asserts.

A review of J5 (8 November) named that as the step's limit: an agent can satisfy it with a test that asserts too little. J5's own probes showed the shape of it.

- **Probe p64.** With the gate's first message, the smallest model wrote a test named for the pair. It found the report by the message's id, which the downstream side already answered before the change. The test passed, and so did the gate's step, while the hidden test failed on the report's id.
- **Probe p64b.** The reworded message ("the id that very request answered") fixed that case. A message is still advice, and the step still could not tell a test that sees the change from one that does not.

A test can be checked mechanically for one property without reading its assertions: whether it sees the change. A case that passes on the code before the change asserts nothing the change brings.

## Decision

- **A relationship test that adds a case must fail at the base.** Where the binding gives a command to run tests (`relationship_tests.run`, `{files}` standing for the tests), the gate's step runs each changed relationship test that declares a case its base did not.
  - The run happens in a worktree of the base, with the new test file and the base's code, the language's dependencies linked in.
  - If the test passes there, the step fails and names the new cases: they pass without the change, so they do not see what it does across the pair.
- **A test that only changes cases the base already had is not run.** A rename or a refactor that crosses a relationship carries its test without adding a case, and is not held to fail on code that already did the same thing.
- **The three levels are held separately, each by what can hold it:**
  - **static:** the contracts and the dependencies stay in their boundaries, held by the import rules and the context map;
  - **integration:** an identity or a datum stays coherent across a pair, held by the relationship test, which now must see the change;
  - **functional:** the whole journey satisfies the business rules, held by each language's end-to-end suite and, in the benchmarks, by the hidden tests.
- **Where it is on.** TypeScript gives the command (`yarn -s test {files}`). The other languages turn the relationship step on with ADR 33's conditions, and give their own command then.

## Consequences

- The step now costs one run of the new relationship tests at the base. That is the time of one end-to-end file, plus a worktree.
- A new relationship case that fails at the base for a reason other than the change still passes the step. The most common such reason is a test that does not compile without the change's new code, and in that case the test depends on the change anyway.
- The step proves that the test sees the change, not that it asserts the right thing. The message still says what to assert: the thing made upstream, found downstream by the id that very request answered.

## When to revisit

- If a change must add a relationship case that legitimately passes before it, such as a test written for behaviour already there, the case belongs in its own change, before the one that crosses the pair.
- If running at the base proves too slow on a large application, run only the new cases by name, where the test runner can select them.
