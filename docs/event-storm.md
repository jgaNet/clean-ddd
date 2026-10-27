# The event storm, read from the code

What an event-storming session would put on the wall for this application — actors, commands, aggregates, domain events, policies, read models, external systems, and the integration events that pivot from one context to the next — read from the TypeScript tree rather than drawn by hand, so that it is true to the code the day it is rendered and every day after ([ADR 20](adr/0020-the-event-storm-is-read-from-the-code.md)). `yarn --cwd typescript conventions:write` regenerates this page and the board; `yarn check:conventions` fails when either differs from what the code renders.

The board, as one picture: [`event-storm.svg`](event-storm.svg).

[![The event storm board](event-storm.svg)](event-storm.svg)

Where each sticky comes from:

| Sticky | Read from |
|---|---|
| actor | the guard of the handler: `requireSignedIn()` is a signed-in account, a `guard()` that admits the administrator role alone is an administrator, nothing is anyone |
| command | the `commands` of the context's wiring file, by public name; its route from the controller method the route binds |
| aggregate · behaviour | the aggregate's method the handler asks, directly or through a service |
| domain event | what that behaviour `record()`s |
| policy | the handlers the wiring subscribes to domain events and integration events, and a publisher that reacts to every operation |
| read model | the `queries` of the wiring, with the type each answers and its route |
| external system | a port under `Ports/` that is neither a repository nor a queries port; named for the context that answers it when the context map says so |
| integration event | published by a policy, consumed by another context's policy: the pivots, the same the context map's links carry |

From a terminal: `yarn --cwd typescript architecture storm` (`storm Notes` for one lane; `--markdown`, `--svg`, `--json`).

<!-- generated from the code (event storm); run yarn conventions:write -->
Read from the TypeScript tree. Colours are the ones a wall would have: actors in pale yellow, commands in blue, aggregates in yellow, domain events in orange, integration events in dark orange, policies in purple, read models in green, external systems in pink.

### The big picture

Each lane is a bounded context and holds its domain events, in the order the commands produce them; a hexagon is an integration event, the pivot from one context to the next, with the policy that publishes it on the way in and the one that consumes it on the way out.

```mermaid
flowchart LR
  subgraph Notes["Notes"]
    direction TB
    e_Notes_NoteCreated["NoteCreated"]:::event
    e_Notes_NoteEdited["NoteEdited"]:::event
    e_Notes_NoteArchived["NoteArchived"]:::event
    e_Notes_NoteRestored["NoteRestored"]:::event
    e_Notes_NoteShared["NoteShared"]:::event
  end
  subgraph Security["Security"]
    direction TB
    e_Security_AccountCreated["AccountCreated"]:::event
    e_Security_AccountAuthenticated["AccountAuthenticated"]:::event
    e_Security_AccountValidated["AccountValidated"]:::event
  end
  subgraph Notifications["Notifications"]
    direction TB
    e_Notifications_NotificationSent["NotificationSent"]:::event
    e_Notifications_NotificationFailed["NotificationFailed"]:::event
    e_Notifications_NotificationRead["NotificationRead"]:::event
  end
  subgraph Tracker["Tracker"]
    direction TB
    e_Tracker_none["(no domain event: a projection)"]:::readmodel
  end
  ie_NoteShared{{"NoteShared"}}:::integration
  e_Notes_NoteShared -- "NoteSharedHandler" --> ie_NoteShared
  ie_NoteShared -- "NoteSharedIntegrationEventHandler" --> e_Notifications_NotificationSent
  ie_NoteShared -- "NoteSharedIntegrationEventHandler" --> e_Notifications_NotificationFailed
  ie_AccountCreated{{"AccountCreated"}}:::integration
  e_Security_AccountCreated -- "AccountCreatedHandler" --> ie_AccountCreated
  ie_AccountCreated -- "AccountCreatedIntegrationEventHandler" --> e_Notifications_NotificationSent
  ie_AccountCreated -- "AccountCreatedIntegrationEventHandler" --> e_Notifications_NotificationFailed
  ie_AccountValidated{{"AccountValidated"}}:::integration
  e_Security_AccountValidated -- "AccountValidatedHandler" --> ie_AccountValidated
  ie_AccountValidated -- "AccountValidatedIntegrationEventHandler" --> e_Notifications_NotificationSent
  ie_AccountValidated -- "AccountValidatedIntegrationEventHandler" --> e_Notifications_NotificationFailed
  ie_OperationComplete{{"OperationComplete"}}:::integration
  e_Tracker_none -- "TrackedEventBus" --> ie_OperationComplete
  ie_OperationComplete -- "OperationCompleteIntegrationEventHandler" --> e_Notifications_NotificationSent
  ie_OperationComplete -- "OperationCompleteIntegrationEventHandler" --> e_Notifications_NotificationFailed
  classDef actor fill:#fff3b0,stroke:#333,color:#111
  classDef command fill:#a9cdfb,stroke:#333,color:#111
  classDef aggregate fill:#ffe066,stroke:#333,color:#111
  classDef event fill:#ffb347,stroke:#333,color:#111
  classDef integration fill:#ff8c42,stroke:#333,color:#111
  classDef policy fill:#d4b3ff,stroke:#333,color:#111
  classDef readmodel fill:#b6f0b6,stroke:#333,color:#111
  classDef external fill:#ffb3d9,stroke:#333,color:#111
```

