# Reading of the robustness campaign (requests 15, 16, 17), six trees

Independent reader. Only `git diff <base> main` and `git show main:<path>` were read. Nothing was run. Line numbers are at `main`. "Suspected" means the window can be seen in the code, but reading alone cannot show it happens.

Trees: A = a2, a3 (architecture with tooling); D = d1, d2 (architecture as prose); P = p2, p3 (plain).

---

## R1: where each guarantee lives

| Tree | 15: a notice told once after a crash | 16: concurrent changes, two processes | 17: outside delivery until accepted | Business-rule files the campaign edited |
| --- | --- | --- | --- | --- |
| a2 | **Infrastructure.** A durable inbox is checked and written in the reaction's transaction (`Architecture/Application/EventHandler.ts:45-47`, `Infrastructure/Inbox/SqliteInbox.ts`). The outbox acknowledges an entry only once `delivered` is true (`Application/Outbox.ts:55-80`, `Infrastructure/EventBus/InMemoryEventBus.ts`). | **Infrastructure.** `BEGIN IMMEDIATE` is retried without blocking (`Infrastructure/UnitOfWork/SqliteUnitOfWork.ts:87-101`), with `TransactionTurns.ts` and WAL plus busy_timeout (`Storage/SqliteStorage.ts`). The per-repository version checks were already there and were left as they were. | **Business rules plus an application service.** The `Notification` aggregate gets an `outside: owed/accepted` state and `deliveredOutside()` (`Notifications/Domain/Notification/Notification.ts:39,87,122,158`). `Application/Services/DeliverNotificationsOutside.ts` sends and retries, and a 100 ms poll runs in `createApplication.ts:83`. | 1 rule file (`Notification.ts`) and 3 domain declarations (`DTOs.ts`, `NotificationEvents.ts`, `Ports/INotificationQueries.ts`). The 2 integration handlers carry an `owedOutside` flag. **The note rules and sharing rules: 0.** |
| a3 | **Infrastructure.** Same shape: `EventHandler.ts:44-46`, `SqliteInbox.ts`, `SqliteOutbox.ts:76-88` (the row is deleted only when `delivered` is true), `InMemoryEventBus.ts`. | **Infrastructure.** `SqliteDatabase.ts:28-39` (a busy timeout on both connections). `SqliteUnitOfWork.ts:29-48` turns a busy lock into a `ConcurrencyConflictException`. `ExecutionContext.ts` turns a failed begin into a failed Result, and the existing command retry re-decides. | **A new aggregate in the Notifications domain.** `Domain/Forwarding/Forwarding.ts` holds the claim lease, the retry delay, accepted and cancelled. `Application/Services/NotificationForwarding.ts` plans, claims, sends and records. Three thin domain-event handlers plan or cancel. `Notification` is untouched. | **0 existing rule files.** Five new domain files under `Forwarding/`. Notes and sharing: 0. |
| d1 | **Infrastructure.** `EventHandler.ts:52-54` (the inbox is recorded `beforeCommit`), `SqliteInbox.ts`, `Outbox.ts:53-77`, `InMemoryEventBus.ts:79-99` (subscriptions are named, for the inbox). | **Infrastructure.** `Sqlite/SqliteDatabase.ts:126-145` (`BEGIN IMMEDIATE` retried for up to 30 s without blocking). `InMemoryUnitOfWork.ts` now takes turns. | **A new aggregate.** `Domain/OutsideDelivery/OutsideDelivery.ts` holds the retry schedule and accepted or cancelled. `Application/Services/OutsideDeliveries.ts` sends; `OutsideDeliveryHandlers.ts` schedules and cancels. | 1 rule file (`Notification.ts`: the getters `message`, `toldAt` and `withdrawn`, lines 144-160) and 1 port (`INotificationRepository.ts`: `findById`). Notes and sharing: 0. |
| d2 | **Infrastructure.** `EventHandler.ts:43-48`, `Outbox.ts:53-75`, `Inbox/InMemoryInbox.ts` (a store persisted through `SqliteDataSource`), `InMemoryEventBus.ts`. | **Infrastructure.** `DataSources/SqliteDatabase.ts:83-215`: `turn()` takes the process's turn, then the SQLite write lock (`lock()`), then reloads the tables another process changed (`sync()`, using `data_version`). The rest is in `Turns.ts` and `ExecutionContext.ts`. | **A new aggregate.** `Domain/Delivery/Delivery.ts` holds the attempt hold, the retry delays, accepted and cancelled. `Application/Services/NotificationDispatcher.ts` claims, sends and records; `NotificationDeliveryHandlers.ts` schedules and cancels. | 1 rule file (`Notification.ts:190-196`: the creation event carries `noteId` and `occurredAt`) and `NotificationEvents.ts`. Notes and sharing: 0. |
| p2 | **The notifications module.** `notifications/notifications.ts:111-149`: what each recipient is owed is stored, with the notification ids already chosen, inside the archive transaction. It is delivered and forgotten in a transaction of its own, at start (`:96`) and after each archive (`app.ts:75-78`). | **Storage, plus every business method.** `storage/store.ts:92-128` (`BEGIN IMMEDIATE`, and a reload when `data_version` moved). The call is written into every write method: `notes/notes.ts` (10 sites, `:190`-`:328`), `accounts.ts`, `plans.ts` and `notifications.ts`. | **A storage-like module beside notifications.** `notifications/outbox.ts` (claim, retry, delete on 2xx). It is fed from `notifications.ts:191` inside the transaction that records the notification. | **4:** `notes/notes.ts` (the note rules and the sharing rules, 10 methods re-wrapped), `notifications/notifications.ts`, `accounts/accounts.ts`, `plans/plans.ts`. |
| p3 | **A module of its own.** `archivings.ts` (`owe()` runs inside the archive transaction; `deliver()` runs one transaction per archiving owed), with `store.ts` `afterCommit`. It is triggered from `app.ts:85-106`. | **Storage, plus one wrapper.** `store.ts:180-215` (`BEGIN IMMEDIATE`, and table reads that always go to the file). `tracker.ts:39` runs every command in one transaction; `notes.ts:151` copies the note before changing it. | **A module of its own.** `courier.ts` (claim with a lease, backoff, delete on 2xx). It is fed from `notifications.ts` `notify` and `withdraw`. | **3:** `notes.ts` (`setArchived` only), `notifications.ts`, `accounts.ts` (`signUp`, `byEmail`). |

