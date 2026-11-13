# The kit standard: a convention is tested where it is born

The standard a benchmark kit is held to before its campaign is registered. It applies to the next campaign's kit (the
[three-arms protocol](three-arms/README.md), and any next OpenStay campaign); J5's and J5b's kits stay as they ran.

## Why

OpenStay's J5 and J5b failed the same way three times: a convention was taken early, nothing tested it where it was
born, and a late request required it.

| Where it failed | What the tree answered | Where the convention was born |
| --- | --- | --- |
| J5, request 80 | a refusal as `503` | request 1 says a refusal is a `4xx` or an `ERROR`; the habit began at request 26, which no test asked |
| J5b clean-3, request 61 | an operation's `error` as `{ type, message }` | request 61 says `"<NAME>"`; request 1 never said which |
| J5b simple-3, request 73 | `payment: null` for a lapsed booking | request 27 says `null` only for a request still waiting |

A sentence in the guide did not fix any of them ([J5's repairs](openstay/j5/repairs.md),
[J5b's](openstay/j5b/repairs.md)). A test that refuses the deviation at the request that sets the convention does: the
tree that deviates fails there, while the code is new.

## What a kit carries

Beside `backlog/`, `acceptance/` and `storms/`, as before:

- **`api/<n>-<id>.yaml`, one per request whose backlog file has an API table:** the request's API, as data. The
  hidden tests validate every answer they read against the API composed up to the request they grade.
- **`conventions.yaml`:** every convention a later request relies on, with the request that sets it (`born`) and the
  hidden test that holds it there.

## A fragment

A fragment says what its request adds to the API: resources (JSON Schema, draft-07), the routes that answer them by
status, and, from then on, what any route may answer. Request 27 of OpenStay, written as one:

```yaml
# api/27-pay-a-booking.yaml
resources:
  booking:
    gains:                          # properties it now has, required from this request on
      payment:
        type: [object, 'null']
        required: [status, amount, fee]
        properties:
          status: { enum: [due, pending, paid] }
          amount: { type: integer }
          fee: { type: integer }
    conditions:                     # null in one case only: in every other state, later ones included, it is not
      - field: payment
        null_only_when: { status: [requested] }
routes:
  POST /v1/bookings/{id}/pay:
    200: { type: object, required: [paymentId, payUrl] }
```

- **`schema`** defines a resource, or replaces it whole; **`gains`** adds properties; **`states`** adds values to an
  enum (`{ field: status, add: [lapsed], test: … }`, the field a dotted path through `properties`);
  **`conditions`** says a field is `null` only when the stated values hold.
- **A response** is a resource's name (`200: booking`) or a JSON Schema, with `{ $resource: booking }` anywhere inside
  one (`{ type: array, items: { $resource: booking } }`). A status is exact (`404`) or a class (`4xx`).
- **`all_routes`**, usually in request 1, says what any route may answer besides its own (`202: accepted`, `4xx: {}`).
  Once a fragment declares it, an answer no request gives is refused: a `5xx` is never an answer a request gives.
- **Each shape names its request.** Composition stamps every node with the request that set it, so a problem reads
  `GET /v1/bookings/b1 answered 200: .payment should NOT be valid (request 27: payment is null only when status is
  requested)`, not only the line of a test.

## A register entry

```yaml
# conventions.yaml
conventions:
  - id: refusal
    says: A refusal is a 4xx at once or an operation that ends in ERROR; a 5xx is never an answer the application chooses.
    born: 1
    test: refuses what it cannot do with a 4xx, never a 5xx       # an it() in 1-accounts.acceptance.ts
  - id: operation-error
    says: An operation's error is the name of the rule that refused it, a string ("<NAME>").
    born: 1
    departs: operation.error                                      # the contract says { type, message }: decided here
    test: names the refused rule in the operation's error
  - id: payment-null
    says: A booking's payment is null while its request waits for its host, and in no other state.
    born: 27
    test: owes nothing while a request waits, owes the total once accepted, and lets only its traveller pay
```

The register lists at least: what a refusal is (its status and its shape), an operation's `error`, what `null` means
for each field that may be `null`, and, for each change that comes with time, whether it shows as soon as its time has
passed or at the next sweep. A request that says "refused, as request 1 says" relies on a convention; so does one that
says "with nobody acting" or "at least every `JOBS_INTERVAL_SECONDS`".

## States crossed with fields

A fragment that adds a state names a test, in that request's acceptance file, that reads the whole resource in that
state. The composed schema then holds every field there, the earlier ones included: the lapsed booking of request 30 is
read whole, and its `payment` is held to request 27's condition. Request 73 found that late; the test at request 30
finds it where the state is born.

## The operation, against the contract

The contract says what an operation is when read (`http.operation` in
[`architecture.yaml`](../../../conventions/architecture.yaml), [ADR 41](../../adr/0041-an-operation-read-is-in-the-contract.md)):
the reference answers `error` as `{ type, message }`. A kit's requests that compose an `operation` resource are
compared with it, field by field. A kit that wants another shape (OpenStay's `"<NAME>"`) decides it in its request 1,
says so in a convention born there with `departs`, and kit-check prints the difference as decided. Undecided, or
decided at a later request, it is refused: the conflict is the kit's to settle before any run.

## A change to what a tree already stored: `upgrade`

A request that changes a rule for what is already stored ("earlier expenses are not computed again", a new storage,
a new precision "for every amount read") cannot be tested on one commit: the database a hidden test reads was made by
the tree under test, which already has the new code. Such a request is marked `upgrade: true` in `backlog.yaml`. Its
test starts the tree before it with `previous('<id>')` from the kit's client, records through it, stops it, and reads
through the tree graded on the same database. `grade.mjs --previous <id>=<ref>` checks that tree out and names it to
the tests (`ACCEPTANCE_PREVIOUS`); the ladder passes the commit the feature's attempts started from. Graded without
it, the report says `previous: null`, and the case holds nothing. (Tally's request 10, J6.)

## Before registration: kit-check

```bash
node .claude/flow/kit-check.mjs <kit>
```

It refuses a request with an API table and no fragment (and a route of the table no fragment declares), a convention
without `born` or whose `it` is not in that request's acceptance file, a state added without its whole-resource test,
an `upgrade` whose test never starts the tree before it, and an operation that differs from the contract's undecided. It exits non-zero on any finding. The kit is then
rehearsed with `dry-run.mjs` ([the flow](../../../.claude/flow/README.md)), and both reports are committed with it.

## In the hidden tests: the lines a client needs

When the kit has `api/`, `grade.mjs` writes the API composed up to `--upto` beside the tests (`api-schema.json`) and
gives its path in `API_SCHEMA`. The kit's client passes every answer it reads through one function; with `ajv` (6 or 8)
in the kit's project:

```ts
import Ajv from 'ajv';

const api = process.env.API_SCHEMA ? JSON.parse(readFileSync(process.env.API_SCHEMA, 'utf8')) : undefined;
const ajv = new Ajv({ allErrors: true, verbose: true, strict: false });

/** Throws, naming the requests whose shape the answer breaks; a route no request declares is not held. */
function holdToApi(method: string, path: string, status: number, body: unknown) {
  const responses = api?.routes.find((r: { method: string; pattern: string }) => r.method === method && new RegExp(r.pattern).test(path))?.responses;
  const schema = responses && (responses[status] ?? responses[`${String(status)[0]}xx`] ?? responses.default);
  if (schema && !ajv.validate(schema, body))
    throw new Error(`${method} ${path} answered ${status}: ${(ajv.errors as { dataPath?: string; instancePath?: string; message?: string; parentSchema?: { $comment?: string } }[]).map(e => `${e.dataPath ?? e.instancePath} ${e.message} (${e.parentSchema?.$comment})`).join('; ')}`);
}
```

`path` is the whole path, `/v1` included. Without `API_SCHEMA` (a kit graded without `api/`), nothing is held. The same
lookup is [`schemaFor`](../../../.claude/flow/api-schema.mjs) in the flow, and its spec runs these lines.