### Notes

```mermaid
flowchart LR
  a_Notes_a_signed_in_account["a signed-in account"]:::actor
  c_Notes_CreateNote["CreateNote<br/>POST /notes"]:::command
  a_Notes_a_signed_in_account --> c_Notes_CreateNote
  ag_Notes_Note["Note"]:::aggregate
  c_Notes_CreateNote -- "create" --> ag_Notes_Note
  e_Notes_NoteCreated["NoteCreated"]:::event
  ag_Notes_Note --> e_Notes_NoteCreated
  c_Notes_EditNote["EditNote<br/>PUT /notes/:id"]:::command
  a_Notes_a_signed_in_account --> c_Notes_EditNote
  c_Notes_EditNote -- "edit" --> ag_Notes_Note
  e_Notes_NoteEdited["NoteEdited"]:::event
  ag_Notes_Note --> e_Notes_NoteEdited
  c_Notes_ArchiveNote["ArchiveNote<br/>POST /notes/:id/archive"]:::command
  a_Notes_a_signed_in_account --> c_Notes_ArchiveNote
  c_Notes_ArchiveNote -- "archive" --> ag_Notes_Note
  e_Notes_NoteArchived["NoteArchived"]:::event
  ag_Notes_Note --> e_Notes_NoteArchived
  c_Notes_RestoreNote["RestoreNote<br/>POST /notes/:id/restore"]:::command
  a_Notes_a_signed_in_account --> c_Notes_RestoreNote
  c_Notes_RestoreNote -- "restore" --> ag_Notes_Note
  e_Notes_NoteRestored["NoteRestored"]:::event
  ag_Notes_Note --> e_Notes_NoteRestored
  c_Notes_ShareNote["ShareNote<br/>POST /notes/:id/share"]:::command
  a_Notes_a_signed_in_account --> c_Notes_ShareNote
  c_Notes_ShareNote -- "shareWith" --> ag_Notes_Note
  e_Notes_NoteShared["NoteShared"]:::event
  ag_Notes_Note --> e_Notes_NoteShared
  x_Notes_AccountDirectory["AccountDirectory (Security)"]:::external
  c_Notes_ShareNote -.-> x_Notes_AccountDirectory
  c_Notes_SuggestNoteTitle["SuggestNoteTitle<br/>POST /notes/:id/suggest-title"]:::command
  a_Notes_a_signed_in_account --> c_Notes_SuggestNoteTitle
  c_Notes_SuggestNoteTitle -- "edit" --> ag_Notes_Note
  ag_Notes_Note --> e_Notes_NoteEdited
  x_Notes_NoteTitleSuggestions["NoteTitleSuggestions"]:::external
  c_Notes_SuggestNoteTitle -.-> x_Notes_NoteTitleSuggestions
  p_Notes_NoteCreatedHandler["NoteCreatedHandler"]:::policy
  e_Notes_NoteCreated --> p_Notes_NoteCreatedHandler
  p_Notes_NoteSharedHandler["NoteSharedHandler"]:::policy
  e_Notes_NoteShared --> p_Notes_NoteSharedHandler
  ie_NoteShared{{"NoteShared"}}:::integration
  p_Notes_NoteSharedHandler --> ie_NoteShared
  rm_Notes_GetMyNotes["GetMyNotes<br/>NoteListItem[]<br/>GET /notes"]:::readmodel
  a_Notes_a_signed_in_account --> rm_Notes_GetMyNotes
  rm_Notes_GetNote["GetNote<br/>NoteDetail<br/>GET /notes/:id"]:::readmodel
  a_Notes_a_signed_in_account --> rm_Notes_GetNote
  rm_Notes_GetNotesSharedWithMe["GetNotesSharedWithMe<br/>SharedNoteListItem[]<br/>GET /notes/shared"]:::readmodel
  a_Notes_a_signed_in_account --> rm_Notes_GetNotesSharedWithMe
  classDef actor fill:#fff3b0,stroke:#333,color:#111
  classDef command fill:#a9cdfb,stroke:#333,color:#111
  classDef aggregate fill:#ffe066,stroke:#333,color:#111
  classDef event fill:#ffb347,stroke:#333,color:#111
  classDef integration fill:#ff8c42,stroke:#333,color:#111
  classDef policy fill:#d4b3ff,stroke:#333,color:#111
  classDef readmodel fill:#b6f0b6,stroke:#333,color:#111
  classDef external fill:#ffb3d9,stroke:#333,color:#111
```