The A and D trees hold 15 and 16 entirely in the architecture's mechanics: the event handler base, the outbox relay, the unit of work and the SQLite adapter. The notes' rules and the sharing rules are not touched. In 17, a2 puts delivery state on the `Notification` aggregate itself; a3, d1 and d2 model it as a separate aggregate. The P trees put 16 into the business modules, around every write in p2 and through one tracker wrapper in p3. Both P trees put 15 and 17 into dedicated modules.

**A retry-timing miss, not one of the four hazards.** In p3, `courier.ts:31` caps the backoff at 4000 ms. When the service does not answer, one attempt spends the 2000 ms timeout (`:24`) and then waits 4000 ms, so two sendings start up to about 6.2 s apart. The request allows at most 5 s. The other five trees stay at or under about 4.7 s.

---

## R2: one place per guarantee

| Tree | 15 | 16 | 17 | Verdict |
| --- | --- | --- | --- | --- |
| a2 | Once: the `EventHandler` base and `relayOutbox`. | Once: `SqliteUnitOfWork.beginWhenWritable`. The four hand-written version checks in the repositories were already there and were not touched. | Once: `DeliverNotificationsOutside`. The `owedOutside` flag is passed through 2 handlers and 2 factories. | **One place** |
| a3 | Once: `EventHandler` and `SqliteOutbox.markPublished`. | Once: `SqliteUnitOfWork` and `SqliteDatabase`. But **2 new hand-written version checks** were added (`InMemoryForwardingRepository.ts`, `SqliteForwardingRepository.ts:36-48`), following the existing per-repository pattern. | Once: `Forwarding` and `NotificationForwarding`. | **One place** (the pattern of a version check per repository is inherited) |
| d1 | Once: `EventHandler` and `relayOutbox`. | Once: `SqliteDatabase.begin`. **2 new version checks**, and the rule "one delivery per notification" is written twice (`InMemoryOutsideDeliveryRepository.ts`, `SqliteOutsideDeliveryRepository.ts`). | Once: `OutsideDelivery` and `OutsideDeliveries`. | **One place** (the same inheritance) |
| d2 | Once: `EventHandler` and `relayOutbox`. | Once: `SqliteDatabase.turn/lock/sync`. 1 new version check (`InMemoryDeliveryRepository.ts`). | Once: `Delivery` and `NotificationDispatcher`. | **One place** |
| p2 | Once: `Notifications.noteArchived/deliverPending`. | **Mechanism once** (`store.transaction`), **applied by hand at about 20 sites**: 10 in `notes.ts`, plus `accounts`, `plans`, `notifications` and `outbox`. A new write method that forgets the wrapper loses the guarantee. | Once: `outbox.ts`. | **Partly re-applied per use case** (16) |
| p3 | Once: `archivings.ts`. | Once: `tracker.ts:39` wraps every command. `setArchived` adds a nested transaction for its copy. | Once: `courier.ts`. | **One place** |

