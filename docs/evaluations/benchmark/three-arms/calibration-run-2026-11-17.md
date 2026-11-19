# J6's calibration, run on 17 November: the three arms stop at request 6, on one hidden case of the kit

The calibration of [the registration](registration.md) (its amendment of 16 November), run as decided: `cal-plain`,
`cal-lite` and `cal-full` at once, one ladder each, on the machine the K4 pilot ran on, from 02:19 to 04:15 UTC, with
the plans in [`plans/`](plans), the kit frozen at `/var/lib/cdd-frozen/r16/calibration`, Claude Code 2.1.326 (the CLI
updated itself from 2.1.325 between the pilot and the calibration; the ladder now logs it). **It is not counted.** The
logs are `/var/tmp/j6cal/trees/cal-<arm>.flow/j6-cal-<arm>.jsonl` and the trees' `main` and logs are pushed to
`/var/tmp/j6cal/remotes/cal-<arm>.git` (`trees/cal-<arm>`, `logs/cal-<arm>`).

## What each tree did

| | cal-plain | cal-lite | cal-full |
| --- | --- | --- | --- |
| Delivered | 5 (1–5), all at step 0 | 5 (1–5), all at step 0 | 5 (1–5); 1 and 5 at step 1 (sonnet) |
| Escalations before 6 | none | none | `accounts` (haiku: the hidden case "refuses a body of the wrong shape at once with 400…"), `quote` (haiku: "is read by the traveller who asked for it only…") |
| Stopped at | 6 `book-instantly`, every step | 6 `book-instantly`, every step | 6 `book-instantly`, every step |
| Attempts | 9 | 8 | 10 |
| Cost | $2.65 | $7.55 | $10.63 |
| Agent minutes | 37 | 72 | 89 |
| Turns, median per attempt | 17 | 40 | 42 |
| Cost per feature at step 0 (1 to 6) | 0.05, 0.04, 0.03, 0.11, 0.11, 0.14 | 0.69, 0.53, 0.44, 0.44, 0.71, 1.03 | 0.84, 0.44, 0.37, 0.37, 1.21, 0.68 |

Per delivered feature at step 0, Lite cost 10 times the plain tree and Full 9 times, on the first five requests of a
kit written for OpenStay's pilot; the ratio is the one the pilot and J3 found for Full against Simple, and Lite sits
with Full, not between. Five features of one tree each decide nothing; that is what the calibration is for.

## The finding: one hidden case stops the three arms, and the judge calls it undetermined

Request 6's hidden test *lists a traveller's bookings and a listing's, the most recent first, to them only* expects
**404** when a stranger, or another host, reads a booking that is not theirs. All three trees answered **403**, at
every step of the ladder (haiku, sonnet, opus: nine attempts, the same case each time, confirmed by the replay alone).
The triage judge (`claude-sonnet-5-5`, J5's rule, given the request's text and the failing case) said **not
determined** for each tree, in the same words: *"The request says only who sees a booking, not what a non-party
receives. It never says a stranger gets 404 rather than 403, and 'The API works as request 1 says' defers to a document
the implementer could not see here."*

Where the 404 comes from: the kit's [decision 4 of 13 November](calibration/README.md#decided-by-the-maintainer-13-november)
(*"a signed-in caller who asks for something that does not exist, or that they may not see, gets 404"*, ADR 39),
registered as the convention `operation-reader`, born at request 2, and said in request 1's text. The pilot's tests
*"accepted 401, 403 or 404 alike before"*; the calibration made them exact. Request 6 itself says *"The traveller who
made it and the listing's host"* see a booking, and nothing of what anyone else gets. Request 5's case *"is read by
the traveller who asked for it only"* is the same rule; Full's haiku missed it there, sonnet found it.

