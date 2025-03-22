# Bounded Context Relationship Diagram

```mermaid
graph TD
    %% Class definitions
    classDef contextClass fill:#f9f9f9,stroke:#333,stroke-width:2px
    classDef kernelClass fill:#e9e9e9,stroke:#333,stroke-dasharray:5
    classDef conformistClass stroke:#773,stroke-width:3px
    classDef upstreamClass stroke:#377,stroke-width:3px
    
    %% Bounded Contexts
    Security["Security Context<br>(Account, Authentication)"]
    Notes["Notes Context<br>(Note Creation/Management)"]
    Notifications["Notifications Context<br>(User Notifications)"]
    Tracker["Tracker Context<br>(Operation Tracking)"]
    SharedKernel["Shared Kernel<br>(Common Abstractions, Integration Events)"]
    
    %% Apply styles
    class Security contextClass,upstreamClass
    class Notes contextClass
    class Notifications contextClass,conformistClass
    class Tracker contextClass
    class SharedKernel kernelClass
    
    %% Relationships with payload information
    Security -->|"AccountCreatedIntegrationEvent<br>{accountId, email, validationToken}"| Notifications
    Security -->|"AccountValidatedIntegrationEvent<br>{accountId, email}"| Notifications
    
    %% Shared Kernel Relationships
    SharedKernel -.->|"provides base classes"| Security
    SharedKernel -.->|"provides base classes"| Notes
    SharedKernel -.->|"provides base classes"| Notifications
    SharedKernel -.->|"provides base classes"| Tracker
    
    %% Tracker tracking events
    Security -.->|"tracks operations"| Tracker
    Notes -.->|"tracks operations"| Tracker
    Notifications -.->|"tracks operations"| Tracker
    
    %% Descriptions
    Security_Desc["• Manages user accounts<br>• Handles authentication<br>• Publishes account events"]
    Notes_Desc["• Creates and manages notes<br>• Publishes note-related events"]
    Notifications_Desc["• Sends user notifications<br>• Reacts to events from other contexts<br>• Self-contained (no queries to other contexts)"]
    Tracker_Desc["• Tracks long-running operations<br>• Provides operation status"]
    SharedKernel_Desc["• Provides common abstractions (Entity, ValueObject)<br>• Defines integration events<br>• Manages cross-context communication"]
    
    %% Connect descriptions
    Security --- Security_Desc
    Notes --- Notes_Desc
    Notifications --- Notifications_Desc
    Tracker --- Tracker_Desc
    SharedKernel --- SharedKernel_Desc

    %% Legend
    subgraph Legend
        L1["→ Integration Event Flow"]
        L2["-.-> Base Class Usage"]
        L3["Blue Border: Upstream Context"]
        L4["Orange Border: Conformist Context"]
    end
```

## Bounded Context Relationships

### Shared Kernel
The Shared Kernel provides common abstractions and cross-cutting concerns to all contexts:
- Base classes (Entity, ValueObject, Repository, etc.)
- Integration event definitions
- Common utilities

### Security → Notifications (Upstream-Downstream)
- Security is the upstream context that publishes events
- Notifications is the downstream context that conforms to the events published by Security
- Complete payload is included in integration events, eliminating the need for cross-context queries:
  - Account Created: `{accountId, email, validationToken}`
  - Account Validated: `{accountId, email}`

### Notes → Notifications
- No direct integration events, but could potentially publish events that Notifications would handle

### All Contexts → Tracker
- All contexts can potentially track long-running operations through the Tracker context
- Operations from any context can be monitored and queried through the Tracker

## Context Responsibilities

### Security Context (Upstream)
- User account management (creation, validation)
- Authentication and authorization
- Role-based access control
- Publishes integration events with complete payload

### Notes Context
- Note creation and management
- Note queries and business rules

### Notifications Context (Conformist)
- Notification creation and delivery
- Reacts to events from other contexts
- Completely self-contained after receiving integration events
- No queries to other contexts
- Manages notification status (read/unread)

### Tracker Context
- Tracks status of long-running operations
- Provides query access to operation history

## Communication Patterns

1. **Integration Events**: Primary method for contexts to communicate
2. **Complete Event Payload**: All necessary data included in the event
3. **Bounded Context Independence**: Each context can function independently after receiving events
4. **Shared Abstractions**: Common types and interfaces defined in Shared Kernel
5. **Event Bus**: Infrastructure component that routes events between contexts