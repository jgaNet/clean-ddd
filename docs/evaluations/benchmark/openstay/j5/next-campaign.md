# Corrections for the next campaign

Kept during J5 and decided by the maintainer; none of them changes a J5 verdict or a request a tree has reached.

## From Full+ clean-2's failure on request 61 (7 November)

The tree answered a host's reply behind a 202 and gave the operation's error as `{ type, message }`, the shape its
operations already had; request 61 asks for `error: "<NAME>"`. Every model saw the conflict and kept the tree's shape.
The verdict stands (the request decides it); these three corrections remove the conflict next time.

1. **Request 1 fixes the shape of an operation's error.** It said only `{ status, result? }`, so the first request that
   names a refusal behind a 202 (61) set a shape the architecture had already set otherwise. Request 1 says what `error`
   is (`"<NAME>"`, the rule's name), once, for every request after it.
2. **Full+ ADR 57 (who reaches a command) is narrowed.** "`acceptCommand` is the one way every controller asks for a
   command" pushed the reply of request 60 behind a 202. It becomes: `acceptCommand` for a command whose outcome is read
   later; a command answered at once keeps `awaitCommand`, which refuses with `4xx` as request 1 says.
3. **The guide says the wire shape is the request's.** One sentence in the arms' guides: when a request fixes what the
   API answers, that shape wins over the code's own habit; adapt the projection, not the request (API-ONE-SURFACE).