| Actor | Command | Route | Aggregate · behaviour | Events | Needs |
| --- | --- | --- | --- | --- | --- |
| a signed-in account | `CreateNote` | `POST /notes` | `Note.create` | `NoteCreated` | — |
| a signed-in account | `EditNote` | `PUT /notes/:id` | `Note.edit` | `NoteEdited` | — |
| a signed-in account | `ArchiveNote` | `POST /notes/:id/archive` | `Note.archive` | `NoteArchived` | — |
| a signed-in account | `RestoreNote` | `POST /notes/:id/restore` | `Note.restore` | `NoteRestored` | — |
| a signed-in account | `ShareNote` | `POST /notes/:id/share` | `Note.shareWith` | `NoteShared` | `AccountDirectory (Security)`, `NoteSharing.share` |
| a signed-in account | `SuggestNoteTitle` | `POST /notes/:id/suggest-title` | `Note.edit` | `NoteEdited` | `NoteTitleSuggestions` |

| On | Policy | Does |
| --- | --- | --- |
| `NoteCreated` | `NoteCreatedHandler` | logs |
| `NoteShared` | `NoteSharedHandler` | publishes `NoteShared` |

| Actor | Query | Route | Read model |
| --- | --- | --- | --- |
| a signed-in account | `GetMyNotes` | `GET /notes` | `NoteListItem[]` |
| a signed-in account | `GetNote` | `GET /notes/:id` | `NoteDetail` |
| a signed-in account | `GetNotesSharedWithMe` | `GET /notes/shared` | `SharedNoteListItem[]` |

| External system | Port | Answered by | Adapters |
| --- | --- | --- | --- |
| NoteTitleSuggestions | `INoteTitleSuggestions` | an adapter of this context | `FirstLineTitleSuggestions` |
| AccountDirectory | `IAccountDirectory` | Security | `SecurityAccountDirectory` |

Recorded and handled by nobody yet (the Tracker still records them): `NoteEdited`, `NoteArchived`, `NoteRestored`.

### Security

