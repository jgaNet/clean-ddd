# OpenStay's pilot: what a reader checks in any tree

The hidden tests see what a client sees. This rubric checks what they cannot, in words that apply to the simple arm's trees and the Clean DDD arm's alike. It follows [the control's rubric](../../control/reading.md), with OpenStay's rules in place of the notes'. It was written while the pilot ran, before any final tree was read.

A fresh agent that did not run the pilot reads every final tree:
- the six trees of the series;
- the two strongest-model witnesses.

It is not told how any tree was graded. It cannot be blind to the arm, since the structure shows it, so it is told to grade the behaviour and the placement, never the style. For each item it gives a verdict (pass, partial or fail) and a file and line as evidence. Each tree is read against its starting commit, so the reader knows what the run wrote.

## The items

| Id | Item | Pass when |
| --- | --- | --- |
| O1 | Each business rule lives in one place. | Each of these is decided in one function: no night booked twice (with blocked and held nights); the stay limits; a quote's lines and total; what a cancellation makes refundable, with its rounding; when a request has expired; who may change a listing or decide a request. A rule written twice fails, even if both copies agree. |
| O2 | No night twice, under concurrency. | The check that the nights are free and the write that takes them happen in one transaction, or in one statement, or behind a version check. A check followed by an unguarded write fails, even if the tests passed. |
| O3 | A refusal is an outcome, not a crash. | Every refusal the requests name reaches the client as a `4xx` or an `ERROR` outcome, and is produced without throwing through the request. |
| O4 | Time and money are handled as values. | Whether a quote is still valid, whether a request has expired, and how many days remain before a check-in are decided by functions that take the time as a parameter, or read it from something a test replaces. Amounts are integers in cents throughout; a floating-point amount fails. |
| O5 | What was accepted is kept as accepted. | A booking stores the lines, the total and the policy it was made with, and never recomputes them from the listing. |
| O6 | The parts change apart. | Accounts, listings, bookings and notices can each change without editing the others' rules. Count the imports from each part into another part's internals. |
| O7 | A crash or a second process loses or doubles nothing the reader can see. | No window between two writes where a crash loses a notice or a booking, or sends a notice twice under two ids; no cache that a second process makes stale. A window is named precisely: the file, the line, and the two writes it falls between. Mark it suspected when reading alone cannot be sure. |
| O8 | The basics of security hold. | Passwords are hashed with a salt or a slow hash. No fixed or default secret signs tokens. Every write takes its actor from the authenticated request, and every owner-only route checks the owner. |
| O9 | The rules are tested. | Each rule named in O1 has at least one test of its own, in the tree's own suite. |

## The change probes

For each tree, the reader names every file a developer would edit for each request below, without making the change. It counts the files, and the lines it read to find them.

1. **Seasonal prices:** a host sets a different nightly price for a range of dates. Quotes use the price of each night, and existing quotes and bookings keep theirs.
2. **A new cancellation policy,** `non-refundable`: nothing of the host's lines is ever refundable.
3. **The traveller also gets a notice** when a booking is confirmed, through the same outside service and with the same guarantees.

The fewer files a change touches, and the fewer lines read to find them, the more local it is. This is a proxy, and the record says so.

## What it is not

- **No style.** It grades no naming and no length for its own sake.
- **Nothing for following the architecture.** The simple arm has none to follow.
- **n/a with a reason.** An item a tree cannot be graded on is marked n/a, with the reason.
- **Not a test result.** A tree that failed a feature is still read, for what it has.
