# OpenStay J4 reading, part C: O6, O9, O11 and the three change probes

Reader: a fresh agent that did not run J4. Trees read at `main` in `/runs/openstay/<tree>/app`, with `git grep`, `git show` and `git diff`. Nothing was run, built or changed. Paths below are relative to each tree's `app/`. Line numbers are at `main` unless a commit is named.

## Summary

| Item | simple-1 | simple-2 | simple-3 | clean-1 | clean-2 | clean-3 |
| --- | --- | --- | --- | --- | --- | --- |
| O6 The parts change apart | partial | partial | partial | pass | pass | pass |
| O9 The basics of security hold | pass | pass | pass | pass | pass (remark) | pass |
| O11 Request 40 landed in one place | fail | fail | fail | pass | partial | partial |
| O11: files changed / files holding a rule | 86 / ≈22 | 93 / ≈19 | 91 / ≈21 | 129 / 0 | 115 / 1 | 126 / 1 |
| O11: a rule changed meaning? | none found | none found | none found | none | none | none |
| O11: transactions still real on PostgreSQL? | yes | yes | yes | yes | yes | yes |
| P1 A second provider: files (new) / lines read | 8 (2) / ≈210 | 10 (2) / ≈210 | 8 (2) / ≈140 | 14 (2) / ≈170 | 13 (2) / ≈90 | 15 (2) / ≈60 |
| P2 A cleaning fee: files / lines read | 0, already holds (≈3 to itemise) / ≈180 | 0 (≈4) / ≈70 | 0 (≈3) / ≈60 | 0 (≈12–15) / ≈50 | 0 (≈12–15) / ≈40 | 0 (≈12–15) / ≈40 |
| P3 A minimum payout: files / lines read | 3 / ≈110 | 4 / ≈90 | 4 / ≈85 | 12 / ≈45 | 11 / ≈40 | 11 / ≈30 |

## Conventions I used (the same for all six trees)

- **Part.** In the simple trees, a part is a top-level directory under `src/` (`accounts`, `listings`, `bookings`, `quotes`, `payments`, `notices`, ...). In the clean trees, it is a context under `src/Contexts/`. The rubric's "prices" are `listings/*` plus the quote module in the simple trees, and the `Pricing` context in the clean trees.
- **O6, counting.** I counted the `import` lines in non-test files that name another part, and the SQL statements in one part that read or write another part's tables. In a clean tree, an import counts as "into internals" when it names another context's aggregate, value object or exception rather than a port or a read model. In the simple trees no file is marked as a part's public surface, so every import across parts lands in that part's own module. Grades: **pass** when parts reach each other only through a declared surface (ports and read models, or integration events), share no table, and the provider sits behind one adapter. **Partial** when the provider is isolated but the parts import each other's modules in both directions, or read each other's tables inside their rules. **Fail** when parts also routinely write each other's state.
- **O11, classifying a changed file.** Each file is one of: test, config or docs, storage (connection, schema, store, repository, query adapter, outbox, inbox, unit of work), wiring (composition root, `module.local.ts`, `app.ts`, `jobs.ts`), framework (`src/Architecture`, the event bus), route or transport, or **rule** (code that decides a business outcome: a refusal, an amount, a state change, a time rule, who may act). A simple-tree module that mixes SQL and decisions counts as a rule file. **Pass** when no rule, handler or route file had to change. **Partial** when only a handler or route changed, mechanically (an `await`), and no rule changed meaning. **Fail** when files that hold the rules had to be rewritten, even with meaning preserved.
- **Probes, one design for every tree,** so the counts compare:
  - P1. The host gives a country when opening the payout account. The account records which provider it is with. Payouts go through the account's provider. The second provider has a new adapter (its API) and a new signature checker (its webhooks), and its events are translated at the entry point into the same internal events, with ids prefixed per provider so the existing de-duplication holds. Reconciliation reads both providers. Configuration and wiring are added. The statement, earnings and payouts list read OpenStay's own payout records, so they need no edit when payouts are stored the same way.
  - P2. Requests 2 and 5 already give every listing a `cleaningFee` and every quote a `Cleaning fee` line `for: host`. So I check each clause against today's code and count only what is not yet true. "Shown on the statement, the receipt and the earnings" is satisfied by the charge, receipt and earnings amounts, which already include it. The count in parentheses is the extra work to show the fee as an item of its own there; it is estimated, not enumerated.
  - P3. The minimum is set and read back with the existing payout schedule (`PUT/GET /hosts/me/payout-schedule` gain `minimum`). The sweep that makes payouts holds a host's total below the minimum and adds it to the next one.