```mermaid
flowchart LR
  a_Security_anyone["anyone"]:::actor
  c_Security_SignUp["SignUp<br/>POST /auth/signup"]:::command
  a_Security_anyone --> c_Security_SignUp
  ag_Security_Account["Account"]:::aggregate
  c_Security_SignUp -- "register" --> ag_Security_Account
  e_Security_AccountCreated["AccountCreated"]:::event
  ag_Security_Account --> e_Security_AccountCreated
  x_Security_PasswordHasher["PasswordHasher"]:::external
  c_Security_SignUp -.-> x_Security_PasswordHasher
  c_Security_Login["Login<br/>POST /auth/login"]:::command
  a_Security_anyone --> c_Security_Login
  c_Security_Login -- "authenticate" --> ag_Security_Account
  e_Security_AccountAuthenticated["AccountAuthenticated"]:::event
  ag_Security_Account --> e_Security_AccountAuthenticated
  c_Security_Login -.-> x_Security_PasswordHasher
  x_Security_SignedTokens["SignedTokens"]:::external
  c_Security_Login -.-> x_Security_SignedTokens
  c_Security_ValidateAccount["ValidateAccount<br/>GET /auth/validate"]:::command
  a_Security_anyone --> c_Security_ValidateAccount
  c_Security_ValidateAccount -- "validate" --> ag_Security_Account
  e_Security_AccountValidated["AccountValidated"]:::event
  ag_Security_Account --> e_Security_AccountValidated
  c_Security_ValidateAccount -.-> x_Security_SignedTokens
  p_Security_AccountCreatedHandler["AccountCreatedHandler"]:::policy
  e_Security_AccountCreated --> p_Security_AccountCreatedHandler
  ie_AccountCreated{{"AccountCreated"}}:::integration
  p_Security_AccountCreatedHandler --> ie_AccountCreated
  p_Security_AccountCreatedHandler -.-> x_Security_SignedTokens
  p_Security_AccountValidatedHandler["AccountValidatedHandler"]:::policy
  e_Security_AccountValidated --> p_Security_AccountValidatedHandler
  ie_AccountValidated{{"AccountValidated"}}:::integration
  p_Security_AccountValidatedHandler --> ie_AccountValidated
  a_Security_a_signed_in_account["a signed-in account"]:::actor
  rm_Security_GetAccount["GetAccount<br/>AccountDetail<br/>GET /auth/me"]:::readmodel
  a_Security_a_signed_in_account --> rm_Security_GetAccount
  classDef actor fill:#fff3b0,stroke:#333,color:#111
  classDef command fill:#a9cdfb,stroke:#333,color:#111
  classDef aggregate fill:#ffe066,stroke:#333,color:#111
  classDef event fill:#ffb347,stroke:#333,color:#111
  classDef integration fill:#ff8c42,stroke:#333,color:#111
  classDef policy fill:#d4b3ff,stroke:#333,color:#111
  classDef readmodel fill:#b6f0b6,stroke:#333,color:#111
  classDef external fill:#ffb3d9,stroke:#333,color:#111
```

| Actor | Command | Route | Aggregate · behaviour | Events | Needs |
| --- | --- | --- | --- | --- | --- |
| anyone | `SignUp` | `POST /auth/signup` | `Account.register` | `AccountCreated` | `PasswordHasher`, `AccountRegistration.register` |
| anyone | `Login` | `POST /auth/login` | `Account.authenticate` | `AccountAuthenticated` | `PasswordHasher`, `SignedTokens` |
| anyone | `ValidateAccount` | `GET /auth/validate` | `Account.validate` | `AccountValidated` | `SignedTokens` |

| On | Policy | Does |
| --- | --- | --- |
| `AccountCreated` | `AccountCreatedHandler` | publishes `AccountCreated`, needs `SignedTokens` |
| `AccountValidated` | `AccountValidatedHandler` | publishes `AccountValidated` |

| Actor | Query | Route | Read model |
| --- | --- | --- | --- |
| a signed-in account | `GetAccount` | `GET /auth/me` | `AccountDetail` |

| External system | Port | Answered by | Adapters |
| --- | --- | --- | --- |
| PasswordHasher | `IPasswordHasher` | an adapter of this context | `BcryptPasswordHasher` |
| SignedTokens | `ISignedTokens` | an adapter of this context | `JoseSignedTokens` |

Recorded and handled by nobody yet (the Tracker still records them): `AccountAuthenticated`.

### Notifications