---

## R3: hazards seen in the crash and concurrency paths

| Tree | Lose a notification | Double one | Different body to the service | Lose a change silently |
| --- | --- | --- | --- | --- |
| a2 | None seen. | **17, two processes (real):** see H-a2-1. | None. The body is built from immutable notification fields. | None seen. |
| a3 | **15, delayed until a restart (suspected loss):** see H-a3-1. | **17 (suspected):** see H-a3-2. | None. The message is stored in the Forwarding. | None seen. |
| d1 | **15 (real code path, needs a failing reaction):** see H-d1-1. | **17, two processes (real):** see H-d1-2. | None. The message is stored. | None seen. |
| d2 | None seen. | **17 (suspected):** see H-d2-1. | None. | **Pre-existing (suspected), made reachable:** see H-d2-2. |
| p2 | None seen. | **17 (suspected), margin of only 0.5 s:** see H-p2-1. | None. | None seen. A note is changed in place before it is saved, and the rollback reload runs only when `wrote` is true; no validation was found that throws after a change and before the write. |
| p3 | None seen. | **17 (suspected):** see H-p3-1. | None. | None seen. |

Hazard details:

- **H-a2-1.** `DeliverNotificationsOutside.ts:40-44` reads what is owed outside any transaction. The only guard against a double send is `#sending` (`:29`), which lives in one process. Two processes with `NOTIFY_URL` both send the same notification. Process B can also send one that A already had accepted: B reads the owed list, then A records the acceptance (`:66`, `recordAccepted` at `:81`), then B sends. The id is the same, so the service tolerates it, but the request says an accepted notification is not sent again.
- **H-a3-1.** `SqliteOutbox.ts:76-88` hides an entry from `pending()` for the rest of the run (`#published`, `:67`), even when a subscriber failed. Its comment says "relayed again at the next start". So a reaction that fails leaves the notice untold until the process restarts, or until another process relays it. A process that never restarts never tells it. The test `SqliteInbox.spec.ts:93` writes this behaviour down as intended.
- **H-a3-2.** The lease is 3000 ms (`NotificationForwarding.ts:25`, claimed at `:87`). The send may take the 2000 ms timeout (`:98`). Recording the answer (`:99`) then needs `BEGIN IMMEDIATE`, which may block for up to 5000 ms while another process writes (`SqliteDatabase.ts:28`). If the lease runs out between the 2xx and that commit, another process claims the forwarding and sends an accepted notification again.
- **H-d1-1.** `Outbox.ts:68-69` marks an entry published when `delivered` settles. `delivered` is `Promise.allSettled(...)` (`InMemoryEventBus.ts:79`), and the delivery promise resolves even when the operation ERRORed (`:96-98`). So an entry is deleted even when its reaction failed. Examples of such a failure: no write lock after 30 s (`SqliteDatabase.ts:126-145`), a version conflict, any refusal. The notice is then never relayed again and is lost. The other A and D trees pass a boolean and keep the entry.
- **H-d1-2.** `OutsideDeliveries.ts:41-50` reads what is due inside a transaction but writes no claim. The only guard is `#onTheirWay`, per process (`:24`). Two processes send the same delivery, and one can send after the other recorded acceptance. This is the same window as in a2.
- **H-d2-1.** The attempt hold is 3000 ms (`Delivery.ts:61`, set in `attempt()` at `:149`). It covers the 2000 ms timeout plus a record turn that may wait for up to 10 s (`SqliteDatabase.ts:18`). The window is the same as in a3: between the 2xx (`NotificationDispatcher.ts:52`) and its record (`:57`).
- **H-d2-2.** A rollback restores whole-store snapshots (`InMemoryUnitOfWork.ts:55-59`, under `SqliteUnitOfWork.rollbackTransaction`). The Tracker's `operations` store and the outbox are among those stores. A Tracker record or an outbox acknowledgement written outside the transaction while it was open is undone when that transaction is refused. The outbox case is harmless, since the inbox catches the relay. An undone Tracker outcome can leave a client reading PENDING for a change that was kept. The base already admitted this limit; the change does not remove it.
- **H-p2-1.** The claim is `CLAIM_MS = 2000 + 500` (`outbox.ts:24`, set at `:126`). After a 2xx at up to about 2000 ms (`:133`), the delete (`:140`) needs `BEGIN IMMEDIATE`, which may block for up to 5000 ms on busy. If the claim runs out first, another process sends the accepted notification again.
- **H-p3-1.** The lease is 3000 ms (`courier.ts:28`). The window is the same, between `:133` and `:139`.