- **Lines read** is the rough number of source lines printed to find the files. It does not count directory listings of file names, which favour trees with many small, well-named files. The rubric says it is a proxy, and it is one.

## O6. The parts change apart

| tree | imports across parts | into internals | other parts' tables in SQL | provider called through | verdict |
| --- | --- | --- | --- | --- | --- |
| simple-1 | 94 | all 94 | reads ≈30 statements; writes in 2 places | one adapter, `src/payments/provider.ts`, called from 5 modules | partial |
| simple-2 | 152 | all 152 | reads ≈20; writes in 2 places | one adapter, `src/payments/payment-provider.ts`, called from 5 files, one a bookings route | partial |
| simple-3 | 86 | all 86 | reads ≈20; writes in 2 places | one adapter, `src/payments/provider.ts`, called from 5 modules | partial |
| clean-1 | 37 (9 wiring, 28 adapters) | 6 (`AccountRoles` ×4, `ListingVisibility`, `PromotionCodeExceptions`) | none | `IPaymentProvider` port, one adapter `Infrastructure/Http/HttpPaymentProvider.ts` | pass |
| clean-2 | 40 (8 wiring, 32 adapters) | 5 (`AccountRoles` ×4, `Amenities`) | none | `IPaymentProvider` port, one adapter `Infrastructure/HttpPaymentProvider.ts` | pass |
| clean-3 | 31 (all adapters) | 6 (`AccountRoles` ×4, `ListingVisibility`, `ListingStatus`) | one copy at schema creation | `IPaymentProvider` port, adapters `HttpPaymentProvider.ts` and `NoPaymentProvider.ts` | pass |

- **simple-1 (partial).** The provider is well contained: `fetch` only in `src/payments/provider.ts:222`, used by `booking-payments.ts`, `payout-accounts.ts`, `payouts.ts`, `refunds.ts` and `admin/reconciliation.ts`. The parts are not apart:
  - Bookings and payments import each other: `src/bookings/bookings.ts:21-22` imports `bookingPaymentOf`, `hasPaymentUnderWayOrPaid` and `refundStatusOf` from payments; `src/payments/booking-payments.ts:2,6` imports bookings and `lapseBooking`.
  - Payments' rules read the bookings table and its vocabulary: the payout due query `src/payments/payouts.ts:204` joins `bookings` and filters on `b.status IN ('confirmed','cancelled') AND b.check_in <= ?`. A change to how bookings store their state edits payments' rule.
  - Closing an account writes listings, holds and favourites: `src/accounts/accounts.ts:192`.
  - Bookings write the host's notice: `bookings.ts` imports notices.
  - Other cycles: accounts↔bookings, bookings↔listings, listings↔holds, listings↔organisations.
- **simple-2 (partial).** Same picture, with more imports (152). Quotes import listings 20 times and bookings import listings 14 times.
  - The provider is called from a bookings route: `src/bookings/bookings.routes.ts:739` calls `provider.createPayment`.
  - Payout candidates are a join over `bookings`: `src/payments/payout-store.ts:98`.
  - Closing writes listings: `src/accounts/account-store.ts:107`.
- **simple-3 (partial).**
  - Bookings import payments at `src/bookings/bookings.ts:18-19`, and payments import bookings at `src/payments/booking-payments.ts:3-4`.
  - Payments' movements join `bookings` (`src/payments/movements.ts:17-25`), and the payout due query joins bookings and decides on `b.status` and `b.check_in` (`src/payments/payouts.ts`, the `send` query).
  - Closing archives listings directly: `src/accounts/closing.ts:47`.
  - The provider is reached from 5 call sites (`payments/booking-payments.ts:246`, `payout-accounts.ts:39`, `payouts.ts:142`, `refunds.ts:186`, `reconciliation/reconciliation.ts:108`) through one adapter.
