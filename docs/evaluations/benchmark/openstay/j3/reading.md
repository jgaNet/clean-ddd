# OpenStay's J3: what a reader checks in any tree

The hidden tests see what a client sees. This rubric checks what they cannot, in words that apply to the simple arm's trees and the Clean DDD arm's alike. It is [the pilot's rubric](../pilot/reading.md), with the rules requests 11 to 25 add, and three new change probes. It was written while J3 ran, before any final tree was read.

A fresh agent that did not run J3 reads the six final trees. It is not told how any tree was graded. It cannot be blind to the arm, since the structure shows it, so it is told to grade the behaviour and the placement, never the style. For each item it gives a verdict (pass, partial or fail) and a file and line as evidence. Each tree is read against its J3 starting commit, so the reader knows what J3 wrote, and against its pilot starting commit for the items that span both.

## The items

| Id | Item | Pass when |
| --- | --- | --- |
| O1 | Each business rule lives in one place. | Each of these is decided in one function: the pilot's rules (no night twice, the stay limits, a quote's lines and total, what a cancellation refunds, when a request expires, who may change a listing); and J3's: the price of a night (seasons over the base price), which discount applies and its rounding, the booking window, the arrival days, whether a hold still holds, and who may act on a listing (the host, an organisation's manager, a viewer reading). A rule written twice fails, even if both copies agree. |
| O2 | No night twice, under concurrency. | The check that the nights are free and the write that takes them happen in one transaction, one statement, or behind a version check, for every way a night is taken: a booking, a request, a hold, a change of dates, a block, a bulk block. |
| O3 | A refusal is an outcome, not a crash. | Every refusal the requests name reaches the client as a `4xx` or an `ERROR` outcome, produced without throwing through the request. |
| O4 | Time and money are handled as values. | Whether a quote, a request or a hold is still running, the booking window and the arrival days are decided by functions that take the time as a parameter, or read it from something a test replaces. Amounts are integers in cents, and the discount's rounding is integer arithmetic. |
| O5 | What was accepted is kept as accepted. | A booking keeps the lines, total, policy and house rules it was made with, and each version of its conditions; a change of dates replaces the lines from the terms of that day and keeps the policy and the rules. Nothing is recomputed from the listing afterwards. |
| O6 | The parts change apart. | Accounts (with organisations), listings, bookings and notices can each change without editing the others' rules. Count the imports from each part into another part's internals. |
| O7 | A crash or a second process loses or doubles nothing the reader can see. | No window between two writes where a crash loses or doubles a notice, a booking or a hold; no cache that a second process makes stale. A bulk change is all or nothing across its listings. Name a window precisely; mark it suspected when reading alone cannot be sure. |
| O8 | The basics of security hold. | Passwords hashed with a salt or a slow hash; no fixed secret signs tokens; every write takes its actor from the authenticated request; every owner-only route checks the owner; a member's permission is read when the request runs, so a removed member loses it at once. |
| O9 | The rules are tested. | Each rule named in O1 has at least one test of its own, in the tree's own suite. |
| O10 | The change not announced in advance landed in one place. | Request 24 changed who may act on a listing across most earlier features. Pass when the permission is decided by one function (or one port) that every action asks; fail when the check was copied into each action. Count the files request 24's commit changed, and say how many earlier actions it reached. |

## The change probes

For each tree, the reader names every file a developer would edit for each request below, without making the change. It counts the files, and the lines it read to find them.

1. **An accountant.** An organisation's owner adds a member who may read every booking's lines and refunds of the organisation's listings, and nothing else: no calendar, no contact details, no change.
2. **A cleaning day.** A host asks for one free night between two stays: a stay cannot start on the day another ends, whatever takes the nights (a booking, a request, a hold, a change of dates).
3. **Holds that cost.** A hold of more than one night asks for a deposit of 10 % of its quote's nights, through the same outside service as the notices, and is released with no refund if not booked.

The fewer files a change touches, and the fewer lines read to find them, the more local it is. This is a proxy, and the record says so.

## What it is not

- **No style.** It grades no naming and no length for its own sake.
- **Nothing for following the architecture.** The simple arm has none to follow.
- **n/a with a reason.** An item a tree cannot be graded on is marked n/a, with the reason.
- **Not a test result.** A tree that failed a feature is still read, for what it has.