Present in every tree: a crash between a 2xx and recording it sends the notification once more after the restart, under the same id. The request allows this.

No tree has a test that runs two processes with `NOTIFY_URL`, so none of the double-send windows above is exercised.

---

## R4: the rubric's N3 and N4 for what the campaign touched

| Tree | N3 (a rule written twice) | N4 (a refusal turned into a throw) |
| --- | --- | --- |
| a2 | **Pass**, with a note. `findOwedOutside` (`InMemoryNotificationQueries.ts`) states again "a reminder is shown once its moment has come and is not cancelled", next to `findByRecipient` in the same file. That rule is not one of N3's. | **Pass.** `deliveredOutside()` and a missing record return a Result. A write lock still held after 30 s throws from `beginTransaction`; that is a timeout, not a named refusal. |
| a3 | **Pass.** Forwarding takes its moment from `notification.at` and its cancellation from `NotificationCancelledEvent`. The rule "only a reminder not yet due is cancelled" stays in `Notification`. | **Pass**, and better than before: a busy begin becomes a `ConcurrencyConflictException` Result (`ExecutionContext.ts`, `SqliteUnitOfWork.ts:40-43`). |
| d1 | **Pass**, with a note. `Notification.toldAt` (`Notification.ts:154`) states again "an archiving at once, a reminder at its moment", which the queries also decide. Not one of N3's rules. | **Pass.** |
| d2 | **Pass.** `Delivery.cancel` guards on `attempts === 0`, which is a delivery rule, not a copy of the reminder rule. | **Pass**, and better than before: `lock()` refuses with `ConcurrencyConflictException`, and `ExecutionContext` turns a failed begin into a failed Result. |
| p2 | **Pass.** The rules were wrapped, not copied. | **Pass.** A busy database becomes `DomainError('CONFLICT')` (`store.ts:98`), which the tracker turns into ERROR, as every refusal in this tree already is. |
| p3 | **Pass.** | **Pass.** `Contention` becomes `CommandError('CONFLICT')` (`tracker.ts:41`). |

---

## R5: the change probe ("a notification is also sent by SMS, through a provider that does not exist yet, with the same retry guarantee")

