# J5: what is proposed to the maintainer

J5 is the framing's phases 3 and 4 ([j0](../j0.md#the-later-phases)): the complete marketplace (messaging, reviews, moderation, disputes, support, sustainability), then internationalisation (languages, currencies, local rules, taxes, calendar sync). Features 51 to 100 run on the six trees of J4, from their J4 heads, each from the smallest model up, graded on 1 to n after every attempt. The eight side experiments the maintainer decided on 2026-11-02 and 2026-11-03 run beside the ladder. Nothing here is decided until the maintainer says so.

## The features

Every earlier rule stays true, so that the fifty earlier hidden tests stay valid regressions. A new obligation starts empty: a city that requires a registration number, a version of the terms to accept, a country that allows card fees to be passed on, all exist only once an administrator sets them. A server started as the earlier tests start it behaves as before.

### Phase 3: the complete marketplace

| # | Feature | What it asks |
| --- | --- | --- |
| 51 | Conversations | A traveller writes to a listing's host, about the listing or one of their bookings. Only the two read it, and the host's collaborators who may manage bookings. Messages come back in the order they were sent. |
| 52 | Unread messages | Each party sees what they have not read, per conversation and in all. Reading a conversation marks it read for the reader only. |
| 53 | Contact details held back | Until a booking between the two is paid (or declared paid by the host), an email address, a phone number or an IBAN in a message is masked for its recipient. The sender sees what they wrote. |
| 54 | Attachments | A message may carry a file: PDF, JPEG or PNG, at most 5 MB, its type read from its content and not from its name. Only the two parties download it. |
| 55 | Notices of new messages | The other party gets a notice for a new message, at most one per conversation in a window of `MESSAGE_NOTICE_WINDOW_SECONDS`, and never for their own. |
| 56 | Reporting a message | The recipient reports a message with a reason. It is hidden from the reporter at once, and goes to moderation (64). |
| 57 | A review after a stay | The traveller of a stay that took place (checked out; not cancelled, not lapsed) reviews it within 14 days of the check-out, once: a rating from 1 to 5 for cleanliness, accuracy and communication, and a comment. |
| 58 | The host reviews the guest | In the same window. Both reviews of a stay stay hidden until both are written or the window closes, so that neither answers the other. |
| 59 | Ratings | A listing's average per criterion and its count, of published reviews only, on the listing and in the search results. A host's, across their listings. |
| 60 | The host's reply | One public reply per review of the host's listing, final once written. |
| 61 | Review rules | The published rules: a comment of 20 to 2,000 characters, with no contact details and no links. A review that breaks them is refused with the rule it breaks. A published review can be reported. |
| 62 | Sorting by rating | Search may be sorted by rating. The order is documented in the answer (`order`), unrated listings come last, and ties keep the published order. |
| 63 | Reporting a listing | A signed-in user reports a listing, with a reason from a list. One open report per person and listing. |
| 64 | The moderation queue | Administrators see the open reports on listings, messages and reviews, oldest first, and close each one: dismissed or upheld. |
| 65 | Upholding a report | An upheld listing is suspended by moderation: its host cannot publish it again until an administrator reinstates it. An upheld review is removed, and the ratings follow. An upheld message is hidden from both parties. |
| 66 | Suspending an account | An administrator suspends an account, with a reason. It can no longer sign in, and its tokens are refused. Its published listings leave search. Its upcoming confirmed bookings as a host are cancelled by the platform and refunded in full. Reinstating it restores the sign-in only. |
| 67 | The audit log | Every administrator decision (a report closed, an account suspended or reinstated, a listing reinstated or verified, a claim decided) is recorded with who, when, what and why. Nothing in it changes or goes. Administrators read it by subject. |
| 68 | Suspicious accounts | An account is flagged when it cancels more than 3 bookings in 24 hours, or sends the same message to more than 5 hosts in an hour. Administrators see the flags. A flag decides nothing by itself. |
| 69 | Direct payment instructions | A host sets an IBAN for direct payments, checked by its checksum. The traveller of a booking paid directly sees it, and only that traveller. An IBAN changed in the last 7 days is shown with a warning: a false IBAN is the brief's fraud to prevent. |
| 70 | Listing verification | An administrator verifies a listing's address, and the listing shows it. Changing its city or its location removes the verification. |
| 71 | Claims after a stay | The traveller or the host opens a claim on a stay within 14 days of the check-out, with an amount. The other party answers. An administrator decides. |
| 72 | A claim decided with money | A decision for the traveller on a booking paid through the provider refunds them, never more than is still refundable (invariant 5). On a booking paid directly, the decision is recorded and nothing more: the platform guarantees no direct refund (§4.8). |
| 73 | Proof of a direct payment | The traveller attaches a transfer proof to a direct payment, and the host confirms or contests it. Without either by its deadline, it is unconfirmed. It is never verified (invariant 11). |
| 74 | Support | A signed-in user opens a ticket; administrators answer. It is open, answered, then closed, and the user's reply reopens it. A user sees their own tickets only. |
| 75 | Notice preferences | Each user turns each kind of notice on or off. Notices about payments and security cannot be turned off. |
| 76 | Email verification | A code goes to the account's email through the notice service. The account shows whether its email is verified. Changing the email clears it. A code expires, and five wrong attempts spend it. |
| 77 | Two-factor sign-in | An account may turn on time-based codes (RFC 6238). Signing in then needs a code. Ten recovery codes, each good once. A code cannot be used twice. |
| 78 | Trader information | A host who declares themselves professional gives a legal name, a registration number and an address. Their listings show it; a private host's show none. |
| 79 | Registration numbers by city | An administrator sets the cities that require a registration number, with its format. A listing in such a city cannot be published without a valid one. |
| 80 | Donations | Anyone may give OpenStay a voluntary donation through the provider: alone, or beside a booking's payment as a payment of its own. It is never part of a booking's total, and never a commission. |
| 81 | Donations never rank | A donation changes nothing in search, and search shows nothing of it (invariant 9). Donors choose to be listed by name or not. |
| 82 | Transparency indicators | A public page per month: the bookings, the provider's fees, the donations, and the cost per booking, from the running costs an administrator enters for the month. |
| 83 | The cost of payments | Administrators see the provider's fees by month, by way of paying (provider or direct), and who bore them. |