```mermaid
flowchart LR
  a_Notifications_an_administrator["an administrator"]:::actor
  c_Notifications_SendNotification["SendNotification<br/>POST /notifications"]:::command
  a_Notifications_an_administrator --> c_Notifications_SendNotification
  ag_Notifications_Notification["Notification"]:::aggregate
  c_Notifications_SendNotification -- "recordAttempt" --> ag_Notifications_Notification
  e_Notifications_NotificationSent["NotificationSent"]:::event
  ag_Notifications_Notification --> e_Notifications_NotificationSent
  e_Notifications_NotificationFailed["NotificationFailed"]:::event
  ag_Notifications_Notification --> e_Notifications_NotificationFailed
  x_Notifications_NotificationChannel["NotificationChannel"]:::external
  c_Notifications_SendNotification -.-> x_Notifications_NotificationChannel
  a_Notifications_a_signed_in_account["a signed-in account"]:::actor
  c_Notifications_MarkAsReadNotification["MarkAsReadNotification<br/>PATCH /notifications/:id/read"]:::command
  a_Notifications_a_signed_in_account --> c_Notifications_MarkAsReadNotification
  c_Notifications_MarkAsReadNotification -- "markRead" --> ag_Notifications_Notification
  e_Notifications_NotificationRead["NotificationRead"]:::event
  ag_Notifications_Notification --> e_Notifications_NotificationRead
  ie_AccountCreated{{"AccountCreated"}}:::integration
  p_Notifications_AccountCreatedIntegrationEventHandler["AccountCreatedIntegrationEventHandler"]:::policy
  ie_AccountCreated --> p_Notifications_AccountCreatedIntegrationEventHandler
  p_Notifications_AccountCreatedIntegrationEventHandler -- "recordAttempt" --> ag_Notifications_Notification
  ag_Notifications_Notification --> e_Notifications_NotificationSent
  ag_Notifications_Notification --> e_Notifications_NotificationFailed
  p_Notifications_AccountCreatedIntegrationEventHandler -.-> x_Notifications_NotificationChannel
  ie_AccountValidated{{"AccountValidated"}}:::integration
  p_Notifications_AccountValidatedIntegrationEventHandler["AccountValidatedIntegrationEventHandler"]:::policy
  ie_AccountValidated --> p_Notifications_AccountValidatedIntegrationEventHandler
  p_Notifications_AccountValidatedIntegrationEventHandler -- "recordAttempt" --> ag_Notifications_Notification
  ag_Notifications_Notification --> e_Notifications_NotificationSent
  ag_Notifications_Notification --> e_Notifications_NotificationFailed
  p_Notifications_AccountValidatedIntegrationEventHandler -.-> x_Notifications_NotificationChannel
  ie_OperationComplete{{"OperationComplete"}}:::integration
  p_Notifications_OperationCompleteIntegrationEventHandler["OperationCompleteIntegrationEventHandler"]:::policy
  ie_OperationComplete --> p_Notifications_OperationCompleteIntegrationEventHandler
  p_Notifications_OperationCompleteIntegrationEventHandler -- "recordAttempt" --> ag_Notifications_Notification
  ag_Notifications_Notification --> e_Notifications_NotificationSent
  ag_Notifications_Notification --> e_Notifications_NotificationFailed
  p_Notifications_OperationCompleteIntegrationEventHandler -.-> x_Notifications_NotificationChannel
  ie_NoteShared{{"NoteShared"}}:::integration
  p_Notifications_NoteSharedIntegrationEventHandler["NoteSharedIntegrationEventHandler"]:::policy
  ie_NoteShared --> p_Notifications_NoteSharedIntegrationEventHandler
  p_Notifications_NoteSharedIntegrationEventHandler -- "recordAttempt" --> ag_Notifications_Notification
  ag_Notifications_Notification --> e_Notifications_NotificationSent
  ag_Notifications_Notification --> e_Notifications_NotificationFailed
  p_Notifications_NoteSharedIntegrationEventHandler -.-> x_Notifications_NotificationChannel
  rm_Notifications_GetNotifications["GetNotifications<br/>Inbox<br/>GET /notifications/account/:recipientId"]:::readmodel
  a_Notifications_a_signed_in_account --> rm_Notifications_GetNotifications
  classDef actor fill:#fff3b0,stroke:#333,color:#111
  classDef command fill:#a9cdfb,stroke:#333,color:#111
  classDef aggregate fill:#ffe066,stroke:#333,color:#111
  classDef event fill:#ffb347,stroke:#333,color:#111
  classDef integration fill:#ff8c42,stroke:#333,color:#111
  classDef policy fill:#d4b3ff,stroke:#333,color:#111
  classDef readmodel fill:#b6f0b6,stroke:#333,color:#111
  classDef external fill:#ffb3d9,stroke:#333,color:#111
```

