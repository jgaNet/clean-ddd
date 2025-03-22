# Event Flow Diagram for Clean DDD Architecture

```mermaid
graph TD
    subgraph "Security Context"
        SC_Commands["Commands:\n- SignUpCommand\n- LoginCommand\n- ValidateAccountCommand\n- RegisterAdminCommand"]
        SC_DomainEvents["Domain Events:\n- AccountCreatedEvent\n- AccountValidatedEvent"]
        SC_EventHandlers["Event Handlers:\n- AccountCreatedHandler\n- AccountValidatedHandler"]
        
        SC_Commands -->|trigger| SC_DomainEvents
        SC_DomainEvents -->|handled by| SC_EventHandlers
    end
    
    subgraph "SharedKernel"
        SK_IntegrationEvents["Integration Events:\n- AccountCreatedIntegrationEvent\n- AccountValidatedIntegrationEvent"]
    end
    
    subgraph "Notifications Context"
        N_IntegrationHandlers["Integration Event Handlers:\n- AccountCreatedIntegrationEventHandler\n- AccountValidatedIntegrationEventHandler"]
        N_Commands["Commands:\n- SendNotificationCommand\n- MarkAsReadNotificationCommand"]
        N_DomainEvents["Domain Events:\n- NotificationSentEvent"]
    end
    
    subgraph "Notes Context"
        NC_Commands["Commands:\n- CreateNoteCommand"]
        NC_DomainEvents["Domain Events:\n- NoteCreatedEvent"]
        NC_EventHandlers["Event Handlers:\n- NoteCreatedHandler"]
        
        NC_Commands -->|trigger| NC_DomainEvents
        NC_DomainEvents -->|handled by| NC_EventHandlers
    end
    
    SC_EventHandlers -->|publish| SK_IntegrationEvents
    SK_IntegrationEvents -->|handled by| N_IntegrationHandlers
    N_IntegrationHandlers -->|trigger| N_Commands
    N_Commands -->|trigger| N_DomainEvents
```

## Event Flow Details

### Account Creation Flow
1. `SignUpCommandEvent` is handled by `SignUpCommandHandler`
2. `SignUpCommandHandler` creates Account entity and publishes `AccountCreatedEvent`
3. `AccountCreatedEvent` is handled by `AccountCreatedHandler`
4. `AccountCreatedHandler` publishes `AccountCreatedIntegrationEvent` to the event bus
5. `AccountCreatedIntegrationEvent` is received by `AccountCreatedIntegrationEventHandler` in Notifications context
6. `AccountCreatedIntegrationEventHandler` publishes `SendNotificationCommandEvent`
7. `SendNotificationCommandHandler` creates a notification and potentially publishes `NotificationSentEvent`

### Account Validation Flow
1. `ValidateAccountCommandEvent` is handled by `ValidateAccountCommandHandler`
2. `ValidateAccountCommandHandler` validates account and publishes `AccountValidatedEvent`
3. `AccountValidatedEvent` is handled by `AccountValidatedHandler`
4. `AccountValidatedHandler` publishes `AccountValidatedIntegrationEvent` to the event bus
5. `AccountValidatedIntegrationEvent` is received by `AccountValidatedIntegrationEventHandler` in Notifications context
6. `AccountValidatedIntegrationEventHandler` publishes `SendNotificationCommandEvent`
7. `SendNotificationCommandHandler` creates a notification

### Note Creation Flow
1. `CreateNoteCommandEvent` is handled by `CreateNoteCommandHandler`
2. `CreateNoteCommandHandler` creates Note entity and publishes `NoteCreatedEvent`
3. `NoteCreatedEvent` is handled by `NoteCreatedHandler`

## Key Implementation Pattern

Events are passed between contexts using the `ExecutionContext` object, which carries:
- Authentication information
- Logging capabilities
- Event bus reference
- Tracing/transaction information

This allows for maintaining context while crossing boundaries between different domains.