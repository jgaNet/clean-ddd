# The security audit: what each arm's tree does about security, unasked

No request of any campaign asked for security beyond its access rules. The hidden tests of features 1–7 check those rules feature by feature:
- a note is kept from everybody but its owner;
- an anonymous caller is refused;
- a recipient cannot change a shared note.

Nothing tested what an attacker would try. The two flaws found so far were found by reading the code, not by a test: a fixed fallback secret for tokens, and a default administrator.

This kit probes the trees as an attacker would, over the API of features 1–7, the surface every tree shares. **It is an audit, not a requirement.** No agent was asked for any of it, so a probe that fails is not a feature lost: it is what the tree does by default. The audit is reported apart from [ADR 31's four scores](../../../adr/0031-the-architecture-is-a-guardrail-and-a-coordinator-not-an-accelerator.md). It answers one question: does an arm write code that is safer by default?

## The probes

Each probe starts the tree's server as a process of its own, on a SQLite file of its own (`DATABASE_PATH`), the way the robustness tests do ([`acceptance/security.ts`](acceptance/security.ts)). They know nothing of how a tree is written.

| # | Probe | What it does | Fails when |
| --- | --- | --- | --- |
| S1 | [Tokens](acceptance/S1-tokens.acceptance.ts) | It calls with no token or with junk. Then, from the attacker's own token, it makes forgeries aimed at another account: a character changed, the token truncated, a decoded segment rewritten to name the other account, sent with the old signature, with `alg: none`, and signed again with nine guessable secrets (`''`, `secret`, `changeme`…) | A forged token proves anyone, or reads the other account's note |
| S2 | [Injection](acceptance/S2-injection.acceptance.ts) | It sends SQL fragments as a note's title and text, as a tag filter, as a note id in the path, as login and sign-up fields, as a share target and as a plan | Anything answers a 5xx, a note is kept differently from how it was written, a filter or a path returns another account's data, or another account's note changes |
| S3 | [Access by identifier](acceptance/S3-object-access.acceptance.ts) | It calls every route that names a note (read, edit, pin, tag, untag, share, remind, archive) on someone else's note, as a stranger and as nobody. As a recipient, it tries what feature 4 keeps to the owner | A call is not refused (a 4xx, or a 202 ending in `ERROR`), or the note reads differently afterwards, or it appears in the stranger's lists |
| S4 | [Fields added to a body](acceptance/S4-mass-assignment.acceptance.ts) | It signs up with `role: admin`, a chosen id and a paid plan. It writes and edits a note with `ownerId`, a chosen id, `pinned`, `archived`, `tags`, `sharedWith` and a date. It sets the free plan with a higher limit | An added field becomes the account's or the note's |
| S5 | [Secrets at rest](acceptance/S5-secrets-at-rest.acceptance.ts) | It signs up with a distinctive password, then reads every file the server keeps (database, journal, WAL) for that password as text, base64, hex or UTF-16. It reads every answer for the password, or for a key named like a password, a hash or a salt | The password is readable in a file, or an answer carries it or its hash |
| S6 | [Malformed requests](acceptance/S6-error-leaks.acceptance.ts) | It sends malformed JSON, bodies of the wrong type or content type, a body over 2 MB, odd paths and odd authorisation headers. It writes notes with a null byte, a lone surrogate, an emoji, a right-to-left mark and a script tag | Anything answers a 5xx, or an answer or outcome shows a stack, a source file, `node_modules`, a query or a SQLite error |

**What it does not probe:**
- token expiry and logout, which need a clock;
- brute force and rate limits, which are product decisions;
- operations read by id: the reference lets anyone read an operation by its id, which cannot be guessed;
- response headers, dependencies with known flaws, and the front end.

## How it was checked before use

A probe that never fails measures nothing. The kit was run on two trees as they stand (a2 and p2, after the robustness campaign), and both passed all 13 tests. Then five defects were planted in a copy of p2, and the audit was run again:

| Planted defect | Probe that failed |
| --- | --- |
| Any token sharing the first 12 characters of a real one is accepted | S1: a token changed or truncated proves its owner |
| A note is read without checking who asks | S3: a stranger reads it (and S1, through the same route) |
| A note is created from its body, spread over the defaults | S4 |
| The password is stored as it was typed | S5: found in the WAL file. Also S2, by a side effect: a login with a wrong password of another length answered 500 |
| Errors are answered with their stack | S6: malformed JSON, a wrong content type, a body too large, every one a 500 with its stack |

Every probe failed for the defect planted in its area. S2 was not checked on a planted injection: p2 filters in memory and keeps its data as documents, so there was no query to break. It failed only by the side effect above.

## How it is run

With the grader, like any kit: [`grade.mjs`](../../../../.claude/flow/grade.mjs) `--kit docs/evaluations/benchmark/security`. Its M2 is the audit, one line per probe, and the names of the failed tests say what was found. Its M1 and M3 are the tree's own, and do not count here.

**The trees.** The six robustness trees, at two points:
- before the campaign: the heads kept in [`flow/robustness/`](../../flow/robustness/README.md);
- after it.

The changes made for robustness are the only ones between the two, so any difference in the audit is theirs.

## Biases

- **The probes reflect what their author thought to try.** A tree can be unsafe in a way none of them reaches. A passing audit means these attacks failed, not that the tree is safe.
- **One author for everything,** as in every kit before.
- **Unasked is not unfair, but it is not a delivery score.** An arm that guards against these attacks did more than it was asked. The audit says so, and nothing else.