- **clean-1 (pass).**
  - No context's Domain or Application imports another context; every cross-context import is in an Infrastructure adapter or `module.local.ts`.
  - 22 of the 28 adapter imports are ports, e.g. `Listings/Domain/Listing/Ports/IListingTermsQueries`.
  - The 6 exceptions are domain types: `AccountRoles` in `src/Contexts/Booking/Infrastructure/Accounts/AccountsHosts.ts:1` and three more, plus `ListingVisibility` and `PromotionCodeExceptions`.
  - Each context's SQL touches only its own tables.
  - Payments learns of bookings through integration events (`src/SharedKernel/Application/IntegrationEvents/BookingIntegrationEvents.ts:17-26`, consumed by `src/Contexts/Payments/Application/Events/BookingConfirmedIntegrationEventHandler.ts`).
  - Closing an account publishes `AccountClosed`, which Booking and Listings handle in their own transactions.
  - The provider is reached by 5 Payments handlers and sweeps through `Application/Ports/IPaymentProvider.ts`.
  - A change to Accounts' role type would still edit 4 adapters in other contexts (adapters, not rules).
- **clean-2 (pass).** Same shape. Tables are schema-qualified per context (`booking.bookings`, `payments.payouts`), and no context's SQL names another schema. The 5 domain-type imports are `AccountRoles` ×4 and `Listings/Domain/Listing/Amenities` (`src/Contexts/Booking/Infrastructure/ListingsAsTerms.ts:7`).
- **clean-3 (pass).** Same shape. One exception in SQL: `src/Contexts/Pricing/Infrastructure/PostgresListingPrices.ts:31-44` reads Listings' `listings` and `listing_seasonal_prices` tables once, at schema creation, to copy prices that predate the Pricing context. It is a migration, not a rule, but it couples the two schemas.

## O9. The basics of security hold

What I checked, in every tree:
- J3: the password hash is salted and slow; no secret is fixed in code; the actor comes from the authenticated request; the owner is checked; a member's permission is read at request time.
- J4:
  - the webhook signature is computed over the raw body, compared in constant time, and refused when older than 300 s;
  - only the provider's `account.updated` changes a payout account's status;
  - the export reads by the caller's id only;
  - closing removes the email and the password, and the financial records keep only ids.

