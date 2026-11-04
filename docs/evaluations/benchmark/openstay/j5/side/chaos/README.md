# Chaos on the money: a hidden suite of its own

The side experiment of the [J5 proposal](../../proposal.md#the-side-experiments): run on every final tree (three simple, three Clean DDD) after J5, and scored like the hidden tests, where each failing case is a defect counted against that tree. It changes no request. It tests what the money requests (26 to 39, 46, 47, 72, 80, 87, 89, 90, 100) already promise, under failures and concurrency. Every assertion is traced to a sentence of a request or to an invariant of the [brief](../../../brief.md), and reads what happens behind an answer with `eventually()`.

The suite uses the acceptance support as it is (`../../acceptance/openstay.ts`, `provider.ts`) and adds one file of its own, [`faults.ts`](faults.ts):

- **a gate** between each server and the provider. Each server gets its own door, set by `PAYMENT_PROVIDER_URL`. The gate forwards every request unchanged, `Idempotency-Key` included. It can **hold** a request before it reaches the provider, to catch a sweep half-way through. It can also let the provider act and answer, then **kill** the server the request came from before the answer comes back: the crash falls between the provider's call and the write that records it;
- **`deliverTo(port, event)`**: one webhook, correctly signed, sent to a chosen server, so the same event can reach two servers at once;
- **`cluster`**: several servers on one database, each behind its own door, started again after a kill.

Each file uses its own databases, provider and ports, and is meant to finish in under 5 minutes. Amounts are in EUR, except in the cases about currencies.

## The cases

| File | Case | What it holds |
| --- | --- | --- |
| [1](1-concurrent-refunds.chaos.ts) | two host refunds of 8,000 on a payment of 12,000, sent to two servers at once | 32: "so is the second of two made at the same moment when both together would"; invariant 5 |
| | a cancellation and a host refund, sent to two servers at once | 31: the refundable amount, "or what is left of what was paid"; never more |
| | a claim decided for the traveller and two host refunds, sent to two servers at once | 72: "A decision and a host's refund made at the same moment never together exceed what was paid"; the claim gets the amount decided or what is left |
| [2](2-weekly-payouts-two-servers.chaos.ts) | a weekly host's payout, computed by two servers at once | 47: "everything due … is paid in one payout"; 89: "Each booking is paid out once … on two servers on one database" |
| | the same, with a server killed after the provider answers and before the write | 33: "never twice, even across a crash"; 47: "Nothing lost" |
| | the same in EUR and GBP | 89: "one payout for each currency in which something is due" |
| [3](3-webhooks-replayed.chaos.ts) | a payment success and a donation success, delivered reversed, twice, to two servers and across a crash | 29: "changes things once", "`succeeded` is final"; 46: one receipt; 80: no receipt for a donation |
| | a refund success delivered three times, then a failure for the same refund | 29: "a failure that arrives after a success … changes nothing"; 31: nothing is asked again |
| | a payout paid delivered the same way, then a failure | 29: a success is final; 34: "never both read `paid`"; 35: one statement line |
| [4](4-crash-after-provider-call.chaos.ts) | a crash after the provider answers a **payment** | 27: "gives the same payment, never a second one"; 26: `Idempotency-Key` |
| | the same for a **refund** | 31: "asked again"; invariant 4: exactly one at the provider, and the platform agrees with it |
| | the same for a **payout** | 33: "never twice, even across a crash"; 100: "even when a server is killed between asking the provider and recording it" |
| | the same for a **donation** | 80: "The provider is asked once per donation, even when a server is killed" |
| [5](5-receipts-numbered.chaos.ts) | payments, refunds and donations succeeding at once on two servers, with one server killed | 46: "from 1 … with no gap and no number given twice … across two servers, and across a crash"; 80: a donation "takes no receipt" |
| | each success delivered to both servers at once, twice | 46: one number for each success |
| [6](6-reconciliation-after-chaos.chaos.ts) | one day of all the faults above, then the reconciliation on both servers | 37: every pair matched, no mismatch; 80: donations reconciled; 87: matched by currency |
| [7](7-pause-mid-sweep.chaos.ts) | a pause answered while another server's sweep is half-way through | 100: "From the moment the pause is answered, no server sends any payout"; "A payout sent before the pause goes on"; "Nothing is lost" |
| | a weekly sweep's server killed as the provider answers, started again while paused, then both servers resume at once | 100: "A server started while payouts are paused starts paused"; "never twice … or when two servers resume at once" |
| [8](8-retries-on-two-servers.chaos.ts) | a failed payout, replaced by two servers, with one killed as the provider answers | 34: "paid by a new payout"; "Never twice" |
| | a failed refund, asked again by two servers, with its failure delivered to both and one server killed | 31: "is asked again, until it succeeds", once |
| | a payment that succeeds after its booking lapsed, its success delivered to both servers at once and twice | 30: "refunded in full"; invariant 4 |

Request 90 changes nothing here: no country is put on the list, so the fee stays the host's everywhere.

## Running it on a tree

The chaos files import the support the way the kit lays it out: `'../../acceptance/openstay'`, `'../../acceptance/provider'`. That is how they typecheck where they sit. [`grade.mjs`](../../../../../../../.claude/flow/grade.mjs) copies the kit's `acceptance/` flat into `src/Bootstrap/Fastify/Acceptance/` (into `src/acceptance/` for the plain control arm). Copying the chaos files next to them therefore means rewriting that prefix to `./`, and nothing else. From the root of this repository, on the graded worktree `$TREE`:

```sh
ACC=$TREE/src/Bootstrap/Fastify/Acceptance          # $TREE/src/acceptance for the plain control arm
J5=docs/evaluations/benchmark/openstay/j5
cp $J5/acceptance/openstay.ts $J5/acceptance/provider.ts "$ACC/"   # already there after grade.mjs
for f in $J5/side/chaos/*.ts; do sed "s#'\.\./\.\./acceptance/#'./#" "$f" > "$ACC/$(basename "$f")"; done
for f in $J5/side/chaos/*.chaos.ts; do                  # one file at a time, as grade.mjs runs a feature
  (cd $TREE && ACCEPTANCE_ENTRY=src/Bootstrap/Fastify/application.ts \
    yarn -s test --testMatch "**/Acceptance/$(basename "$f")")   # src/server.ts and **/acceptance/ for the plain arm
done
```

`faults.ts` is copied with the others. It is not a test, so `--testMatch` never picks it up. The PostgreSQL server of the kit (`OPENSTAY_POSTGRES`) must be running, as for the hidden tests. As `grade.mjs` does, do not start a file in the last ten minutes of a UTC day.

Typecheck: `/tmp/claude-0/openstay/j5/typecheck-chaos.sh` lays out `acceptance/` and `side/chaos/` as the kit does, and must print nothing.