| Actor | Command | Route | Aggregate · behaviour | Events | Needs |
| --- | --- | --- | --- | --- | --- |
| an administrator | `SendNotification` | `POST /notifications` | `Notification.recordAttempt` | `NotificationSent`, `NotificationFailed` | `NotificationChannel`, `NotificationDelivery.deliver` |
| a signed-in account | `MarkAsReadNotification` | `PATCH /notifications/:id/read` | `Notification.markRead` | `NotificationRead` | — |

| On | Policy | Does |
| --- | --- | --- |
| `AccountCreated` (integration event) | `AccountCreatedIntegrationEventHandler` | asks `Notification.recordAttempt`, → `NotificationSent`, → `NotificationFailed`, needs `NotificationChannel` |
| `AccountValidated` (integration event) | `AccountValidatedIntegrationEventHandler` | asks `Notification.recordAttempt`, → `NotificationSent`, → `NotificationFailed`, needs `NotificationChannel` |
| `OperationComplete` (integration event) | `OperationCompleteIntegrationEventHandler` | asks `Notification.recordAttempt`, → `NotificationSent`, → `NotificationFailed`, needs `NotificationChannel` |
| `NoteShared` (integration event) | `NoteSharedIntegrationEventHandler` | asks `Notification.recordAttempt`, → `NotificationSent`, → `NotificationFailed`, needs `NotificationChannel` |

| Actor | Query | Route | Read model |
| --- | --- | --- | --- |
| a signed-in account | `GetNotifications` | `GET /notifications/account/:recipientId` | `Inbox` |

| External system | Port | Answered by | Adapters |
| --- | --- | --- | --- |
| NotificationChannel | `INotificationChannel` | an adapter of this context | `EmailChannel`, `WebSocketChannel` |
| nboxFilters | `InboxFilters` | an adapter of this context | — |

Recorded and handled by nobody yet (the Tracker still records them): `NotificationSent`, `NotificationFailed`, `NotificationRead`.

### Tracker

```mermaid
flowchart LR
  op_Tracker["every operation"]:::event
  p_Tracker_TrackedEventBus["TrackedEventBus"]:::policy
  op_Tracker --> p_Tracker_TrackedEventBus
  ie_OperationComplete{{"OperationComplete"}}:::integration
  p_Tracker_TrackedEventBus --> ie_OperationComplete
  a_Tracker_an_administrator["an administrator"]:::actor
  rm_Tracker_GetOperations["GetOperations<br/>OperationRecord[]<br/>GET /tracker/operations"]:::readmodel
  a_Tracker_an_administrator --> rm_Tracker_GetOperations
  a_Tracker_a_signed_in_account["a signed-in account"]:::actor
  rm_Tracker_GetOperation["GetOperation<br/>OperationRecord<br/>GET /tracker/operations/:id"]:::readmodel
  a_Tracker_a_signed_in_account --> rm_Tracker_GetOperation
  classDef actor fill:#fff3b0,stroke:#333,color:#111
  classDef command fill:#a9cdfb,stroke:#333,color:#111
  classDef aggregate fill:#ffe066,stroke:#333,color:#111
  classDef event fill:#ffb347,stroke:#333,color:#111
  classDef integration fill:#ff8c42,stroke:#333,color:#111
  classDef policy fill:#d4b3ff,stroke:#333,color:#111
  classDef readmodel fill:#b6f0b6,stroke:#333,color:#111
  classDef external fill:#ffb3d9,stroke:#333,color:#111
```

| On | Policy | Does |
| --- | --- | --- |
| every operation | `TrackedEventBus` | publishes `OperationComplete` |

| Actor | Query | Route | Read model |
| --- | --- | --- | --- |
| an administrator | `GetOperations` | `GET /tracker/operations` | `OperationRecord[]` |
| a signed-in account | `GetOperation` | `GET /tracker/operations/:id` | `OperationRecord` |
<!-- end generated -->