**What this says about the kit, for the maintainer** (one of the three, by J5's triage rule, which makes an
undetermined failure the kit's to amend for every arm alike):

1. Each request that holds a reader to a party could say what a non-party receives (one clause, as decision 4 words
   it), so that the rule is in the text the agent and the judge read; or
2. The judge could be given request 1 with every request, since every request says "the API works as request 1
   says"; or
3. The tests could accept 403 and 404 alike for a non-party, as the pilot's did, and keep 404 only where request 1
   decides it (an operation's reader).

The Tally kit has the same convention from request 1 and the same wording in its later requests; whatever is decided
here applies to it before any Tally run.

## The harness

- **Two container restarts** (22:57, during K4's third round; 02:53, during the calibration). The disk held both times.
  The first was absorbed by K4's resumable runner. The second stopped the three ladders mid-attempt; `resume.mjs`
  brought two back, and `cal-plain`'s resume died on a race in `machine.mjs`'s slot-taking (three ladders starting at
  once, one removing the slot another had just made): fixed in `80d9ef8`, the flow's 120 tests pass. The ladder
  registry (`~/.clean-ddd-flow/ladders.json`) lost an entry for the same reason — read, filtered and written back by
  each ladder without a lock — so `resume.mjs` saw one run of three; `cal-plain` was resumed by hand. **Not fixed**: a
  lock, or one file per run, before Tally.
- The resumed attempt is made again from its start, as the ladder's rule says; its interrupted cost is in the log.
- The symmetric verdict timeout, the CLI version in `started`, the grader's `--cache` and the wider leak scan
  (`d2a0441`) ran for the first time: no attempt was voided, no verdict was cut.
- Three ladders on four CPUs: the agents' wall-clock ran 1.0 to 1.3 times their API time; no attempt reached 90
  minutes or $12.

## Cost

$20.83 for the three trees, of the $180 the plans allowed.

## The maintainer's decision (17 November, morning), and what the amended kit says of the stopped trees

**Option 3:** a non-party — another signed-in caller, or anyone on a read that needs no caller — is answered `403` or
`404` alike, and the calibration kit's tests accept either (twelve assertions, in requests 2, 4, 5, 6 and 9; `401` for
a missing token, `404` for what does not exist, and the operation's reader are unchanged): commit `d6627e9`, the kit's
`not-found` convention and decision 4 amended, dated. The frozen copy is replaced (files sha256 `fbab40adfacbd42d…`).
Tally's kit holds the same convention in some fifty assertions of twenty files, but its requests state the rule
themselves (*"To anyone else the group does not exist"* in 2, 3, 5, 8, 9, 11, 19 and 28; *"to someone outside the
group, the expense does not exist"* in 6), and request 1 says what does not exist answers `404`: that is what the
judge found missing from the calibration's requests. **The maintainer keeps `404` in Tally** (17 November); nothing
there changes.

**The stopped trees, graded again on request 6 with the amended kit, without an agent:**
- `cal-lite`, haiku's attempt (`6e7305f`): **8 of 8 pass** (`grade.mjs --only book-instantly`; its `M3` says the storm
  is owed, the known Lite column the registration leaves to the maintainer). With the amended kit Lite would have
  delivered 6 at step 0.
- `cal-plain`, opus's attempt (`95acb7f`): **8 of 8 pass**, run as jest in the grader's kept worktree. Through
  `grade.mjs` in the operator's shell the same tree failed all 8 with no message, as did haiku's (`848fb2a`): a
  difference of the operator's environment from the ladder's that was not found (the ladder's own gradings of this
  tree passed 7 of 8 on every attempt); the direct run is the evidence kept.
- `cal-full`, haiku's attempt (`6d2e4ab`): **3 of 8 fail**, two of them real and masked until now by the first
  assertion: another host listing a listing's bookings is answered `200` (the test's next assertion, `[403, 404]`), the
  booked nights are not kept off the calendar, and the twenty-bookings race on two servers; sonnet's and opus's
  attempts were not graded again.

So the amendment lifts what stopped Lite and, at the third step, the plain tree; Full's first attempt had failures of
its own behind the one the judge read.

## The calibration resumed on the amended kit (17 November, 06:54 to 08:23): the three arms reach ten

Each tree's log got a `revoked` event for `book-instantly` (the ladder's own way to set aside what the harness judged
wrongly) and each ladder was resumed; the request was tried again from the tree's `main` at 5, and the arms went on
to 10. **All three delivered the ten requests.**

| | cal-plain | cal-lite | cal-full |
| --- | --- | --- | --- |
| Delivered | 10 of 10, all at step 0 | 10 of 10, all at step 0 | 10 of 10; 1, 5 and 6 at step 1 (sonnet) |
| Escalations after the amendment | none | none | `book-instantly` (haiku: *confirms exactly one of twenty bookings … sent at once to two servers on one database*, the race the first attempt's 403 had masked) |
| Attempts, before / after the amendment | 9 / 5 | 8 / 5 | 10 / 6 |
| Cost, before / after / total | $2.65 / $1.27 / **$3.92** | $7.55 / $4.35 / **$11.89** | $10.63 / $4.84 / **$15.47** |
| Of which lost on request 6 before the amendment | $2.30 | $4.73 | $4.50 |
| Agent minutes, total | 81 | 135 | 165 |
| Turns, median per attempt | 22 | 50 | 45 |
| Cost per request delivered at step 0 (1 to 10) | 0.05, 0.04, 0.03, 0.11, 0.11, 0.14, 0.41, 0.24, 0.33, 0.15 | 0.69, 0.53, 0.44, 0.44, 0.71, 0.84, 1.03, 0.21, 0.88, 1.38 | –, 0.44, 0.37, 0.37, –, –, 0.92, 0.47, 0.58, 0.82 |

**What the calibration shows, for what it is for.** The machine, the harness and the budgets treated the three arms
alike: the same ladder, the same kit, the same leak scan (no attempt voided), the same timeouts (none reached), the
same resume after a restart. Left with the kit as registered, every arm would have stopped at 6 on the test's
wording, not on the trees; amended, every arm finished. Full's three escalations, none of which Lite or the plain tree
needed, are real failures of haiku's first attempts in the Full tree (the body's shape refused with 400, a quote read
by its traveller only, the two-servers race), each delivered by sonnet. On these ten requests, which are OpenStay's
pilot kit, a plain tree costs $0.16 a request at step 0, Lite $0.72, Full $0.57 where haiku delivered — Lite is not
cheaper than Full here, and both are three to five times the plain tree, the pilot's and J3's ratio; one tree each,
uncounted, with the first six requests on a kit whose amendment came mid-run: the numbers say nothing of H8, which
Tally's nine trees will.

**The harness, after the run.** The ladder register's race is fixed (`c3474e6`: `register()` under a lock, written
whole and renamed; a test registers four runs from four processes at once). Nothing is left open from this run
before Tally but the maintainer's approval of the registration as amended, and the two operator-side points the
amendment states: `resume.mjs` wired to a boot hook, and a push of the trees to a remote off the machine.

**Cost of the calibration:** $31.28 for the three trees, of the $180 the plans allowed, $11.53 of it on request 6
before the kit's amendment.