| Tree | Files to edit | New files | Total |
| --- | --- | --- | --- |
| a2 | `Domain/Notification/Notification.ts` (a second delivery state and its accept method), `DTOs.ts`, `Ports/INotificationQueries.ts`, `Infrastructure/Queries/InMemoryNotificationQueries.ts`, `NoteArchivedIntegrationEventHandler.ts`, `ReminderScheduledIntegrationEventHandler.ts`, `Services/DeliverNotificationsOutside.ts` (take a channel as a parameter), `module.local.ts`, `Bootstrap/Fastify/createApplication.ts`; possibly `NotificationEvents.ts` | SMS adapter implementing `IOutsideNotifier` | **10** (11 with the event) |
| a3 | `Infrastructure/Tables/ForwardingsTable.ts` and `Repositories/SqliteForwardingRepository.ts` (table name as a parameter), `module.local.ts` (a second `NotificationForwarding` and its handlers), `createApplication.ts` (a second loop) | SMS adapter implementing `IOutsideNotifications`; **distinct handler classes** | **6** |
| d1 | `Infrastructure/SqliteOutsideDeliveryRepository.ts` (table name as a parameter), `module.local.ts`, `createApplication.ts` | SMS adapter implementing `IOutsideNotificationService` | **4** |
| d2 | `module.local.ts` (a second repository on its own store, a second dispatcher, a second start), `Application/Events/NotificationDeliveryHandlers.ts` (**distinct handler classes**) | SMS adapter implementing `INotificationService` | **3** |
| p2 | `notifications/outbox.ts` (table name and sender as parameters), `notifications/notifications.ts` (several outboxes), `app.ts` | SMS provider | **4** |
| p3 | `courier.ts` (table name as a parameter; `send` is already injected), `notifications.ts` (several couriers), `app.ts` | SMS send function | **4** |

**A trap in a2, a3 and d2.** The durable inbox names a subscriber by its handler class: `this.constructor.name` in a2 (`EventHandler.ts:41`), `${event.name}:${class}` in a3 (`EventHandler.ts:42`), `${event.name}/${class}` in d2 (`EventHandler.ts:40`). A second instance of the same handler class on the same event shares the first one's key, so it is skipped as "already handled". The SMS delivery would then never be scheduled, and no error would say so. In a3 and d2 the second channel therefore needs new classes; a2 avoids the trap only because it has to change the aggregate anyway. d1 names each subscription with a counter (`InMemoryEventBus.ts:84-86`, the `#2` suffix), so two instances work.

---

## R6: how the agents' own tests exercise the guarantees

| Tree | A real SIGKILL, restarted on the same file | Two or more real processes on one file | Notes |
| --- | --- | --- | --- |
| a2 | `Bootstrap/Fastify/crash.e2e.spec.ts:109-122`: the drill kills the server with SIGKILL, and it restarts "however many times". `outside.e2e.spec.ts:165-185`: an external SIGKILL (`:85`), then a restart, twice. | `concurrency.e2e.spec.ts:112-171`: two spawned servers behind a balancer. | `SqliteInbox.spec.ts` and `Outbox.spec.ts` are unit-level. No test runs two processes with `NOTIFY_URL`. |
| a3 | `crash.e2e.spec.ts:94-117`: the drill's self-SIGKILL is asserted, then a restart. `forwarding.e2e.spec.ts:139-172`: SIGKILL to the process group (`:80`, `:167`), then a restart. | `concurrency.e2e.spec.ts:88-100`: two spawned servers. | The "another process" block of `SqliteUnitOfWork.spec.ts:81` is two connections in one process. |
| d1 | `crash.e2e.spec.ts:127-171`: the drill's self-SIGKILL, then restarts "again, and again". `outside.e2e.spec.ts:158-165`: an external SIGKILL, then a restart. | `concurrency.e2e.spec.ts:82-92`: three spawned servers. | `SqliteDatabase.spec.ts:13` is named "several processes" but uses two connections in one process. No test makes a reaction fail, so H-d1-1 is not exercised. |
| d2 | `crash.e2e.spec.ts:133` (the drill) and **`:167-200`: an external SIGKILL 0, 3, 8 and 15 ms into rounds of archiving, then restarts. This is the closest any tree comes to "killed at any moment".** `notify.e2e.spec.ts:178`: SIGKILL, then a restart. | `concurrency.e2e.spec.ts:123-196`: several spawned servers. | |
| p2 | `storage/crash.spec.ts:36-47`: a real process killed by the drill, then a restart. `notifications/outbox.spec.ts:142-167`: `ServerProcess.kill()` (SIGKILL), then a restart. | `storage/concurrency.spec.ts:199-212`: three spawned servers. `:29` is two in-process apps. | |
| p3 | `crash.spec.ts:62-86`: a real process killed by the drill, then a restart. `outside.spec.ts:158-170`: `child.kill('SIGKILL')`, then a restart. | `concurrency.spec.ts:77-153`: three spawned servers. | `crash.spec.ts:135` simulates the crash in-process with a `crash` callback. |

