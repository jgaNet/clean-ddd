# One repair per triaged failure (decided by the maintainer on 9 November, during J5)

Full+ and Simple+ were not treated alike. Full+ got three corrections of its kit, each probed and reworded until
it held, on all three Clean DDD trees. Simple+ got one sentence, on two of the three simple trees, and simple-2 was
never continued. A tree of either arm that failed after that stopped for good. The two follow-on arms could not be
compared.

From 9 November, the same rule holds for every tree of both arms. A tree that stops on a failure the triage
([`triage.md`](triage.md)) judged real is repaired once, and continues:

1. **Diagnose.** The failure is read from the tree's code, and the earlier request whose rule the tree broke is
   named.
2. **Correct, in the arm's own medium.** For both arms, a section of the tree's guide (`CLAUDE.md`), committed by the
   maintainer on the tree's `main`. A correction states a rule that holds for every feature; it never gives a test's
   answer and never names a test.
3. **Replay.** The tree continues from the request it failed, under its correction. That replay is the correction's
   probe. If it fails at every step again, the correction may be reworded once, and the request is replayed again.
   A second failure after the rewording stops the tree for good.
4. **Count.** The replay is counted as the tree's second attempt at that request, and its cost is the tree's. The
   correction is the maintainer's work, recorded with the arm's cost, as a storm is.

**Which trees a correction reaches.** The tree that failed, and every tree of the same arm that has not reached the
request it came from, as a kit amendment does (triage rule 1). A tree already past that request is not touched, so
that no running tree is changed under its feet. A failure two arms share gets the same words in both.

**What stays.** The verdicts already given stand: the record counts each stop. The repaired runs are new runs on the
same trees (`…-r1`), from the same `main`, with the same ladder, budget per attempt and grader. The fixes to the bench
apply everywhere: test 71, the budget across resumes, and a file that fails without naming a test.

**What it measures.** Not only how far a tree goes, but how many repairs it takes to reach a hundred, and what they
cost. Every correction is written after its failure was seen, so the requests after it are the only out-of-sample
test, as for Full+ and Simple+.

## The corrections

### R1 — Time and reads (from simple-1's second failure on 73)

Simple-1's replay of 73, under the CQS sentence of the probe ("a read never changes what is stored … what changes with
time is changed by the background job, never by a read"), dropped a read-time behaviour request 7 decides ("it reads as
expired as soon as its time has passed, without anyone having to act on it first"). The sentence said what a read must
not do, not that a read still shows what time has changed. It replaces that sentence.

> ## Time and reads
>
> A read never stores anything: a `GET` answers from what is stored. Each request says when a change that comes with
> time shows, and there are two ways:
> - when it shows as soon as its time has passed, with nobody acting, every read derives it from what is stored (the
>   status, the history, the lists that show it), and stores nothing;
> - when it happens at the next sweep, or when the job runs, the background job stores it on its schedule, and reads
>   show it once it is stored.

Reaches: simple-1 (replacing the probe's sentence), simple-2.

### R2 — A refusal (from request 80: simple-3 and Full+ clean-1)

Both trees answered `503` for a donation without a provider, a convention each took at request 26. Request 1 decides
what a refusal is. The same words for both arms.

> ## A refusal
>
> A refusal is what request 1 says: a `4xx` answered at once, or an operation that ends in `ERROR`. A server that lacks
> what it needs to do what is asked (an outside system that is not configured, a provider that is missing) refuses: it
> never answers `5xx`. A `5xx` says the server itself is broken.

Reaches: simple-3, Full+ clean-1; simple-1, simple-2 and Full+ clean-2, which have not reached 80.

### R3 — The API's shapes (from Full+ clean-2's failure on 61)

The tree gave an operation's error as the exception it carried, which read `[object Object]`, where request 61 asks
for the rule's name. Every model saw the conflict and kept the tree's shape. Corrections 1 and 3 of
[`next-campaign.md`](next-campaign.md), in one section; its correction 2 (narrowing the tree's ADR 57) stays for the
next campaign.

> ## The API's shapes
>
> When a request fixes what the API answers, its shape wins over the code's own habit: change the code that projects
> the answer, not the request. An operation's error is the name of the rule that refused it (`"<NAME>"`), the same name
> a refusal at once carries.

Reaches: Full+ clean-2 (no other tree of its arm is before 61).

### R4 — What is owed and what was moved (from simple-2's failure on 66)

At requests 32 and 36 the tree began storing a cancellation's `refundable` as what was still to send through the
provider: less the host's own refunds, and `0` for a booking declared paid directly. Request 66 asks for a
cancellation whose `refundable` is the whole total, as a host's cancellation is (request 8), and a refund capped by
what is left. With one stored value for both, steps 0 and 1 asked the provider for more than was left, and step 2
answered `refundable: 0`. Request 8 had said it: "what is owed and what was refunded are two different things, and
they stay apart"; request 31 caps the refund, not the refundable amount.

> ## What is owed and what was moved
>
> Each value a request names is stored as that request defines it. A later rule that limits it (a cap, an exemption,
> what was already refunded or paid out) is applied where the value is used, not by changing what is stored. What a
> decision says is owed and what was actually moved are two values, and they stay apart.

Reaches: simple-2 (the other simple trees are past 66).

### R0 — A rule given late (with every correction)

The CQS probe showed it, and ADR 37 of the reference says it: a rule given late reaches new code, not the code it
should have shaped. Every repaired tree gets this section with its first correction.

> ## A rule given late
>
> A section of this guide may have been written after code that does otherwise. The change that follows it brings that
> code to it: find it, change it and its tests, and run the earlier tests again.