| tree | password, tokens | webhook signature (raw body, constant time, 5 min) | status from provider only | export / closing | verdict |
| --- | --- | --- | --- | --- | --- |
| simple-1 | scrypt with a random salt (`src/accounts/password.ts:8,14,24`); random tokens stored hashed (`accounts.ts:79,148`) | `src/payments/webhooks.ts:52-64` over the raw string body (`payments/routes.ts:90-94`), `timingSafeEqual`, `\|now−t\| > 300` refused | `payout-accounts.ts:82-90` only on `account.updated` | `src/accounts/traveller-data.ts:40-66` reads only the actor's data; `accounts.ts:178-200` nulls the email and password, enforced by a CHECK constraint (`database.ts:476-481`); contact hidden for a closed account | pass |
| simple-2 | scrypt with a salt (`src/accounts/password.ts:7,13,26`); hashed random tokens (`account-store.ts:33,74`) | `src/payments/webhook-signature.ts:26-35`, raw body (`webhook.routes.ts:144-150`), constant time, `>300 s` refused | `webhook.routes.ts:27-31` → `payout-account-store.ts:49` | `traveller-export.routes.ts:39-63` (other accounts' ids in history blanked); `account-store.ts:90-116` replaces the email with `closed:<id>` and clears the password | pass |
| simple-3 | scrypt with a salt (`src/accounts/passwords.ts:7,13-15,26`) | `src/payments/webhook.ts:20-41`, raw body (`payments/routes.ts:86-91`), constant time, `>300 s` refused | `payments/routes.ts:120` → `payout-accounts.ts:57` | `src/export/traveller-export.ts:47-72`; `src/accounts/closing.ts:44-62` clears the email, email key and password | pass |
| clean-1 | `ScryptPasswordHasher.ts:11-28`; HMAC token key from `TOKEN_SECRET` or random and kept in the DB (`createApplication.ts:71`, `accountTokenSecret.ts:7`) | `Payments/Presentation/API/REST/providerSignature.ts:11-31`, raw body (`webhook.routes.ts:18-19`) | `ApplyProviderEventCommandHandler.ts:25`; `PayoutAccount.ts:139-143` | `ExportMyDataQueryHandler.ts:28-43` asks for the caller only; `Account.ts:110-117` drops the email and password | pass |
| clean-2 | `ScryptPasswordHasher.ts:8-18`; random key kept in the DB (`PostgresDatabase.ts:168`) | `Presentation/API/REST/signature.ts:10-36`, checked inside the JSON body parser on the raw string (`payments.routes.ts:222-237`) | `ApplyProviderEventCommandHandler.ts:28` | `ExportMyDataQueryHandler.ts:27-41`; `CloseAccountCommandHandler.ts:36-37` deletes the account row (`PostgresAccounts.ts:54`); operation records keep no payload (`Tracker/Application/ReadModel/OperationRecord.ts:16-18`) | pass (remark) |
| clean-3 | `ScryptPasswordHasher.ts:12-32`; random key kept in the DB (`Accounts/module.local.ts:59`) | `Payments/Infrastructure/HmacWebhookSignatures.ts:15-32` behind the `IWebhookSignatures` port, raw body (`webhooks.routes.ts:17`) | `ApplyProviderEventEventCommandHandler.ts:30` | `ExportMyDataQueryHandler.ts:45`; `Account.ts:79-87` nulls the email and password | pass |

- **clean-2 remark.** Only the `application/json` parser checks the signature. A webhook sent with another content type is refused by Fastify with 415, not 400 (suspected from reading `payments.routes.ts:222`). It still changes nothing, so security holds, but the answer is not the 400 that request 26 names.
- **All trees.** Outbox rows are deleted once relayed: `PostgresOutbox.ts:43` (clean-1), `:58` (clean-2), `:52` (clean-3). So the email carried by an `AccountRegistered` event does not outlive the relay. No notices table holds an email in any tree.

## O11. Request 40 landed in one place

| tree | commits | files | test | config/docs | storage | wiring | framework | route/transport | rule | verdict |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| simple-1 | `bf6eb25` | 86 | 45 | 3 | 1 | 2 | 0 | 10 | 25 modules, ≈22 decide outcomes | fail |
| simple-2 | `2913461` | 93 | 49 | 2 | 15 | 1 | 0 | 14 (7 hold rules) | 12 modules, plus stores with rules in SQL: ≈19 | fail |
| simple-3 | `cf3df77` (+ `00d660e` a test, `e78f99a` lockfile after request 41) | 91 | 52 | 2 | 2 | 2 | 0 | 11 | 22 modules, ≈19, plus 2 routes with rules: ≈21 | fail |
| clean-1 | `bbd6ea0` (storm), `16d6ae9` | 129 | 44 | 5 | 61 | 7 | 9 | 0 | 0 (plus 3 non-storage adapters: token issuer, token secret, a comment in `ListingsTerms.ts`) | pass |
| clean-2 | `baa6ea3` (storm), `9c30cf0` | 115 | 63 | 5 | 32 | 7 | 4 | 1 (`authenticate.ts`) | 1 handler + 1 port + 1 adapter | partial |
| clean-3 | `93c070a` (storm), `256265c`, `4555724` | 126 | 58 | 7 | 43 | 8 | 6 | 1 (`authenticate.ts`) | 1 handler + 1 port + 1 adapter | partial |

**Did any rule change meaning?** No, in any tree, as far as reading can tell. I compared the decision-bearing lines each commit removed and added (comparisons, `Math.floor`, 4xx refusals, `Result.fail`):
- In the simple trees the removed and added lines pair up, and differ only by `await` and SQL dialect: `IS NOT` → `IS DISTINCT FROM`, `rowid` → `seq`, `date(?, '+1 day')` → `generate_series`.
- In the clean trees there are none outside the storage adapters.
- I also sampled the diff of simple-1 `src/bookings/bookings.ts`: every refusal and amount is unchanged.

**Are the transactions behind O2, O7 and O8 still transactions on PostgreSQL?** Yes, in all six.
- Every write path runs `BEGIN`, then `pg_advisory_xact_lock` (one global writer lock, standing in for SQLite's `BEGIN IMMEDIATE`), then the work, on one dedicated client, then `COMMIT` or `ROLLBACK`.
- Calls made inside a transaction go to its client: through `AsyncLocalStorage` in the simple trees, and through one writer connection or a process-wide current transaction in the clean trees.
- Evidence:
  - simple-1 `src/database.ts:519-541,565-579`;
  - simple-2 `src/database.ts:435-452`;
  - simple-3 `src/database.ts:80-104`;
  - clean-1 `src/Architecture/Infrastructure/Postgres/PostgresDatabase.ts:196-227`, with `PostgresUnitOfWork.ts:22-34`;
  - clean-2 `src/Architecture/Infrastructure/PostgreSQL/PostgresDatabase.ts:113-155`;
  - clean-3 `src/Architecture/Infrastructure/Postgres/PostgresDatabase.ts:149-176`.
- The simple trees have more transaction call sites after request 40 than before (simple-1 22 → 34, simple-3 25 → 27, simple-2 23 → 23), because a bare `run` now opens one of its own.

Tree by tree:

- **simple-1 (fail).** Every module that holds rules had to become async and change its SQL calls. For example, `src/bookings/bookings.ts` changed 269 lines (`create` is now `async` at `:202`, `cancel` at `:348`), `src/listings/listings.ts` 453 lines, and `src/payments/refunds.ts` 229 lines. All 10 route files changed too, to `await`. Meaning was preserved, but the change was not in one place.
- **simple-2 (fail).** Its rules live largely in the routes: `src/bookings/bookings.routes.ts` changed 211 lines and `src/listings/listings.routes.ts` 178. The jobs and helpers that decide outcomes changed too (`payout-job.ts`, `refund-job.ts`, `stay-terms.ts`, `lapse.ts`, `request-expiry.ts`, `organisations/access.ts`). The stores are a real storage layer (15 files), but the change crossed it.
- **simple-3 (fail).** `src/bookings/bookings.ts` changed 532 lines, `src/listings/listings.ts` 312 and `src/payments/refunds.ts` 218. Routes changed to `await`. A follow-up test fix (`00d660e`) and a lockfile fix (`e78f99a`) came after.
- **clean-1 (pass).**
  - No file under any context's `Domain` or `Application` changed. The change is Infrastructure adapters renamed from Sqlite to Postgres, schemas, `module.local.ts` wiring, the composition root and tests.
  - Several framework files under `src/Architecture/Application` also changed, because the outbox and event handlers became async (`EventHandler.ts`, `Outbox.ts`, `Operation.ts`). They are the base classes every handler uses, not rules.
  - The token key moved into the database without touching a handler: the composition root gives it at start (`src/Bootstrap/Fastify/createApplication.ts:71`, `HmacTokenIssuer.ts:15`).
- **clean-2 (partial).**
  - The token key moved into the database behind an async port: `ISessionTokens.issue` and `verify` now return a `Promise`.
  - So one query handler and the authentication hook changed by one `await` each: `src/Contexts/Accounts/Application/Queries/SignIn/SignInQueryHandler.ts:37` and `src/Contexts/Accounts/Presentation/API/REST/authenticate.ts:17`.
  - No rule changed meaning; everything else is storage, wiring, framework and tests.
- **clean-3 (partial).** Same as clean-2: `ITokens` became async, so `SignInQueryHandler.ts:40` and `authenticate.ts:16` gained an `await`. The rest is storage, wiring, framework (`DomainEvents.ts`, `EventHandler.ts`, `Outbox.ts`) and tests. Test-only diffs in `Application` specs (`ExpireBookingRequestsCommandHandler.spec.ts`, `NoticeDelivery.spec.ts`) are counted as tests.

## The change probes

### P1. A second provider (hosts in one country paid through another provider)

Under the design above:
- **simple-1 (8 files: 6 edited, 2 new; ≈210 lines read).**
  - Edited: `src/payments/routes.ts` (the country on `POST /hosts/me/payout-account`, a second webhook route); `src/payments/payout-accounts.ts` (choose and record the provider; `openAccount` at `:48`); `src/payments/payouts.ts` (`createPayout` through the account's provider, `:289`); `src/database.ts` (provider column on `payout_accounts` and `payout_batches`); `src/admin/reconciliation.ts` (`listTransactions` of both, `:95`); `src/app.ts` (configuration and wiring, `:110-140`).
  - New: the second provider's adapter; its signature checker and event translation.
- **simple-2 (10 files: 8 edited, 2 new; ≈210 lines).**
  - Edited: `src/payments/payout-accounts.routes.ts` (`:42` `openAccount`); `src/payments/payout-account-store.ts`; `src/payments/payout-store.ts` (candidates carry the provider, `:98`); `src/payments/payout-job.ts` (`:33` `provider.payout`); `src/payments/webhook.routes.ts` (second route; `readEvent` mapping `:19-60`); `src/payments/reconciliation.routes.ts` (`:45`); `src/database.ts`; `src/app.ts` (`:167-224`).
  - New: adapter, and signature plus translation.
- **simple-3 (8 files: 6 edited, 2 new; ≈140 lines).**
  - Edited: `src/payments/routes.ts` (country on `:30`; second webhook route next to `:89`; `changeOf` `:101`); `src/payments/payout-accounts.ts` (`:39`); `src/payments/payouts.ts` (`:142`); `src/reconciliation/reconciliation.ts` (`:108`); `src/database.ts`; `src/app.ts` (`:147`).
  - New: adapter, and signature plus translation.
- **clean-1 (14 files: 12 edited, 2 new; ≈170 lines).** All paths under `src/Contexts/Payments/`.
  - Edited: `Application/Commands/OpenPayoutAccount/OpenPayoutAccountCommandEvent.ts`, `OpenPayoutAccountCommandHandler.ts`, `Presentation/API/REST/Controllers/PayoutAccountController.ts`, `Presentation/API/REST/Routes/payout-account.routes.schema.ts` (country); `Domain/PayoutAccount/PayoutAccount.ts`, `Infrastructure/Postgres/PostgresPayoutAccountRepository.ts`, `Infrastructure/Postgres/payoutAccountSchema.ts` (provider kept); `Application/Sweeps/AskPayoutsSweep.ts` (payout through the account's provider); `Presentation/API/REST/Routes/webhook.routes.ts` and `Controllers/WebhookController.ts` (second route, translation; dispatch at `:44-60`); `Application/Queries/Reconcile/ReconcileQueryHandler.ts`; `module.local.ts`.
  - New: `Infrastructure/Http/<Second>PaymentProvider.ts` implementing `Application/Ports/IPaymentProvider.ts`, and its signature checker.
  - Nothing outside Payments changes.
- **clean-2 (13 files: 11 edited, 2 new; ≈90 lines).** All paths under `src/Contexts/Payments/` unless noted.
  - Edited: `OpenPayoutAccountCommandEvent.ts`, `OpenPayoutAccountCommandHandler.ts`, `Presentation/API/REST/Controllers/FastifyPaymentsController.ts`, `Presentation/API/REST/Routes/payments.routes.schema.ts`; `Domain/PayoutAccount/PayoutAccount.ts`, `Infrastructure/PostgresPayoutAccounts.ts`; `Application/Sweeps/PayoutsSweep.ts` (`:125` `createPayout` with `account.providerAccountId`); `Presentation/API/REST/Routes/payments.routes.ts` (second webhook route next to `:222-243`); `ReconcileQueryHandler.ts`; `module.local.ts`; `src/Bootstrap/Fastify/createApplication.ts` (`:76-110` reads the configuration).
  - New: adapter, and signature.
- **clean-3 (15 files: 13 edited, 2 new; ≈60 lines).** All paths under `src/Contexts/Payments/` unless noted.
  - Edited: `OpenPayoutAccountCommandEvent.ts`, `OpenPayoutAccountCommandHandler.ts`, `Presentation/API/REST/Controllers/FastifyPayoutAccountController.ts`, `Presentation/API/REST/Routes/payouts.routes.schema.ts`; `Domain/PayoutAccount/PayoutAccount.ts`, `Domain/PayoutAccount/DTOs.ts`, `Infrastructure/PostgresPayoutAccounts.ts`; `Application/Commands/RequestOwedPayouts/RequestOwedPayoutsCommandHandler.ts` (`:41-44`); `Presentation/API/REST/Routes/webhooks.routes.ts` and `Controllers/FastifyWebhookController.ts`; `ReconcileQueryHandler.ts`; `module.local.ts`; `src/Bootstrap/Fastify/createApplication.ts` (`:189-190`).
  - New: a second `IPaymentProvider` adapter, and a second `IWebhookSignatures` adapter.
- **All six.** The statement, earnings and payouts list need no edit: they read OpenStay's own payout records (for example simple-1 `src/hosts/statement.ts:33-50`, clean trees' ledger handlers). The simple trees need fewer files because one module holds a feature's storage, rules and provider calls. The clean trees need more because a new input field crosses route, schema, controller, command, handler and aggregate. But every one of those files is inside Payments, and the provider stays behind one port.

### P2. A cleaning fee

**Already holds in all six; 0 files to edit for the behaviour asked.**

- **Set by the host and on the quote.** The fee is set with the listing (request 2) and quoted as a `host` line:
  - simple-1 `src/quotes/quotes.ts:185`, simple-2 `src/quotes/quote-pricing.ts:109`, simple-3 `src/quotes/quotes.ts:192`;
  - clean-1, clean-2 and clean-3 `src/Contexts/Booking/Domain/Quote/Quote.ts` (3 references each).
- **Kept on the booking.** The booking keeps its quote's lines.
- **Refunded under the policy like a night.** The refund applies the policy to all `host` lines, or to everything not `external`:
  - simple-1 `src/bookings/cancellation.ts:58-70`, simple-2 `cancellation.ts:44-51`, simple-3 `cancellation.ts:39-52`;
  - clean-1 `Booking/Domain/Booking/Refund.ts:78-81`, clean-2 `Refund.ts:43-51`, clean-3 `Refund.ts:36-44`.
- **Paid out with the stay.** A payout is the payment less the provider's fee less refunds:
  - simple-1 `payouts.ts:212`, simple-2 `payout-job.ts:108`, simple-3 `payouts.ts` `send` query;
  - the clean sweeps.
- **On the statement, receipt and earnings.** These show the charge, the receipt amount and "charged", all of which include it.

**To show the fee as an item of its own** (estimate, not enumerated):
- **Simple trees, about 3–4 files.** The statement, receipt and earnings modules can join `bookings.lines_json` directly: simple-1 `src/hosts/statement.ts`, `src/payments/receipts.ts`, `src/hosts/earnings.ts`; simple-2 `statement-store.ts`/`statement.ts`, `receipt-store.ts`, `earnings.ts`; simple-3 `src/payments/movements.ts`, `src/receipts/receipts.ts`, `src/hosts/earnings.ts`.
- **Clean trees, about 12–15 files.** Payments does not know a booking's lines. The fee would travel the way the tourist tax does:
  - in the `BookingConfirmed` payload in the shared kernel (`src/SharedKernel/Application/IntegrationEvents/BookingIntegrationEvents.ts:17-19`, clean-1; `:17-24`, clean-2);
  - through Booking's publishing handler;
  - to Payments' consuming handler, the `Payment` aggregate and its storage;
  - to the statement, receipt and earnings handlers, queries, read models and response schemas.

Lines read: simple-1 ≈180, simple-2 ≈70, simple-3 ≈60, clean ≈40–50.

### P3. A minimum payout

- **simple-1 (3 files; ≈110 lines).**
  - `src/payments/payout-schedules.ts`: parse, keep and read the minimum. The route passes the body through (`src/payments/routes.ts:48-51`), so it needs no edit.
  - `src/payments/payouts.ts`: `batchDue` (`:229-270`) groups a host's waiting payouts and holds a group below the minimum. A daily host's payouts must then be grouped too; the batch already references by its own id when it pays several.
  - `src/database.ts`: a column.
- **simple-2 (4 files; ≈90 lines).**
  - `src/payments/payout-schedule.ts`: `readSchedule` and the store.
  - `src/payments/payout-store.ts`: the candidates carry the minimum, `:90-100`.
  - `src/payments/payout-job.ts`: `payOwedHosts` `:86-133` holds a host's lines below the minimum, for daily and weekly.
  - `src/database.ts`.
- **simple-3 (4 files; ≈85 lines).**
  - `src/payments/payout-schedule.ts`.
  - `src/payments/payout-routes.ts`: the body schema `scheduleSchema`, `:37-39`.
  - `src/payments/payouts.ts`: `plansOf` and the `send` query.
  - `src/database.ts`.
- **clean-1 (12 files; ≈45 lines).** All under `src/Contexts/Payments/`:
  - `Application/Commands/SetPayoutSchedule/SetPayoutScheduleCommandEvent.ts`, `SetPayoutScheduleCommandHandler.ts`;
  - `Domain/PayoutAccount/PayoutAccount.ts` (`setSchedule` `:153`), `PayoutAccountExceptions.ts`;
  - `Infrastructure/Postgres/PostgresPayoutAccountRepository.ts`, `payoutAccountSchema.ts`, `PostgresPayoutAccountQueries.ts`;
  - `Application/ReadModel/PayoutAccountView.ts`, `Application/Queries/GetPayoutSchedule/GetPayoutScheduleQueryHandler.ts`;
  - `Presentation/API/REST/Routes/payout-account.routes.schema.ts`, `Controllers/PayoutAccountController.ts`;
  - `Application/Sweeps/AskPayoutsSweep.ts`, which holds the total below the minimum.
- **clean-2 (11 files; ≈40 lines).** All under `src/Contexts/Payments/`:
  - `SetPayoutScheduleCommandEvent.ts`, `SetPayoutScheduleCommandHandler.ts`;
  - `Domain/PayoutAccount/PayoutSchedule.ts`, `PayoutAccount.ts`, `PayoutAccountExceptions.ts`;
  - `Infrastructure/PostgresPayoutAccounts.ts`;
  - `Application/ReadModel/PayoutScheduleReadModel.ts`, `GetPayoutScheduleQueryHandler.ts`;
  - `Presentation/API/REST/Routes/payments.routes.schema.ts`, `Controllers/FastifyPaymentsController.ts`;
  - `Application/Sweeps/PayoutsSweep.ts` (`:59-70` decides daily or weekly).
- **clean-3 (11 files; ≈30 lines).** All under `src/Contexts/Payments/`:
  - `SetPayoutScheduleCommandEvent.ts`, `SetPayoutScheduleCommandHandler.ts`;
  - `Domain/PayoutAccount/PayoutAccount.ts`, `DTOs.ts`, `PayoutAccountExceptions.ts`, `PayoutAccountReadModels.ts`;
  - `Infrastructure/PostgresPayoutAccounts.ts`, `PostgresPayoutAccountQueries.ts`;
  - `Presentation/API/REST/Routes/payouts.routes.schema.ts`, `Controllers/FastifyPayoutScheduleController.ts`;
  - `Application/Commands/RequestOwedPayouts/RequestOwedPayoutsCommandHandler.ts` (`:71-88` groups payments by schedule).
- **All six.** Every file stays inside the payments part. The clean trees touch about three times as many files, because one new field crosses command, handler, aggregate, repository, read model, query, schema and controller. The rule itself is one function in every tree: the sweep, or the simple trees' batching function.

## Notes and limits

- The probe counts are a proxy, as the rubric says.
  - The clean trees' higher counts come from layering, not from leaking across parts: every file a clean probe names is inside the Payments context.
  - The simple trees' lower counts come from modules that hold storage, rules and provider calls together, which is also why request 40 had to rewrite their rule files.
- Lines read are approximate, and lower for the trees read later, once the probe design was settled. The clean trees' numbers also leave out directory listings of file names.
- O11 rule counts in the simple trees are approximate (≈). A module that mixes SQL and decisions was counted as one that holds a rule. The exceptions were `bookings/conditions.ts`, `bookings/history.ts` and `hosts/dashboard.ts`, which only record or read.