### Phase 4: internationalisation

| # | Feature | What it asks |
| --- | --- | --- |
| 84 | Countries | A listing has a country (ISO 3166). One published before this request is in `FR`. |
| 85 | A listing in several languages | The title and the description in several languages, one of them the default. A traveller asking with `Accept-Language` gets the best match. |
| 86 | The user's language | An account has a language, and every notice to it carries that language. |
| 87 | Currencies | A listing is priced in EUR, GBP, CHF or JPY, and every amount that follows from it (quote, booking, payment, refund, payout, statement) is in that currency, in its own minor units. A listing published before this request is in EUR. |
| 88 | Indicative prices | Search and quotes may show an amount in the traveller's chosen currency, at the rates an administrator sets, marked indicative. The booking and its payment stay in the listing's currency. |
| 89 | Payouts per currency | A host is paid in each currency separately. A weekly payout is one per currency. The statement and the earnings by month are per currency. |
| 90 | **Card fees passed on where the law allows** (not announced in advance) | An administrator sets the countries where a card fee may be passed on. There, the traveller pays the provider's fee on top of the total, shown on the quote before booking (invariant 10), from the provider's published fee schedule, and the host is paid the host's lines in full. Everywhere else nothing changes. |
| 91 | Tourist tax set by the city | An administrator may set a city's rule: per guest and night, or a share of the night's price capped per guest and night; children under an age the city sets are exempt. Where the city has a rule, it replaces the host's declaration. |
| 92 | Tax rates that change on a date | A city's rule starts on a date. Each night is taxed by the rule in force that night. A quote already given does not change. |
| 93 | A cap on nights per year | An administrator sets a city's cap on the nights a listing is booked in a calendar year. A booking past it is refused, two at once included. |
| 94 | The yearly report on hosts | Per host and year: the bookings, the nights, the amounts paid through the provider and the fees, per country. A host with 30 bookings or 2,000 euros in a year is marked reportable (DAC7). |
| 95 | Calendar export | A secret iCalendar URL per listing, with its booked and blocked nights. The host can replace the secret. |
| 96 | Calendar import | A host links an outside calendar URL. Its events block nights at each sweep; an event that disappears frees its nights. |
| 97 | Import conflicts | An imported event that overlaps a confirmed booking blocks nothing on those nights. The host gets a notice and sees the conflict listed. |
| 98 | Versions of the terms | An administrator publishes a version of the terms. A user must accept the current version before their next booking or publication, and each booking keeps the version its traveller accepted (invariant 8). |
| 99 | The operations dashboard | Administrators see, at once: today's bookings, failed payments, held payouts, open reports, open claims, unanswered tickets. |
| 100 | Pausing payouts | An administrator pauses every payout during an incident. Payouts wait, nothing is lost, and resuming pays each one once (invariant 4). |

**The change not announced in advance: 90.** It is the framing's example, a rule of the brief that changes ([§2.2](../brief.md)): until 90, the host bears the provider's fee everywhere. Nothing in requests 51 to 89 says that this rule will change. It reaches the quote, the booking's total, the payment, the payout, the statement, the receipts and the earnings.