Every tree has both kinds of test: a real SIGKILL followed by a restart on the same file, and real multi-process runs on one file. Only d2 kills at varied moments inside the work. None runs the outside-delivery path on two processes.

---

## Per tree

**a2.** 15 and 16 live entirely in the shared mechanics: the inbox inside the `EventHandler` base, an outbox acknowledged only on `delivered === true`, and `BEGIN IMMEDIATE` retried without blocking. The notes' rules and the sharing rules are untouched. 17 is the one place where delivery mechanics reach a business aggregate: the "owed or accepted" state sits on `Notification`, and an `owedOutside` flag runs through two handlers. That is why the SMS probe costs about 10 files, the highest of the six. Delivery is guarded only within one process, so two processes with `NOTIFY_URL` send twice and can send after acceptance (H-a2-1). Its tests kill real processes and run two servers.

**a3.** The cleanest separation for 17: a `Forwarding` aggregate with a claim lease, so `Notification` is untouched and 0 existing rule files changed. 15 is correct for crashes, but `SqliteOutbox` hides an entry whose reaction failed until the next start (H-a3-1). The 3 s lease has a suspected double-send window against a lock wait of up to 5 s (H-a3-2). The SMS probe costs 6 files, two of them because the inbox's key by class name forces new handler classes. Its tests kill real processes and run two servers.

**d1.** The same mechanics as the A trees, with one real defect: the relay acknowledges an outbox entry even when its reaction failed (`allSettled`), so a failing reaction loses the notice (H-d1-1). 17 is a separate `OutsideDelivery` aggregate with no cross-process claim, so two processes double-send (H-d1-2). Only getters were added to `Notification`. d1 alone names its subscriptions so that two instances do not collide in the inbox, which helps the probe (4 files). Its tests use real SIGKILL and three processes; nothing fails a reaction.

**d2.** The most elaborate storage layer: in-memory stores kept current from SQLite through `data_version`, with turns and a write lock across processes. A failed reaction keeps its entry pending, and the crash test kills at varied moments, the strongest test in the set. 17 is a `Delivery` aggregate with a hold, which leaves a suspected window like a3's (H-d2-1). The rollback that restores whole-store snapshots, already admitted in the base, can still undo out-of-transaction Tracker writes (H-d2-2). The SMS probe is the cheapest at 3 files, but it needs distinct handler classes because of the inbox key.

**p2.** 15 is a "pending archivings" table inside the notifications module, with the notification ids chosen up front, so delivering again is idempotent. That is simple and correct. 16 is one `store.transaction` mechanism applied by hand around every write: 10 methods in `notes.ts`, plus accounts, plans and notifications. That makes 4 business-rule files edited, and a guarantee that depends on every future method remembering the wrapper. 17's `outbox.ts` claims rows across processes, but the claim margin is only 500 ms (H-p2-1). The SMS probe costs 4 files. Its tests run real processes, both killed and concurrent.

**p3.** It applies 16 at one choke point: the tracker runs every command in one transaction, and table reads always go to the file, so no cache can go stale. 15 is a small dedicated module, `archivings.ts`, and 17 is `courier.ts` with a send function that is already injected. There are 3 business-rule files, mostly small edits. The one behavioural miss is the 4 s backoff cap: with a 2 s timeout, sendings can start about 6 s apart, more than the 5 s allowed. Its lease window is suspected like the others' (H-p3-1). The SMS probe costs 4 files. Its tests use real SIGKILL and three processes.
