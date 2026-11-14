# Before a change: what would a 30-day review window touch?

The product team is thinking of giving travellers and hosts more time to review a stay: the review window would be
**30 days after the check-out instead of 14**, and everything the window decides today would follow it.

**Do not change anything.** Before the team decides, we want to know what the change would touch in this codebase.
Answer, in your final message, with one YAML block and nothing else after it:

```yaml
rules:   # each rule of the application the change touches, in a few words, with the name the code gives it when it has one
  - ...
files:   # each source file (tests excluded) the change would modify, by its path from the repository's root
  - ...
tests:   # each test file that would fail if only the source were changed, or that the change would modify, by its path
  - ...
```

List only what the change would touch: a list that names everything is worth as little as one that names nothing.
