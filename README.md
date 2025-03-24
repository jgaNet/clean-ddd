# Clean DDD Framework

A TypeScript implementation of Clean Architecture with Domain-Driven Design following CQRS pattern.

## Core Principles

- **Domain-Driven Design**: Rich domain model focused on business rules
- **Clean Architecture**: Layered architecture with explicit dependency rules
- **CQRS**: Command/query separation for better scalability
- **Event-Driven**: Contexts communicate through domain events

## Project Structure

```
src/
├── Bootstrap/          # Application startup and configuration
├── Contexts/           # Bounded contexts (business domains)
│   ├── @SharedKernel/  # Core abstractions (Entity, ValueObject, Module, etc.)
│   ├── Tracker/        # Operation tracking context
│   ├── Security/       # Authentication and authorization context
│   ├── Notifications/  # Notification management context
│   └── Notes/          # Note management context
```

## Bounded Context Relationships and Event Flow

The following diagram illustrates how the various bounded contexts interact and how events flow through the system:

```mermaid
graph TD
    %% Bounded Contexts with internal event flows
    subgraph SecurityCtx["<b style='font-size:18px;color:#0066cc'>🔵 Security Context</b>"]
        SC[/"Commands:<br>- SignUpCommand<br>- LoginCommand<br>- ValidateAccountCommand"/] --> SE[/"Domain Events:<br>- AccountCreatedEvent<br>- AccountValidatedEvent"/]
        SE --> SIE[/"Integration Events:<br>- AccountCreatedIntegrationEvent<br>- AccountValidatedIntegrationEvent"/]
        
        style SC fill:#e6f7ff,stroke:#0066cc,stroke-width:1px
        style SE fill:#e6f7ff,stroke:#0066cc,stroke-width:1px
        style SIE fill:#e6f7ff,stroke:#0066cc,stroke-width:1px
    end
    
    subgraph NotesCtx["<b style='font-size:18px;color:#006600'>Notes Context</b>"]
        NOTC[/"Commands:<br>- CreateNoteCommand"/] --> NOTE[/"Domain Events:<br>- NoteCreatedEvent"/]
        
        style NOTC fill:#e6ffe6,stroke:#006600,stroke-width:1px
        style NOTE fill:#e6ffe6,stroke:#006600,stroke-width:1px
    end
    
    subgraph NotificationsCtx["<b style='font-size:18px;color:#cc6600'>🟠 Notifications Context</b>"]
        NIE[/"Integration Events Handled:<br>- AccountCreatedIntegrationEvent<br>- AccountValidatedIntegrationEvent"/] --> NC[/"Commands:<br>- SendNotificationCommand<br>- MarkAsReadNotificationCommand"/] --> NE[/"Domain Events:<br>- NotificationSentEvent"/]
        
        style NIE fill:#fff2e6,stroke:#cc6600,stroke-width:1px
        style NC fill:#fff2e6,stroke:#cc6600,stroke-width:1px
        style NE fill:#fff2e6,stroke:#cc6600,stroke-width:1px
    end
    
    subgraph TrackerCtx["<b style='font-size:18px;color:#333333'>Tracker Context</b>"]
        TC[/"Queries:<br>- GetOperationQuery<br>- GetOperationsQuery"/]
        
        style TC fill:#f9f9f9,stroke:#333333,stroke-width:1px
    end
    
    %% Shared Kernel
    SharedKernel["<b style='font-size:18px;color:#555555'>Shared Kernel</b><br>(Base Abstractions, Integration Events)"]
    style SharedKernel fill:#f0f0f0,stroke:#555,stroke-width:1px,stroke-dasharray:5
    
    %% Context styling
    style SecurityCtx fill:#f0f8ff,stroke:#0066cc,stroke-width:2px
    style NotesCtx fill:#f9f9f9,stroke:#006600,stroke-width:2px
    style NotificationsCtx fill:#fff8f0,stroke:#cc6600,stroke-width:2px
    style TrackerCtx fill:#f9f9f9,stroke:#333333,stroke-width:2px
    
    %% Cross-context event flow
    SIE -->|"complete payload"| NIE
    
    %% Shared kernel relationships
    SharedKernel -.->|"provides base abstractions"| SecurityCtx
    SharedKernel -.->|"provides base abstractions"| NotesCtx
    SharedKernel -.->|"provides base abstractions"| NotificationsCtx
    SharedKernel -.->|"provides base abstractions"| TrackerCtx
    
    %% Tracker relationships
    SecurityCtx -.->|"tracks operations"| TrackerCtx
    NotesCtx -.->|"tracks operations"| TrackerCtx
    NotificationsCtx -.->|"tracks operations"| TrackerCtx
    
    %% Compact Legend
    LegendTitle["Legend:"]
    LegendTitle --- LegendFlow["→ Event Flow | -.-> Context Relationship | 🔵 Upstream | 🟠 Conformist"]
    style LegendFlow font-size:10px
```

