# k4-pilot: the table and the criteria

48 of 54 runs recorded (0 void attempts apart); $1.78 spent. **The pilot: incomplete.**

| Task | Arm | Runs | Successes | Tokens (sum) | Tokens (mean) | Cost | Minutes (mean) | Explore share of bytes | Files read before the first edit | Unnecessary files read | `knowledge` calls | Recall (task 4) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1-cancelled-stay-hides-contacts | A | 3/3 | 3 | 1105259 | 368420 | $0.04 | 2.5 | 91% | 9 | 3 | – | – |
| 1-cancelled-stay-hides-contacts | B | 3/3 | 3 | 1569534 | 523178 | $0.04 | 3.6 | 87% | 7 | 3 | – | – |
| 1-cancelled-stay-hides-contacts | C | 2/3 | 2 | 1144709 | 572355 | $0.03 | 4.3 | 87% | 7.5 | 3 | 0 (0 runs before an edit) | – |
| 2-phone-numbers-with-hyphens | A | 3/3 | 3 | 892208 | 297403 | $0.04 | 7.1 | 93% | 10 | 6 | – | – |
| 2-phone-numbers-with-hyphens | B | 3/3 | 3 | 1099097 | 366366 | $0.04 | 3.6 | 78% | 4 | 0 | – | – |
| 2-phone-numbers-with-hyphens | C | 2/3 | 2 | 631764 | 315882 | $0.03 | 3.7 | 79% | 5.5 | 1.5 | 0 (0 runs before an edit) | – |
| 3-message-notice-names-the-listing | A | 3/3 | 3 | 2731293 | 910431 | $0.08 | 5.5 | 90% | 19 | 6 | – | – |
| 3-message-notice-names-the-listing | B | 3/3 | 3 | 3217359 | 1072453 | $0.09 | 9.2 | 87% | 16 | 3 | – | – |
| 3-message-notice-names-the-listing | C | 2/3 | 2 | 2313949 | 1156975 | $0.06 | 7.2 | 86% | 13.5 | 3.5 | 2 (1 runs before an edit) | – |
| 4-review-window-impact | A | 3/3 | 3 | 1832772 | 610924 | $0.07 | 1.4 | 100% | 15 | 3 | – | 0.8571, 1, 1 |
| 4-review-window-impact | B | 3/3 | 2 | 2466097 | 822032 | $0.09 | 2.9 | 99% | 15 | 5 | – | 0, 1, 1 |
| 4-review-window-impact | C | 2/3 | 2 | 1491139 | 745570 | $0.05 | 3.6 | 85% | 13.5 | 3.5 | 3 (2 runs before an edit) | 1, 1 |
| 5-domain-time-is-given | A | 3/3 | 3 | 7367671 | 2455890 | $0.33 | 14.2 | 90% | 13 | 3 | – | – |
| 5-domain-time-is-given | B | 3/3 | 3 | 5877589 | 1959196 | $0.23 | 5 | 83% | 17 | 4 | – | – |
| 5-domain-time-is-given | C | 2/3 | 2 | 3670886 | 1835443 | $0.17 | 6.9 | 91% | 16 | 3 | 0 (0 runs before an edit) | – |
| 6-archive-a-conversation | A | 3/3 | 3 | 5341647 | 1780549 | $0.13 | 7.1 | 90% | 15 | 11 | – | – |
| 6-archive-a-conversation | B | 3/3 | 3 | 5090991 | 1696997 | $0.13 | 7.6 | 90% | 8 | 4 | – | – |
| 6-archive-a-conversation | C | 2/3 | 2 | 2274828 | 1137414 | $0.06 | 6.9 | 86% | 5 | 3 | 0 (0 runs before an edit) | – |
| **all** | **A** | 18/18 | 18 | 19270850 | 1070603 | $0.69 | 6.3 | 91% | 14 | 5 | 0 | |
| **all** | **B** | 18/18 | 17 | 19320667 | 1073370 | $0.62 | 5.3 | 87% | 12 | 3.5 | 0 | |
| **all** | **C** | 12/18 | 12 | 11527275 | 960606 | $0.41 | 5.4 | 86% | 10.5 | 3 | 5 | |

**Criterion 1 — incomplete.** C 12 successes and 11527275 tokens; B 17 and 19320667; C's tokens are 60% of B's, below 80% on 6 of 6 tasks (1: 73%, 2: 57%, 3: 72%, 4: 60%, 5: 62%, 6: 45%). Holds when C's successes are 2 or more below B's or its tokens 90% of B's or more; does not hold when its successes are at least B's, its tokens 70% or less, and below 80% on at least 4 tasks.

**Criterion 2 — incomplete.** Task 4's recall (files and tests pooled): C 1, 1 (mean 1); B 0, 1, 1 (mean 0.6667). Holds when C's mean is B's or lower; does not hold when each of C's recalls is above the highest of B's.

Arm A is read beside B and C as the conventional baseline; it decides nothing.
