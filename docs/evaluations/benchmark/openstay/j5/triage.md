# Triage: before a feature every model failed is called FAILED

Written on 6 November, during J5, before any of the failures it will judge. Two of J5's failures had been the
kit's (an upload refused before it was read, read by the client as a broken connection; a field the request
never defined); both were found by hand, after three models had paid for them. This file is how such a
failure is told from a real one, the same way for every tree, without knowing which arm a tree is in.

## When

The ladder no longer records `failed` when the last model fails. It records `needs-triage` and stops the tree,
with a note: each step's escalation, the tests it failed and what they said; whether every step failed the
same tests; how many tests; and, when the plan names a judge, the judge's answer.

## The judge

The intermediate model reads the request as the implementer did, the failing assertions, and the hidden
test; never the tree's code, its arm, or the other trees. It answers one question: does the request's text
decide what the failing assertions expect? With the words that decide it, or why it does not.

## The rule

A feature is **the kit's**, and the tree is credited at the step whose head passes once the kit is fixed,
when one of these holds:

1. **The request does not decide it.** The judge finds no words that decide the expected value, and the
   maintainer, reading the request, agrees that a careful reader could take it another way. The request
   is made to decide it, for the trees that have not reached it, and the test accepts the reading the old
   text allowed.
2. **The test cannot see a correct answer.** A correct answer under request 1 (a `4xx` refusal, a `202`
   with its outcome later) fails the test for a reason outside the tree: the transport, the clock, the
   load. Shown by a probe that reproduces it on the tree's own server, not argued.
3. **The harness.** The failure comes from the machine (a dependency missing, a server down, a disk full),
   shown by the failure going away on the same head once the machine is fixed.

Otherwise the feature is **FAILED**, and the tree stops, as the rule written before the runs says. A failure
every model makes identically is a reason to look, not a reason to credit; one test failing is not either.

## How it is recorded

The maintainer appends `triaged` to the tree's log with the verdict (`failed` or `kit`), the rule it rests on,
and the evidence (the probe, the regrade). A `kit` verdict is followed by `corrected` and `delivered` events as
for simple-1's request 54 and simple-3's request 71; the cost of the steps the kit made the tree pay is set
apart. Every verdict, either way, is listed in the record with its evidence.