### Key Event Flows

- **Command → Domain Event → Integration Event**: Events flow from user commands through domain events to integration events
- **Security → Notifications**: Security context publishes integration events with complete payloads that Notifications context consumes
- **Shared Kernel → All Contexts**: Provides base abstractions and shared utilities
- **All Contexts → Tracker**: Operations from any context can be tracked and monitored

## Building Blocks

### Application Class

```typescript
// Example usage of Application primitive
class MyCleanApp extends Application {
  constructor() {
    super();
    this.setEventBus(new InMemoryEventEmitter())
      .registerModule(notesModule)
      .registerModule(trackerModule);
  }

  async start() {
    // Start HTTP server, message consumers, etc.
    const server = new FastifyServer();
    await server.listen(3000);
  }
}

// Start the application
const app = new MyCleanApp();
app.run();
```

### Module System

```typescript
// Defining a module with ModuleBuilder
const notesModule = new ModuleBuilder(Symbol('Notes'))
  .setCommand({
    event: CreateNoteCommand,
    handlers: [new CreateNoteCommandHandler({
      noteRepository,
      eventBus
    })]
  })
  .setQuery(new GetNotesQueryHandler({
    noteQueries
  }))
  .setDomainEvent({
    event: NoteCreatedEvent,
    handlers: [new NoteCreatedHandler()]
  })
  .build();

// Using the module
const createNoteCmd = new CreateNoteCommand({
  title: "My first note",
  content: "This is the content of my note"
});

// Execute command
const result = await notesModule.getCommand(CreateNoteCommand).execute(createNoteCmd);
```

### Domain Model

```typescript
// Entity example
export class Note extends Entity {
  #title: string;
  #content: string;

  private constructor(id: string, title: string, content: string) {
    super(id);
    this.#title = title;
    this.#content = content;
  }

  static create(noteDto: INote): IResult<Note> {
    // Domain validation rules
    if (!noteDto.title) {
      return Result.fail(new InvalidNoteTitleError());
    }
    
    return Result.ok(new Note(
      noteDto._id,
      noteDto.title,
      noteDto.content || ''
    ));
  }

  get title(): string {
    return this.#title;
  }
  
  get content(): string {
    return this.#content;
  }
}

// Value Object example
export class Email extends ValueObject<string> {
  private constructor(email: string) {
    super(email);
  }

  static create(email: string): IResult<Email> {
    if (!email.includes('@')) {
      return Result.fail(new InvalidEmailError(email));
    }
    return Result.ok(new Email(email));
  }

  get username(): string {
    return this.value.split('@')[0];
  }
}
```

### Command Handlers

```typescript
export class CreateNoteCommandHandler extends CommandHandler<CreateNoteCommandEvent> {
  #noteRepository: INoteRepository;

  constructor({ noteRepository }) {
    super();
    this.#noteRepository = noteRepository;
  }

  async execute({ payload }: CreateNoteCommandEvent): Promise<IResult<INote>> {
    // Create the note
    const noteResult = Note.create({
      _id: await this.#noteRepository.nextIdentity(),
      title: payload.title,
      content: payload.content
    });
    
    if (noteResult.isFailure()) return noteResult;

    // Save the note
    const note = noteResult.data;
    await this.#noteRepository.save(note);

    // Return DTO
    return Result.ok(NoteMapper.toDTO(note));
  }
}
```

### Query Handlers

```typescript
export class GetNotesQueryHandler extends QueryHandler<INoteQueries, void, IResult<INote[]>> {
  #noteQueries: INoteQueries;

  constructor({ noteQueries }: { noteQueries: INoteQueries }) {
    super();
    this.#noteQueries = noteQueries;
  }

  async execute(): Promise<ResultValue<INote[]>> {
    try {
      const notes = await this.#noteQueries.getAll();
      return Result.ok(notes);
    } catch (e) {
      return Result.fail(e);
    }
  }
}
```

## Quick Start

```bash
# Install dependencies
yarn install

# Start development server
yarn dev

# Run tests
yarn test

# Build for production
yarn build
```

## Development Commands

```
# Linting and formatting
yarn lint
yarn format


# Testing
yarn test
```

## License

MIT
