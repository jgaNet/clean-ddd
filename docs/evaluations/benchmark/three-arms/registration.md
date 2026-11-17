# J6's registration: Simple, Lite and Full on Tally, after the calibration

**Status: approved by the maintainer on 17 November, as amended below (the amendments of 16 and 17 November); the commit that carries the approval is named at the end of this file.** Nothing of J6 has run: no agent, no ladder. On 14 November the
maintainer decided the five findings of the first proposal; this registration applies
[those decisions](#the-maintainers-decisions-14-november) and is not approved yet. Until it is, the trees, the plans
and the servers below are prepared and idle.

Prepared on 14 November by the operator, with no agent, following the maintainer's decisions of 13 and 14 November
([the protocol](README.md), [the kit's last sections](app/README.md#decided-by-the-maintainer-at-registration-14-november)).
The repository's changes it needs (the flow, the two kits, the kit standard, this file) are left uncommitted by the one
who prepared them: **the repository commit this registration names is the commit that carries this file**, made by the
operator on top of `895dc94` (*K4 runner: a grading runs one acceptance file per core, at most 4*). The operator adds its
hash on committing. Every hash below that is the repository's is taken from what that commit carries.

## What is registered

| | Value |
| --- | --- |
| The repository | the commit that carries this file (above). The ladders run from a checkout of it: [`run-ladder.mjs`](../../../../.claude/flow/run-ladder.mjs) (sha256 `0f4a99a57acdc074efe00f0b8f56973036d105cb01b5cea890e4b8dbddd11264`) with [`ladder.mjs`](../../../../.claude/flow/ladder.mjs) (`62b445ab6a17cb74d6e3dd19b300965a935e2522786e9ada11fdb062678f85ed`), [`grade.mjs`](../../../../.claude/flow/grade.mjs) (`a86139b4b95ee1f7a8587804e889753e7a75062b543aea83952207f044eaf103`), [`machine.mjs`](../../../../.claude/flow/machine.mjs), [`resume.mjs`](../../../../.claude/flow/resume.mjs); every module the ladder reaches is hashed in `hashes.json` |
| The package | `/var/tmp/j6/clean-ddd-3.2.0.tgz`, packed from `924901c` (*The tooling's version follows the repository's tags: 3.2.0*; nothing it holds has changed since), sha256 `72477f7314e06c4894563de281f290d891911258c6debe93bafe0a433269708e` (checked, not repacked); vendored in every Lite and Full tree as `vendor/clean-ddd-3.2.0.tgz` (`"clean-ddd": "file:vendor/clean-ddd-3.2.0.tgz"`: the version is not on the npm registry) and given to the grader as `tooling` |
| The kit, Tally | [`app/`](app/README.md), as the commit that carries this file holds it: git tree `d2ffa3403023aaa5057e2af9ab174c45728e9d49`; files sha256 `570c05025634d4c9753d7ea04f5452a929cc4afbd425a948e8fec392163141af`. The plans read its frozen copy, `/var/lib/cdd-frozen/r14/app`: the same files hash |
| The kit, the calibration | [`calibration/`](calibration/README.md), the same way: git tree `41e765653ab66ca2fb8c51fca5eda0c5b97b3efd`; files sha256 `670c748611ff075d3492bd6d653fcd25d317f83e1b7840e57bda0c5c6c313672`; frozen at `/var/lib/cdd-frozen/r14/calibration`, the same |
| Lite's profile data (RFC 0002) | sha256 `1acf5a1ae779acced056dbc8709a3a10bc89d370c32aef9edfe2383f4dfd128f` (after ADR 43, as RFC 0005's D1 asks; the contract and the binding are unchanged since `924901c`) |
| Full's profile data | sha256 `cdf42672de0a27b3de077892dd7b05776ed18fcb62643c8651878f650ebdef31` |
| The floor every profile keeps | sha256 `cf1e2022e14a7964a463c3f38a382cc83e2dff7a35414c3fcde1681eb5bb5019` |
| The simple arm's guide | `CLAUDE.md` of the plain trees: Tally sha256 `32a34a2a135d047a3126972ad935c38d2aa00ba236ff351534478ea040ce6df3`, the calibration's `77ef79452c400d5e8f4a6071b788d077d48e02ce9eb30039c0b7e2ef6a43154d` (they differ by the application's name only) |

**How each hash is taken,** so that anyone recomputes it ([`hashes.mjs`](#where-everything-is), run with Node 24; its
output is `/home/user/j6/hashes.json`):
- *a kit's files:* every file under the directory, its path relative to it, sorted; one line `<sha256 of the file>  <path>` each; the sha256 of those lines. Taken of the repository's directory and of the frozen copy the plans read (copied from it, `cp -a`): the two are equal. The git tree id is the one git gives the directory once it is committed as it is: `hashes.mjs` computes it as git does, without writing to the repository (on `924901c`'s kit it gives `2814e037…`, as `git rev-parse` does). Once the operator has committed, `git rev-parse <commit>:docs/evaluations/benchmark/three-arms/<kit>` gives it.
- *a profile's data:* the sha256 of the canonical JSON (keys sorted at every depth) of `{ contract: profiles.<profile> of conventions/architecture.yaml, binding: profiles_held.<profile> of conventions/typescript.yaml }` in the repository (the same at `924901c`); the floor, of `floor` in `conventions/architecture.yaml`. Read from the starting trees, Full's is the same (`cdf42672…`); Lite's is `29d19f87cacbefa10007430af8300b3e494708c8ce3621879aeb5e889f482ac8`, since `create --profile lite` writes the binding's Lite checklists without the rule register's line (no `--rules`) and without the reference's `shows` and `create` entries; the contract's Lite profile is the same in both.
- *a file* (a plan, an environment, a script, a module of the flow, a guide): its sha256.

## The split's estimate (step 1)

Correction 14 of [the next campaign](../openstay/j5/next-campaign.md) registers features above the estimate's
break-even; the maintainer decided (14 November, 5) that the requests registered split are those the estimate puts above
it. The estimate is `clean-ddd strategy` ([`tools/src/strategy.ts`](../../../../tools/src/strategy.ts), what the ladder
asks with `fanOut.split: recommended`), run with the 3.2.0 package on the four [S] storms, from a copy of `full-1` with
the declarations of their checkpoint applied (request 13: checkpoint 2's session; 31, 32 and 35: checkpoints 2 and 4's,
and request 20's relationship), with both priorities:

| Request | The storm's contexts (stickies) | Outside the largest | Break-even | One agent | Fan-out | Recommended (`time` and `cost`) |
| --- | --- | --- | --- | --- | --- | --- |
| 13 Pay through the provider | Settlements (2) | 0 | none: one context | 3.5 min | — | one agent |
| 31 Merge two groups | Groups (2), Ledger (1), Settlements (1) | 2 | 8.6 | 4.5 min | 7.8 min | one agent |
| 32 Net debts across groups | Settlements (2) | 0 | none: one context | 3.5 min | — | one agent |
| 35 Delete an account | Groups (1) | 0 | none: one context | 3 min | — | one agent |

**None is above the break-even, so none is registered split.** The tool ran on every storm; none was refused. Three of
the four storms list one context: their other contexts are crossed by the links (owned ports), which the estimate does
not count, and which the ladder does not split on either (`ownersOf` reads the storm's `contexts`), so not even
`split: always` could split 13, 32 or 35. Request 31 has two stickies outside its largest context, against a
break-even of 8.6 (the contract stage counted at 0.6 minutes per context; with none at all, it would be 5). Run on all
forty storms, the estimate recommends one agent everywhere: 36 storms list one context, and the most any has outside
its largest is 2 (31), against 7.4 or more.

**Decided (14 November, [decision 4](#the-maintainers-decisions-14-november)): all forty requests are registered not
split, and correction 14 cannot be measured on Tally.** The brief's [S] marks are not borne out by the storms as
written: no request is above the break-even, three of the four [S] requests could not be split at all, and the one that
could (31) would need four times the stickies it has outside its largest context. Correction 14 waits for a kit whose
storms put a request above the break-even; J6 measures nothing of the split.

## The starting trees (step 3)

Each tree is a git repository of its own, with no remote, on `main`, made by
[`make-tree.sh`](#where-everything-is) with fixed authors and dates, so that making it again gives the same commit; the
three trees of an arm were each made, not copied, and are the same commit. **None was made again for this
registration:** no decision changes a starting commit ([decision 7](#the-maintainers-decisions-14-november)).

| Arm | How it is made | Trees | Starting commit (`main`) | Its own checks |
| --- | --- | --- | --- | --- |
| Simple | OpenStay's `created: plain` (`08b94b0`, where `trees/simple-w` starts), named `tally` (`package.json`, the guide's title, as the kit's rehearsal witness `tally-w` was); then the guide's two sentences of J5's corrections 4 and 3: *A read never changes what is stored…* (correction 4's text) and *When a request fixes what the API answers, its shape wins over the code's own habit: change the code that projects the answer, not the request.* (R3's first sentence, without its `"<NAME>"` example, which Tally's request 1 does not say) | `plain-1`, `plain-2`, `plain-3` | `47b6ebe87263f29b63f6e8f2c83f8e9541dcbb28` (on `30bc83e`, *created: plain*) | `yarn verify`: pass, ×3 |
| Lite | `clean-ddd create --name tally --profile lite` (3.2.0), then the strategic session of checkpoint 1 | `lite-1`, `lite-2`, `lite-3` | `02aa404f01460d0f290515947b4d206b36308888` (on `9a1e71c`, *created: lite*) | the six of its guide (`check:conventions`, `format:check`, `lint`, `typecheck`, `test:units`, `test:e2e`) pass, ×3; the gate (`gate --base HEAD --mode architecture`) on the same commit: pass |
| Full | `clean-ddd create --name tally` (3.2.0), then the same session | `full-1`, `full-2`, `full-3` | `86d20e8aa618d5488d4835dab2999f922003801b` (on `6a67e5d`, *created: full*) | the same: pass, ×3 |

**The session's commit** (Lite and Full alike, [`declare.py`](#where-everything-is) with `tally-cp1.json`): Groups and
Ledger declared in the binding and described in the domain map (purpose, subdomain, language), each an empty
`module.local.ts` registered in the composition root (the conventions check refuses a declared context with no folder),
the two relationships of [checkpoint 1's session](app/storms/README.md#the-strategic-session-the-contexts-and-how-they-relate)
declared `planned` (Groups → Ledger and Ledger → Groups, owned ports), and ADR 1, which records T1 to T5. Nothing else:
no `--rules`, no rule register, no knowledge query in the guide, no file of the kit. On Full, the ten storms of
checkpoint 1 are *legal against the contract and the map; not in the code yet*. On Lite, they are legal as the ladder
gives them, each command marked `answered: at-once` ([decision 2](#the-maintainers-decisions-14-november)): shown on a
copy of `lite-1`, where 6 of the ten are refused as the kit writes them and all ten are legal once marked.

**The later sessions are prepared, not applied:** `tally-cp2.json` (Settlements and Notifications, five relationships,
ADR 2) and `tally-cp4.json` (Groups → Ledger and Groups → Settlements over an integration event, its ADR), as
[the storms' README](app/storms/README.md) decides them; checkpoint 3 declares nothing, and request 20's relationship is
the arm's, with its storm. Applied to copies of `full-1` and `lite-1` (request 20's relationship added as its storm would),
each passes the conventions check, and the forty storms are legal on Full, with request 20's refused before its
relationship, as the storms' README says; on Lite, the first proposal showed the forty legal once each command is
marked `answered: at-once`, as the ladder now marks them.

**The calibration's trees.** The protocol runs the calibration on the same machine, by the three arms, before Tally; its
requests are another application's, so it needs trees of its own, made the same way: `cal-plain` (OpenStay's
`created: plain` and the same guide, `0932e48ebfee36bdc1aa9c7999bd3c6ae7ce6804`), `cal-lite`
(`5a386f7f042e2fe3b963d0e8a3c915d8fb1165b3`) and `cal-full` (`1c90a209f3df8d44cb9f780d3c99c44e871e5e20`), the two
last with [the calibration's session](calibration/storms/README.md#the-strategic-session-the-contexts-and-how-they-relate)
(Accounts, Listings, Booking, Notifications, the four relationships `planned`, the pilot's ADR 1, as OpenStay's
`ccf7f75` did). Their own checks pass. On `cal-full` the ten storms are legal; on a copy of `cal-lite`, 7 are refused as
written and all ten are legal once marked. **One tree per arm**, as the maintainer decided
([decision 6](#the-maintainers-decisions-14-november)): the protocol says the calibration shows the machine, the harness
and the budgets treat the arms alike, and one ladder per arm at once is that.

## PostgreSQL (step 4)

One PostgreSQL 16 server per Tally tree, run as the `postgres` user, its data under `/var/lib/postgresql/j6/<tree>`,
listening on 127.0.0.1 only, on its own port: `plain-1..3` 55481–55483, `lite-1..3` 55484–55486, `full-1..3`
55487–55489 (away from 55432 and from K4's 55471–55472). [`pg.sh`](#where-everything-is) `start|stop|status <tree>`
makes the cluster on its first start and is idempotent; each plan's `services.start` is `pg.sh start <tree>`.

**Each tree's server is named twice in its `envFile`** (`/home/user/j6/<tree>.env`, [decision 3](#the-maintainers-decisions-14-november)):
`TALLY_POSTGRES=postgresql://postgres@127.0.0.1:<port>` for the hidden tests, and
`DATABASE_URL=postgresql://postgres@127.0.0.1:<port>/postgres` for the agent, whose request 30 now says that
`DATABASE_URL` names a database on a PostgreSQL 16 server, where it creates the databases it needs. The ladder is
started with the `envFile` sourced (the plan's first line, and `resume.mjs` after a restart), so every agent, every
check and every grading of a tree sees its own server, and only it. The hidden tests create their databases on
`TALLY_POSTGRES` (else on the server of `DATABASE_URL`) and give each server they start its own, never the
environment's `DATABASE_URL`. The `envFile` also puts Node 24, yarn and `psql` on the `PATH`. The nine servers were
each started and stopped once; `full-1` was shown to start, take a `CREATE DATABASE` through `TALLY_POSTGRES`, and stop
(`status` then exits 3). The calibration needs none: OpenStay's requests 1 to 10 keep a SQLite file. All nine are
stopped now.

## The witness that answers later (step 5)

**On Full only:** a Lite command is answered at once ([ADR 43](../../../adr/0043-a-lite-use-case-calls-a-pure-decision-and-says-who-may-call-it.md)),
so Lite has no `202` to rehearse. The witness (`/home/user/j6/witness/full-w`, `afad853` on `86d20e8`) solves Tally's
requests 1 to 6 by hand from their text, every command answered `202 { operationId }` through Full's own
`acceptCommand` and the Tracker (served at `/v1/operations/{id}` as well), on `node:sqlite` with one write lock per
transaction; requests 7 to 10 are not solved. Graded by [`grade.mjs`](../../../../.claude/flow/grade.mjs) up to 6, with the
composed API in force, `--gate false`, two workers:

- **On the witness: all six files pass, 32 of 32 tests, at the first run;** graded again with the kit as registered
  (its client renamed), the same 32 of 32. Tests 1, 2 and 6 ran their operation's half:
  sign-ups refused later with `error: { type, message }` (`EmailAlreadyUsed`, `PasswordTooShort`, `InvalidEmail`,
  `InvalidName`); a member's operation read `401` without a token and `404` with another's; the stale edit and the
  edit by a member who is neither payer nor owner refused under two names (`ExpenseChangedSinceRead`,
  `NotPayerOrOwner`); and six rounds of two edits at once, through one server and two on the same file, one kept, the
  loser refused by the stale edit's name after the base handler re-read it (CONC-OPTIMISTIC).
- **On the starting tree (`86d20e8`): all six fail,** every test.
- **They discriminate where it matters:** a variant whose lost race is not re-decided (`CONFLICT_ATTEMPTS = 1`, the
  loser named `ConcurrencyConflict`) fails test 6's race alone; a variant whose refusal is named `password-too-short`
  with an empty message fails three of test 1's cases, among them *names the refused rule*.
- **Nothing failed, so nothing is the kit's or the witness's to report.** What it cannot show: the reactions of
  checkpoints 2 to 4 behind a `202` (T22's `GroupsMerged`, T23's netting, T25's scrubbing), which need a witness that
  far.

The calibration's README asks for its rehearsal on the arms' own starting trees and on trees solved to the kit, not for
a new `202` witness: the pilot's `clean-w`, which answers sign-ups later, was its `202` witness on 13 November.

## The rehearsals

[`dry-run.mjs`](../../../../.claude/flow/dry-run.mjs), with the composed API in force, on the kits as registered
([decision 5](#the-maintainers-decisions-14-november)), on copies of a Lite and a Full starting tree (so that no
grading writes beside the trees the agents will work in) and on the plain witness of each kit, solved, as each kit was
rehearsed before. Each report is committed with its kit, as the kit standard asks; the plans and logs are in
`/home/user/j6/rehearsal/registration`. The tests from request 30 ran against a PostgreSQL 16 the operator started on a
port of its own (55497), named by `TALLY_POSTGRES` and `DATABASE_URL` as a tree's `envFile` names its server, and
removed afterwards.

- **Tally: clean, no finding** ([`app/dry-run.json`](app/dry-run.json), sha256 `bc8c4abb31e5a7af08849a6670e79b2fb0eae6b4149cb41ce4400e8b7ca2b3cd`).
  - **Discrimination:** all forty files fail on `lite-1` (`02aa404`), on `full-1` (`86d20e8`) and on the witness before
    (`d859700`, *created: plain*).
  - **Solvability:** on the witness solved to request 40, all forty pass at the first run (`tally-w` at `6bdb13c`:
    `68ccae6`, checkpoint 4's solved commit, with its own spec's database made on the server of `DATABASE_URL` rather
    than a fixed `127.0.0.1:55432`; `previous` 13ceb79, a46ce6c and d6c00b1 for requests 10, 30 and 40). Test 30 also
    passed alone (4 of 4) with `DATABASE_URL` and no `TALLY_POSTGRES` in the environment.
  - **Hygiene:** nothing, in the Lite and the Full tree (DOMAIN-ONE-CLOCK no longer applies to the client, named
    `tally.spec-helper.ts`) and in the plain one. The first run of this rehearsal found six tests whose imports, longer
    with the new name, the trees' formatter wraps; they were formatted with the trees' own Prettier, and the run above
    is the one after.
- **The calibration: read, no defect** ([`calibration/dry-run.json`](calibration/dry-run.json), sha256 `d4681c871160209018d5efe1e311f65d4b87926d27b5cb7eb644ce0ca1dc1079`).
  - **Discrimination:** all ten files fail on `cal-lite` (`5a386f7`), `cal-full` (`1c90a20`) and the pilot's `simple-w`
    before (`08b94b0`).
  - **Solvability:** on `simple-w` solved (`2dd7254`), eight pass; requests 6 and 7 fail, as they did on 13 November
    after the maintainer's decisions 1 and 4 there ([the calibration's README](calibration/README.md#how-it-is-checked)):
    the tree was written before those decisions. Read, not a defect.
  - **Hygiene:** nothing, in any tree (`openstay.spec-helper.ts`; two tests' imports wrapped the same way).

## The plans (step 6)

One plan per tree, `/home/user/j6/<tree>.plan.yaml`, written by [`make-plans.py`](#where-everything-is), in the format
`run-ladder.mjs` reads. The same in every arm but the arm, the tree's port, its server and the tooling:

| Field | Value |
| --- | --- |
| `arm` | `simple` (plain), `clean` (Lite and Full) |
| `kit` | `/var/lib/cdd-frozen/r14/app` (Tally) or `/var/lib/cdd-frozen/r14/calibration`: the frozen copies, away from the trees ([decision 8](#the-maintainers-decisions-14-november)) |
| `base`, `of` | `main`; 40 (Tally) or 10 |
| `ladder` | `claude-haiku-5-5`, `claude-sonnet-5-5`, `claude-opus-5-5`, as J5b ([decision 6](#the-maintainers-decisions-14-november)) |
| `agent`, `retry` | `claude-cli`, 90 minutes an attempt; sent back once |
| `budgetUsd`, `agentBudgetUsd` | $200 a Tally tree across its resumes, $60 a calibration tree; $12 an attempt ([decision 6](#the-maintainers-decisions-14-november)) |
| `dependencies`, `ports` | `copy`; 21100 to 21900 (Tally, by hundreds), 22000 to 22200 (calibration) |
| `machine` | `{ ladders: 3, jestCacheGb: 2 }` |
| `gradeTimeoutMinutes`, `gradeWorkers`, `regressionCheck` | 120; 2; `{ from: 2 }` |
| `triage` | `{ judge: claude-sonnet-5-5 }` |
| `tooling` | the tree's vendored package (Lite and Full) |
| `services`, `envFile` | `{ start: pg.sh start <tree> }` and `<tree>.env`, with `TALLY_POSTGRES` and `DATABASE_URL` (Tally); the calibration's `envFile` only |
| `fanOut` | none: no request is split ([decision 4](#the-maintainers-decisions-14-november)) |
| `features` | Tally: checkpoint 1's ten; the calibration: all ten |

**What every agent is given** is the ladder's, not the plan's ([decision 1](#the-maintainers-decisions-14-november)): the
request's text and, in the brief, the request's API fragment and those of the requests before it (at request 40, the
36 fragments of the kit, 42 kB); in Lite and Full, the storm in the tree, marked for Lite.

**Checkpoints.** A Tally plan lists checkpoint 1's ten requests. At each checkpoint, after the session's commit on
`main` (Lite and Full: checkpoint 2's before request 11, checkpoint 4's before 31), the operator adds the next ten ids
to `features` and resumes the same run (`--resume`). One run and one log per tree keep the commit each `upgrade`
request started from (10, 20, 30), which the ladder passes at every later grading; four runs would lose it. The plan's
hash at each checkpoint is recorded with the session's commit. Nothing else in a plan changes.

**Validated without starting:** `run-ladder.mjs` has no dry or check mode. [`check-plans.sh`](#where-everything-is) runs
the ladder's own code on each plan, cut just before its first side effect (`const flowDir`), so that every check a start
makes of a plan runs (the required keys, the arm, the ladder, the runner, `dependencies`, `gradeWorkers`, `fanOut`,
`regressionCheck`, the project's Node), and adds what the ladder accepts silently (a feature id not in the backlog, the
kit, the tooling, the `envFile`, the server's script, the base) and, now, a kit whose path names `j6`, `tally` or a kit.
**All twelve pass.**

| Plan | sha256 |
| --- | --- |
| `plain-1.plan.yaml` | `9f586541b6bbd87203e747227109a5de83e6292c54d4e2cbbce4b8f06bd84383` |
| `plain-2.plan.yaml` | `c313dc1b21372d803e97a6f590c0382234667d32deaaca00a5f9d0420a2a341b` |
| `plain-3.plan.yaml` | `f09e0434c2e59707419a440e5658923bdefd902f243f08a71f5f8ebf77583532` |
| `lite-1.plan.yaml` | `3b336185c72bcd59b487453bc1eff1c59465521040c844455cdeaa38b91506cd` |
| `lite-2.plan.yaml` | `ef419b7d8a6ea66c9be37b7186813380e77fd1f8c4544fa63c38b164d3fb25ae` |
| `lite-3.plan.yaml` | `3df3539eeff2b9e52238c1175ce8f08723d0861487b305fda302a3589d3069d4` |
| `full-1.plan.yaml` | `efae935edd76489be0aa55c0505f369be72004f791769e7e157f907de698e1c3` |
| `full-2.plan.yaml` | `24d14c5bd0dfd6e1ccbe8e0e8f1fab0f20ab9a49f07252fcb9008e369e93b3e2` |
| `full-3.plan.yaml` | `e07c9624332bc927ca5f244fdcf781be9716fd5a3108b7b8784c14fd961a372a` |
| `cal-plain.plan.yaml` | `c6800e484b84b1f228d0202ee81411a1a629bc8295139dcffe3d8975e49fd9ac` |
| `cal-lite.plan.yaml` | `1c5ba48edac02b1e8d2481a684cae122be12ce0cb54c041a6cec21e581d362f1` |
| `cal-full.plan.yaml` | `eea573f89a97096443c63764ed788ad21aa2a3eed7bbf01094a2e0047ddcf9ed` |

The nine Tally `envFile`s are hashed in `hashes.json` beside them (`full-1.env`
`1089c692290468ec536c96173a979499af801d92e5d61ff26831f5c35b9aff45`, and so on).

## The hypotheses and the scores

As [the protocol](README.md) and [RFC 0005](../../../rfc/0005-what-the-literature-and-j5b-say-before-j6.md) state them;
nothing here rewords one.

- **H1 (RFC 0005, P1):** Lite's share of logic errors among its failures is below Full's.
- **H2 (RFC 0005, P2 and D3):** with the specification as data, no triaged failure is a convention the specification
  states.
- **H3 (RFC 0005, P4):** Full's slope of cost per request is flatter than Simple's, and its change requests cost less
  than Simple's, even where its features cost more. If not, Full's structure does not pay for itself on this kind of
  application at this size.
- **The decision the campaign serves ([RFC 0002](../../../rfc/0002-architecture-profiles-lite-and-full.md), H8,
  unchanged):** Lite is "supported" only when its median cost per delivered feature is at most 0.6 times Full's, with
  no overlap of the ranges, it keeps Full's structural passes, and it has no more triaged failures or real regressions
  than Full; otherwise it is kept as an experiment or dropped, and the record says which, and why.

**The scores, kept apart, change first (D5):**
1. **The cost of change:** the four changes not announced in advance (requests 10, 20, 30 and 40), each by its agents'
   cost, the files and contexts it touched, and whether it was delivered at step 0; and the slope of each arm's cost
   per request against the request's index.
2. **Correctness:** the hidden tests, the triaged failures, where each tree stops.
3. **Cost:** tokens, dollars and agent time per delivered feature, the median and the range per arm; escalations, real
   or not.
4. **Robustness:** the chaos suite (concurrent servers, crashes between commit and publication, webhooks replayed).
5. **Maintainability:** an independent reading, blind to the arm where it can be, against a rubric written before.
6. **Lite's decisions:** how often a Lite feature brings a mechanism in, whether the trigger called for it, what the gate
   refused for a mechanism missing or added without its trigger.

The calibration is not counted. Correction 14 (the split) is not measured (step 1).

## The stopping rules and the budgets

- **Per feature,** from the smallest model up: an attempt per model, sent back once on the driver's verdict, 90 minutes
  and $12 each; a failure of the hidden tests is graded again alone before it counts; an earlier test that fails is
  graded twice on the attempt's start before it counts as a regression (`regressionCheck`).
- **An attempt whose agent read the kit is void** ([decision 8](#the-maintainers-decisions-14-november)): its
  transcripts are scanned before it is judged, and a tool call that reads or lists the plan's kit, or the grader's
  worktrees, voids it. It is logged as `leak` and run again once, at the same step; a second leak at that step stops the
  tree (`VOID`), for the operator. Its cost counts against the tree's budget.
- **A feature the last model fails** stops the tree at `needs-triage`; it is judged by [J5's triage](../openstay/j5/triage.md),
  written before any run, with `claude-sonnet-5-5` as the judge: the kit's (amended for every arm alike and graded
  again) or FAILED.
- **One repair per triaged failure,** as in J5 and J5b ([decision 6](#the-maintainers-decisions-14-november);
  [J5's rule](../openstay/j5/repairs.md)): a tree that stops on a failure the triage judged real is repaired once, in its
  arm's medium (a section of the tree's guide, `CLAUDE.md`, committed by the maintainer on its `main`; a rule that holds
  for every feature, never a test's answer), and continues from the request it failed. If the replay fails at every
  step again, the correction may be reworded once and the request replayed again; a second failure after the rewording
  stops the tree for good. The replay is counted as the tree's second attempt at that request, its cost the tree's;
  a correction reaches every tree of the same arm that has not reached that request, and a failure two arms share gets
  the same words in both.
- **A tree's budget** is its run's, across resumes, reserved before each agent starts: $200 a Tally tree, $60 a
  calibration tree, equal in every arm, kept by the maintainer. Proposed so that no arm reaches it: J5b's clean-3 cost
  $156 for fifty requests, with a split that doubled its split requests' cost.
- **The machine:** at most three ladders at once (`machine.ladders`), each started through
  [`machine.mjs`](../../../../.claude/flow/machine.mjs) with Node 24 first on its `PATH`; a restart is resumed by
  [`resume.mjs`](../../../../.claude/flow/resume.mjs), which sources the plan's `envFile` and runs its `services.start`.
  The ladders share their three slots in the machine's temporary directory (below, what the decisions found).

## The order of the runs

Kept by the maintainer ([decision 6](#the-maintainers-decisions-14-november)):

1. **The calibration,** first, not counted: `cal-plain`, `cal-lite` and `cal-full` at once, one ladder each.
2. **Tally, checkpoint by checkpoint,** one tree per arm at a time, three at once: `plain-1`, `lite-1` and `full-1`; then
   the `-2` trees; then the `-3` trees; then, after the maintainer's decision at the checkpoint and the session's commit
   on the Lite and Full trees, checkpoint 2 in the same order, and so on to checkpoint 4.

## The maintainer's decisions (14 November)

The first proposal named five findings that blocked a run and left six questions; the maintainer decided them all. Each
decision, what changed for it and how it was shown:

1. **D3, in the flow: the agents receive the API fragments.** The ladder at `924901c` gave an agent the request's text
   and nothing of `api/`. Now, with each request, the brief gives the request's fragment and those of the requests
   before it, in their order, in every arm alike ([`ladder.mjs`](../../../../.claude/flow/ladder.mjs), `apiFragments`
   and `apiBrief`, called by `brief` and by the owners' brief in
   [`run-ladder.mjs`](../../../../.claude/flow/run-ladder.mjs)): fragments, not the composed API, as the protocol's D3
   sentence says (*every arm's agents receive the kit's API fragments*). A request without a fragment of its own (10,
   14, 20, 30) is given the earlier ones and told so. Tested in [`ladder.test.mjs`](../../../../.claude/flow/ladder.test.mjs)
   on both kits, and in [`run-ladder.test.mjs`](../../../../.claude/flow/run-ladder.test.mjs) on a ladder run with
   `runner: command`, whose agent keeps the prompt it was given.
2. **Lite storms, in the flow.** The kit's storms are one per request, shared by the arms, and unchanged. At each
   attempt of the clean arm, the ladder asks the tree which contexts answer their commands at once
   (`architecture profiles --json`: a context held to a profile that does not use the command bus, as `storm validate`
   decides it) and marks each of their commands `answered: at-once`, a line under its name, the rest of the file as
   written, in the copy it commits for the agent and in the copy `storm --expect` holds the code to (`storm-given` in
   the log). On a Full tree nothing is marked. A Lite tree stays held to the aggregates and the events the storms
   decided. Shown with the ladder's own function on a copy of `lite-1`: checkpoint 1's ten storms, 6 refused as
   written, are all legal once marked; and the calibration's ten on a copy of `cal-lite` (their contexts are not
   `lite-1`'s), 7 refused as written, all legal once marked (`/home/user/j6/rehearsal/registration/mark-*.log`). Every
   storm of both kits, marked, reads back as the storm with `answered: at-once` added to each command and nothing
   else (`ladder.test.mjs`).
3. **Request 30 names `DATABASE_URL`, per tree.** Its sentence now reads *In this environment `DATABASE_URL` already
   names a database on a PostgreSQL 16 server that asks for no password: create the databases you need on that
   server*, in place of the fixed `127.0.0.1:55432`. Each Tally `envFile` sets `DATABASE_URL` and `TALLY_POSTGRES` to its
   tree's server. In the kit: the register's `postgresql`, test 30's header and the kit's README say the same; the
   client finds its server on `TALLY_POSTGRES`, else on `DATABASE_URL`'s, and starts each server with its own database,
   never the environment's `DATABASE_URL` (a hidden test reads nothing an agent's own test wrote). Rehearsed on the
   witness: its own spec still read a fixed `127.0.0.1:55432`, so it now reads its server from `DATABASE_URL`
   (committed in the witness, `6bdb13c` on branch `cp4`); with a PostgreSQL started on 55497, its spec passes, test 30
   passes 4 of 4 with `DATABASE_URL` alone, and the forty pass with both (the rehearsal above).
4. **The split:** all forty requests are registered not split, and correction 14 cannot be measured on Tally (step 1).
5. **Hygiene:** the kits' clients are renamed `tally.spec-helper.ts` and `openstay.spec-helper.ts`, with every import
   (six tests' and two tests' imports wrapped by the trees' formatter), every mention in the kits' READMEs and tests,
   and a paragraph of [the kit standard](../kit-standard.md#in-the-hidden-tests-the-lines-a-client-needs) that names
   the rule for any kit. `grade.mjs`, `kit-check.mjs` and `dry-run.mjs` assumed nothing of the name (the grader copies
   every file of `acceptance/`; the checks read `<n>-<id>.acceptance.ts` only), so none changed. Both kits rehearsed
   clean of hygiene on a Lite and a Full tree (above); `kit-check.mjs`: clean, on both.
6. **The calibration: one tree per arm. The budgets and the model ladder, kept. One repair per triaged failure, as in J5
   and J5b. The order, kept:** the plans and the sections above say each.
7. **Correction 3 in the plain guide:** R3's first sentence, without its `"<NAME>"` example, is the guide's
   *The API's shapes* section in every plain tree, as `make-tree.sh` wrote it at preparation; the plain trees and their
   commit (`47b6ebe`, and `0932e48` for the calibration) do not change, and their guides hash as before.
8. **The hidden kit away from the trees, and leakage voided.** The frozen kit moved from `/home/user/j6/kit` (removed)
   to `/var/lib/cdd-frozen/r14`, a path with no `j6`, `tally` or `kit` in it, copied from the repository's kits as
   registered; the plans read it, and `check-plans.sh` refuses a kit path that names one. In the ladder, once an
   attempt's agents have stopped and before it is judged, the transcripts Claude Code wrote for its worktree since it
   began are scanned with K4's scan (`k4-measures.mjs`, `scanLeakage`), held to the plan's kit and the grader's
   worktrees (`<project>.flow/grade`, where the hidden tests are while a grading runs): a tool call whose input names
   one voids the attempt (`ladder.mjs`, `transcriptsOf` and `kitLeakage`; a result that only mentions one is counted,
   not voided). Tested on transcripts (`ladder.test.mjs`: a read, a listing, a search; a path that only begins like
   the kit's; K4's own patterns left out) and on a ladder run whose agent lists the kit once (the attempt is run again
   and judged) and twice (the tree stops `VOID`, nothing escalated) (`run-ladder.test.mjs`).
9. **The registration:** this file, every hash taken again (`hashes.mjs` on the kits as renamed, request 30 changed,
   the reports committed), the plans written again (`make-plans.py`) and checked (`check-plans.sh`: twelve pass).

**What the decisions found on the way, and fixed in the flow:** the ladder took its slot of `machine.ladders` in its
own temporary directory. `run-ladder.mjs` sets `TMPDIR` to the run's own directory before it takes a slot, and
`takeSlot` looked for the slots under `TMPDIR`: each ladder would have counted its own slots alone, and three at once
was not held. The slots are now read in the machine's temporary directory, before `TMPDIR` changes; `run-ladder.test.mjs`
fails without the fix.

## What is left for the maintainer

- **The approval** of this registration, after which the operator commits these changes and adds the commit's hash
  above.
- **The grader's storm column for Lite trees.** `grade.mjs` holds every tree to the kit's storms as written (its `M3`,
  "storm carried"), not to the copy the ladder gives a Lite tree: on a Lite tree, `M3` will say every command storm is
  owed (`answered`). No verdict and no score reads `M3` (the ladder decides on the hidden tests, `M2`, and on its own
  verdict, which reads the marked copy); `grade.mjs` was not changed while K4's pilot runs it at every run. Whether
  the record reports `M3` for Lite, or the grader marks the storms as the ladder does, is the maintainer's.
- Still not included, as in the first proposal: a `202` witness beyond request 6.

## Where everything is

Outside the repository, on this machine:

| Path | What it is |
| --- | --- |
| `/home/user/j6/<tree>/app` | the twelve trees: `plain-1..3`, `lite-1..3`, `full-1..3`, `cal-plain`, `cal-lite`, `cal-full` |
| `/home/user/j6/<tree>.plan.yaml`, `/home/user/j6/<tree>.env` | each tree's plan and environment |
| `/var/lib/cdd-frozen/r14/app`, `/var/lib/cdd-frozen/r14/calibration` | the kits as registered, as the plans read them |
| `/home/user/j6/bin/make-tree.sh` | makes a tree (sha256 `47e979cc6ef954804634fe0907df59b29dd43e4f130588082994abaf718e1a23`) |
| `/home/user/j6/bin/make-plans.py` | writes the plans (sha256 `d3523880d9699033dfef64b56328905f38d83e843769cac078445bb540981b71`) |
| `/home/user/j6/sessions/declare.py` and `*.json` | a session's commit (sha256 `50923825294b0de282c2271c3c23753d0220eb02efc549331aa4aca5bdfc689c`; `tally-cp1.json` `b8f7da9e…`, `tally-cp2.json` `bb4fff34…`, `tally-cp4.json` `602ca0e5…`, `openstay.json` `f99eb3bf…`) |
| `/home/user/j6/bin/pg.sh` | the servers (sha256 `babe393136900e7f20a2e06d10a4384687183bd33f07522d5efe2534d22cbe3c`); data under `/var/lib/postgresql/j6/<tree>` |
| `/home/user/j6/bin/check-plans.sh`, `plan-extra.mjs` | the plans' validation (sha256 `facd804e3893a5353a34fd3d1a0a7c17ad59e8c0c9d202933c97dc40e4016dea`, `dd11ab9913044eab9c06d652e88378824fb0512003b889eeb916cb2fe0b0baf7`) |
| `/home/user/j6/bin/hashes.mjs` | the hashes (sha256 `8a07eb41921f203e3b97f504899376add82727c1ddba2277a6db81d9e8215dfb`), written to `/home/user/j6/hashes.json` |
| `/home/user/j6/bin/checks.sh`, `check-all.sh` | the trees' own checks |
| `/home/user/j6/witness/full-w`, `/home/user/j6/witness/grades` | the `202` witness, its variants and its gradings |
| `/home/user/j6/rehearsal`, `/home/user/j6/rehearsal/registration` | the first proposal's dry runs; this registration's (plans, logs, reports, the storms marked on Lite, test 30 and the `202` witness graded again) |
| the kit's plain witness `tally-w` (the operator's scratch space) | `6bdb13c` on branch `cp4`: `68ccae6` and its spec's database on `DATABASE_URL`'s server |

## Amendment of 16 November (night): the calibration, prepared again on the pilot's machine

Decided by the maintainer on 16 November, late evening, after the K4 pilot's two rounds and the review
[`2026-11-16-next-evolution-review.md`](../../2026-11-16-next-evolution-review.md) (§D): **the calibration alone is
run next**, on the machine the K4 pilot ran on, once the pilot's third round has finished; Tally waits for the
maintainer's reading of the calibration. The decisions, and what they change in what is registered above:

1. **The harness is fixed where the review found it unequal or unsafe**, in one commit of the flow (`d2a0441`): the
   simple arm's verdict (`yarn verify`) gets the attempt's time, as the clean arm's gate does (it was cut at 15
   minutes); the `started` event records `claude --version`; every grading passes `--cache` to the grader, as K4's
   runner does, so a grading a restart cuts resumes; the leak scan voids an attempt that names a hidden test by its
   shape (`*.acceptance.ts`, a `find`), the reference's evaluations, or the grader's worktrees named relatively from the
   attempt's worktree, and a call counts once. The flow's 120 tests pass. **The hashes above are replaced by these:**
   `run-ladder.mjs` `919bbaa1f9bd8e6e73d11368cdc9c51d3ef1421eced15798c246e77ebf9ab1b2`, `ladder.mjs`
   `46f18fa144fda3efd1b9fdc70d3cbafd723f5ce5284fd0c9caa1594cf346cc51`, `grade.mjs`
   `3d72cdd12bc081ba9e678877a135a68c2d2826aa4e0c2d5475e65dd2f7145b49` (changed by `6a1a2c6` and `d90df5f` after the
   registration above, which still named `a86139b4…`), `machine.mjs`
   `5affdfd78a5956e6753e942cbca3eeb7b17deba8738131fc14d5aa723b71d204`, `resume.mjs`
   `af68a5af0ea35fb313ddf2f974d300c65575d1f09482f0332ec7473d7cf0fb5a`.
2. **The trees, the plans and the kit's frozen copy of the registration above are not on this machine** (`/home/user/j6`,
   `/var/lib/cdd-frozen/r14`: the J5b machine's). The calibration's three trees were **made again here**, the same
   way, with the package packed from `main` at `d4a2651` (`clean-ddd-3.2.0.tgz`, sha256
   `eacda6b059b9ffbfbdd789f4772344c85ca3b1a79001886dfe47d1b405abd482`; `tools/` is unchanged since `924901c`), vendored
   in the Lite and Full trees as `vendor/clean-ddd-3.2.0.tgz`:
   - `cal-plain`: OpenStay's `created: plain` (`08b94b0`, the pilot's `simple.bundle`) with the guide's two sections,
     *One rule* (correction 4's text) and *The API's shapes* (R3's first sentence, J5b's `repairs.md`), appended as
     two headings; commit `e1f0bab`; guide sha256 `ba3fe4d0e247638a…` — **it does not match the hash registered
     above** (`77ef7945…`), whose exact wording and placement the operator could not recover from the repository; the
     two sentences are the ones the registration names. `yarn verify` passes.
   - `cal-lite`: `create cal-lite --name openstay --profile lite`, then the strategic session as the pilot's `ccf7f75`
     made it (the purpose, four subdomains, four contexts with their language, four relationships `planned`, ADR 1,
     four empty `LiteModule`s registered in the composition root, the documents rendered): commits `d79db05`,
     `87ab5a5`. The six checks and the gate (`--base HEAD --mode architecture`) pass.
   - `cal-full`: `create cal-full --name openstay`, then `ccf7f75`'s patch applied as it is: commits `1cd36d2`,
     `6a8754d`. The six checks and the gate pass.
   The plans are committed beside this file, [`plans/`](plans) (`cal-plain.plan.yaml` sha256 `c8a60b634ac88e51…`,
   `cal-lite` `6435fa5467edf3fa…`, `cal-full` `ddc98a59531f9a76…`): the fields of step 6, with this machine's paths
   (`/var/tmp/j6cal/trees/<tree>`), ports 22000, 22100, 22200, `$60` a tree and `$12` an attempt, `gradeWorkers 2`,
   `regressionCheck { from: 2 }`, no `fanOut`, no `services` (SQLite), an `envFile` that puts Node 24 first, and
   **`push:` to a bare repository of the machine's own** (`/var/tmp/j6cal/remotes/<tree>.git`): a push to GitHub needed
   a permission this session was not granted, so the trees and logs survive a container restart, not the machine. The
   kit is frozen at `/var/lib/cdd-frozen/r16/calibration`, byte for byte the repository's `calibration/` (files sha256
   `60443730d29250fe…`), readable by its owner only — which is also the agent's user on this machine, so the scan, not
   the permission, is what holds.
3. **Scores 4, 5 and 6 are struck for the calibration and for Tally** until an instrument exists for Tally: no chaos
   suite, no reading rubric and no measure of Lite's decisions were written for it. They may return by a registered
   amendment before any analysis that uses them. The scores kept are 1 (cost of change), 2 (correctness) and 3 (cost).
4. **The bands, for three trees per arm,** written before any Tally run (the calibration has one tree per arm and
   decides nothing): H8 reads *supported* when Lite's median cost per delivered feature is at most 0.6 times Full's
   and the two ranges do not overlap, with Lite's structural passes and no more triaged failures or regressions than
   Full's; *not supported* when Lite's median is 0.9 times Full's or more, or Lite has more triaged failures or
   boundary failures than Full; *undecided* otherwise, and an undecided H8 extends the campaign to five trees per arm
   before any decision. H1 and H2 are counts of triaged failures by cause, reported as such, with no threshold
   below six failures per arm. H3's slope is the least-squares slope of an arm's cost per request against the
   request's index over its delivered requests, reported with its range over the arm's three trees; *flatter* means
   Full's three slopes all below Simple's three.
5. **One reader.** The operator wrote the requests, the hidden tests, the storms and the trees, and reads the gradings;
   no second reader signed the acceptance files. The record says so.
6. **The machine:** 4 CPUs, 15 GB of memory, 23 GB free, three ladders at once as the plans say (`machine.ladders`),
   started after the K4 pilot's runner has exited, so that no agent of the pilot shares the machine with them;
   `resume.mjs` is not wired to a boot hook on this machine: after a restart the operator runs it by hand.

The status line of this file does not change: the calibration is a rehearsal of the harness and is not counted;
Tally's registration stays proposed, with these amendments, for the maintainer's approval.

## Amendment of 17 November: Tally's trees made again here, the registration approved

After the calibration ([`calibration-run-2026-11-17.md`](calibration-run-2026-11-17.md)), the maintainer approved this
registration as amended and decided: the budgets as registered ($200 a tree, $12 an attempt); the checkpoints'
sessions written by the operator from [`app/storms/README.md`](app/storms/README.md) as checkpoint 1's was, each shown
to the maintainer before it is committed, the ladders resumed within the hour; three ladders at once in the registered
order; Tally's kit unchanged (its requests state what a non-party gets).

**The nine trees, made again on this machine** (the J5b machine's are not reachable), each made, not copied, with
fixed authors and dates, so that the three trees of an arm are the same commit:
- `plain-1..3`: OpenStay's `created: plain` (`08b94b0`, the pilot's `simple.bundle`) named `tally` (`package.json`, the
  guide's title) with the guide's two sections (*One rule*, *The API's shapes*): commit `83a0dec`; guide sha256
  `6da99132f54c…`; `yarn verify` passes.
- `lite-1..3`: `create <tree> --name tally --profile lite` (3.2.0, vendored), commit `e78bcda`; then checkpoint 1's
  session, T1 to T5 (Groups and Ledger declared and described, the two relationships `planned`, two empty
  `LiteModule`s registered, ADR 1), commit `4d3a85c`; the six checks and the gate pass.
- `full-1..3`: `create <tree> --name tally` (3.2.0, vendored), commit `472f78d`; the same session as Full modules,
  commit `96973b9`; the six checks and the gate pass; the ten storms of checkpoint 1 are legal (`storm validate`).
- Pushed to `https://github.com/jgaNet/tally` as `trees/<tree>` before any run; each plan pushes there after every
  delivery (`trees/<tree>`, `logs/<tree>`).

**The plans**, beside this file ([`plans/tally-*.plan.yaml`](plans)): the fields of step 6 with this machine's paths
(`/var/tmp/j6/trees/<tree>`), ports 21100 to 21900, `services: pg.sh start <tree>` (`/var/tmp/j6/bin/pg.sh`, written
again: one PostgreSQL 16 server per tree under `/var/lib/postgresql/j6/<tree>`, ports 55481 to 55489; `full-1` started,
took a `CREATE DATABASE`, stopped, status 3), an `envFile` per tree with `TALLY_POSTGRES` and `DATABASE_URL`, no
`fanOut`, checkpoint 1's ten requests. sha256: tally-full-1.plan.yaml 1fd66a902c8c2a06…;tally-full-2.plan.yaml b0d9b7f04f4ba4c0…;tally-full-3.plan.yaml 05350ab2845e5c5b…;tally-lite-1.plan.yaml 45b447f4227091de…;tally-lite-2.plan.yaml da7223bbada6393e…;tally-lite-3.plan.yaml b6d217ec9c08c096…;tally-plain-1.plan.yaml 61b46241578f4f88…;tally-plain-2.plan.yaml 0119604ec55858e5…;tally-plain-3.plan.yaml 07b11fef33fb0ef4…; **The kit** is frozen at
`/var/lib/cdd-frozen/r16/app`, byte for byte the repository's `app/` (files sha256 `09b63f4f5bd8040a…`).

**The machine:** the K4 pilot's, 4 CPUs, 15 GB, 20 GB free; the harness at the branch's head (the ladder's four
fixes, the slot race and the register's lock); `resume.mjs` run by the operator after a restart.
