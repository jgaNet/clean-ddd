# The control: what a reader checks in any tree

The acceptance tests see what a client sees. This rubric checks what they cannot, in words that apply to any structure: the plain arm's, the prose arm's and the architecture's alike. It was written before any tree was read.

A fresh agent that did not run the benchmark grades every final tree: A's three, P's three and D's two. For each item it gives a verdict and a file and line as evidence. It cannot be blind to the arm, since the structure shows it; it is told to grade the behaviour and the placement, never the style.

## The items

| Id | Item | Pass when |
| --- | --- | --- |
| N1 | A password is never stored or returned in clear. | What is stored is a one-way hash (a salted or keyed hash, or a slow hash), and no response or log carries the password or its hash. |
| N2 | A note's owner comes from the caller. | Every write takes the owner from the authenticated request, never from the body or the path. |
| N3 | Each business rule lives in one place. | These rules are each decided in one function: an archived note cannot be edited or pinned; at most ten tags of one lowercase word; the quota of ten notes on Free; only a reminder not yet due is cancelled. A rule written twice fails, even if both copies agree. |
| N4 | A refusal is an outcome, not a crash. | Every refusal the backlog names reaches the client as an `ERROR` outcome or the status the API gives, and is produced without throwing through the request. |
| N5 | Time can be set in a test. | Whether a reminder is due is decided by a function that takes the time as a parameter, or reads it from something a test replaces. |
| N6 | The parts of the application can change apart. | Notifications and plans can be changed without editing the notes' rules, and the reverse. Count the imports from each of these parts into the others' internals. |
| N7 | The rules are tested. | Each rule named in N3 has at least one test of its own, in the tree's own suite. |

## The change probes

For each tree, the reader names every file a developer would edit for each request below, without making the change. Each probe counts the files and the lines read to find them.

1. A note's title may now have up to 200 characters.
2. Tags become case-insensitive: `Work` and `work` are one tag.
3. A reminder that falls due is also sent by email, through a mailer that does not exist yet.

The fewer files a change touches, and the fewer lines read to find them, the more local it is. This is a proxy, and the record says so.

## What it is not

It grades no style, no naming and no length for its own sake, and it awards nothing for following the architecture: in the plain arm there is none to follow. An item a tree cannot be graded on is marked n/a, with the reason.
