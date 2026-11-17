# k4-pilot-cplus: the table and the criteria

6 of 6 runs recorded (0 void attempts apart); $0.24 spent. **The pilot: undecided (the pilot is extended).**

| Task | Arm | Runs | Successes | Tokens (sum) | Tokens (mean) | Cost | Minutes (mean) | Explore share of bytes | Files read before the first edit | Unnecessary files read | `knowledge` calls | Recall (task 4) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1-cancelled-stay-hides-contacts | A | 0/0 | 0 | 0 | – | $0 | – | – | – | – | – | – |
| 1-cancelled-stay-hides-contacts | B | 0/0 | 0 | 0 | – | $0 | – | – | – | – | – | – |
| 1-cancelled-stay-hides-contacts | C | 1/1 | 1 | 568932 | 568932 | $0.01 | 1.1 | 85% | 8 | 3 | 3 (1 runs before an edit) | – |
| 2-phone-numbers-with-hyphens | A | 0/0 | 0 | 0 | – | $0 | – | – | – | – | – | – |
| 2-phone-numbers-with-hyphens | B | 0/0 | 0 | 0 | – | $0 | – | – | – | – | – | – |
| 2-phone-numbers-with-hyphens | C | 1/1 | 1 | 531732 | 531732 | $0.02 | 4.6 | 87% | 5 | 1 | 1 (1 runs before an edit) | – |
| 3-message-notice-names-the-listing | A | 0/0 | 0 | 0 | – | $0 | – | – | – | – | – | – |
| 3-message-notice-names-the-listing | B | 0/0 | 0 | 0 | – | $0 | – | – | – | – | – | – |
| 3-message-notice-names-the-listing | C | 1/1 | 1 | 1523786 | 1523786 | $0.04 | 9.7 | 82% | 12 | 3 | 2 (1 runs before an edit) | – |
| 4-review-window-impact | A | 0/0 | 0 | 0 | – | $0 | – | – | – | – | – | – |
| 4-review-window-impact | B | 0/0 | 0 | 0 | – | $0 | – | – | – | – | – | – |
| 4-review-window-impact | C | 1/1 | 1 | 520303 | 520303 | $0.02 | 6.1 | 94% | 5 | 1 | 2 (1 runs before an edit) | 1 |
| 5-domain-time-is-given | A | 0/0 | 0 | 0 | – | $0 | – | – | – | – | – | – |
| 5-domain-time-is-given | B | 0/0 | 0 | 0 | – | $0 | – | – | – | – | – | – |
| 5-domain-time-is-given | C | 1/1 | 1 | 2330654 | 2330654 | $0.12 | 7.8 | 84% | 13 | 1 | 2 (1 runs before an edit) | – |
| 6-archive-a-conversation | A | 0/0 | 0 | 0 | – | $0 | – | – | – | – | – | – |
| 6-archive-a-conversation | B | 0/0 | 0 | 0 | – | $0 | – | – | – | – | – | – |
| 6-archive-a-conversation | C | 1/1 | 1 | 1032236 | 1032236 | $0.03 | 5.2 | 90% | 11 | 5 | 2 (1 runs before an edit) | – |
| **all** | **A** | 0/0 | 0 | 0 | – | $0 | – | – | – | – | 0 | |
| **all** | **B** | 0/0 | 0 | 0 | – | $0 | – | – | – | – | 0 | |
| **all** | **C** | 6/6 | 6 | 6507643 | 1084607 | $0.23 | 5.7 | 86% | 9.5 | 2 | 12 | |

**Criterion 1 — undecided.** C 6 successes and 6507643 tokens; B 0 and 0; C's tokens are – of B's, below 80% on 0 of 6 tasks (1: –, 2: –, 3: –, 4: –, 5: –, 6: –). Holds when C's successes are 2 or more below B's or its tokens 90% of B's or more; does not hold when its successes are at least B's, its tokens 70% or less, and below 80% on at least 4 tasks.

**Criterion 2 — does not hold.** Task 4's recall (files and tests pooled): C 1 (mean 1); B – (mean –). Holds when C's mean is B's or lower; does not hold when each of C's recalls is above the highest of B's.

Arm A is read beside B and C as the conventional baseline; it decides nothing.