**For the Clean DDD arm,** the storms decide where the new language lives: messaging, reviews, moderation, claims and support, sustainability, calendar sync. A second proposal, the storms' hot spots, follows this one once its features are decided, as at J4.

## The side experiments

Each runs from the same commit as the ladder's one agent, on a copy of the tree, with the same request and the same ladder, and is written and rehearsed before J5 starts.

| Experiment | Arm | Features or trees | What is measured |
| --- | --- | --- | --- |
| **Fan-out by context** (`run-slices.mjs`) | Clean DDD | 66, 72, 87, 90: the four widest | Cost, time, escalations and hidden tests, beside the one agent |
| **Disjoint features in parallel** | Clean DDD | 85 with 95, and 75 with 79: no context in common | Wall time and merge conflicts, beside running them in turn |
| **Generated boilerplate** | Clean DDD | 66, 72, 87, 90 | The share of the cost that is the layers rather than the rules; the generated tree read with the rubric, so that a rule hidden in the generated files is seen |
| **A limited context** (about 30,000 tokens) | Both | 59, 75, 93, 95 | Whether a slice of a context keeps the cost flat when the whole tree no longer fits |
| **Vague requests** | Both | 53, 68, 79, 98, rewritten in product words, with no route, body or status | Escalations, amendments the requests needed, cost; the maintainer's answers count as the Clean DDD arm's cost |
| **Chaos on the money** | Both | Every final tree | A hidden suite of its own: concurrent refunds and payouts, webhooks replayed while a server restarts, a crash between the provider's call and the write that records it |
| **A maintainer who did not write the tree** | Both | Every final tree | The three change probes of J4's reading, carried out by a fresh agent: a second provider, a cleaning fee per stay, a minimum payout. Graded by their own hidden tests and every earlier one; cost, files read and regressions counted |
| **Debugging** | Both | Every final tree, ten defects | A fresh agent gets the symptom a user would report. How many it fixes, its cost, and the regressions its fix causes |
| **Review** | Both | Every final tree, six pull requests, three of them carrying a defect | The defects found, missed and reported that are not there |

**What the kit must settle first, or drop:**
- **The context cap.** The agent's CLI has no switch for a 30,000-token context. The kit rehearses a way to hold it (an early compaction threshold, or a smaller window if the CLI offers one). If none holds, the experiment is dropped and the record says so.
- **The vague requests' answers.** A Clean DDD agent asks its questions in the storm, and the maintainer answers them before the run. A simple agent cannot ask anyone: it decides alone, as a developer handed a vague ticket would. The hidden tests are the precise requests', so a guess that differs is a failure, in both arms.
- **The defects and the pull requests are per tree.** Each tree's code is different, so a fresh agent writes each defect into each tree. The kit checks that each one fails exactly the hidden test it should, and nothing else, before any debugging agent sees it.

## What the kit needs

- **The fifty requests, their hidden tests, and the J4 lessons:**
  - each request repeats every detail of an earlier request it depends on;
  - each request, its storm and its test are read side by side before the kit is frozen;
  - the test writer and the reviewer are two fresh agents, as before.
- **A provider that grows:**
  - currencies;
  - a published fee schedule (90);
  - payouts that can be paused (100).
- **Outside calendars the tests serve** (96, 97), and files the tests upload (54, 73).
- **A solvability tree,** written from the requests by an agent, on the J4 solvability tree.
- **The harness changes J4 asked for:**
  - a continued agent's cost stored as the difference;
  - a failing gate replayed alone before an escalation;
  - a PostgreSQL role and database prefix per tree, so that one tree's teardown cannot drop another's;
  - the disk sweeps run by the harness.
- **`dry-run`**, then every tree graded on 1 to 50 at its J5 start.

## The cost and the time

**What J4 measured.** J4 cost $158.32 for 25 features on six trees, counted once per agent:
- $0.57 per feature and tree in the simple arm;
- $1.46 in the Clean DDD arm.

The trees are larger now, and messaging and currencies are wide changes. A third more per feature gives:

| Part | Estimate | Proposed ceiling |
| --- | --- | --- |
| The ladder, 51 to 100, six trees | about $400 | $480: $50 per simple tree, $110 per Clean DDD tree |
| The kit: test writer, reviewer, solvability tree, defects and pull requests | about $100 | $120 |
| The side experiments | about $300 | $300 |
| **Total** | **about $800** | **$900** |

**Time.**
- **The kit:** a day.
- **The ladder:** three days, four trees at once as at J4.
- **The side experiments:** a day.
- **The readings and the record:** half a day.

**If the budget is to be smaller,** the side experiments are what can be cut without touching the series:
- the fan-out and the generated boilerplate on two features instead of four saves about $60;
- the review and the debugging on one tree per arm instead of three saves about $70.
