# Clean DDD Project Guide for AI Assistance

## Key Commands

```bash
yarn build              # Build project
yarn lint               # Run eslint
yarn format             # Run prettier
yarn test               # Run tests
yarn test:watch         # Run tests in watch mode
yarn test -- -t "test name" # Run specific test
yarn dev                # Start development server
```

## Project Architecture

This is a Clean Architecture & Domain-Driven Design implementation with CQRS pattern.

### Core Structure
- `src/Bootstrap`: Application startup with Fastify configuration
- `src/Contexts`: Bounded contexts (Notes, Tracker, Security)
- `src/Contexts/@SharedKernel/Domain`: Base abstractions (Entity, ValueObject, Application, Module)

### Implementation Pattern

```
Domain Layer → Application Layer → Infrastructure Layer → Presentation Layer
```

## Creating New Features

1. **Define Domain Model** first in `Context/Domain` directory:
   - Entity (with business rules and behavior)
   - Value Objects (with validation)
   - Domain Events (for state changes)
   - Repository Interface (for write operations)
   - Queries Interface (for read operations)

2. **Create Application Layer** in `Context/Application` directory:
   - Command Handlers (write operations)
   - Query Handlers (read operations)
   - Event Handlers (reactions to events)
   - DTOs (for input/output)

3. **Implement Infrastructure** in `Context/Infrastructure` directory:
   - Repository Implementation (for write operations)
   - Queries Implementation (for read operations)
   - External Service Adapters
   - Persistence Logic

4. **Add API Endpoints** in `Context/Presentation` directory:
   - Controller
   - Route Definitions
   - Request/Response Schemas

5. **Register in Module** for wiring everything together:
   - Use ModuleBuilder to register handlers and services

## Code Style

- **Types**: Strict TypeScript typing; avoid `any`/`unknown`
- **Naming**:
  - PascalCase: classes, interfaces, types
  - camelCase: variables, methods, properties
  - Interface prefix: "I" (INoteRepository)
  - Specific suffixes: Handler, Event, Repository, etc.
- **Clean Code**:
  - Remove all unused variables and arguments
  - No commented-out code should be committed
  - Every declared variable or parameter should be used
  - Use TypeScript's `--noUnusedLocals` and `--noUnusedParameters` compiler options
  - Don't create useless constructors that just call super (TypeScript does this implicitly)
  - Only write constructors when adding functionality beyond what the parent class provides
- **Patterns**:
  - Factories for creating entities
  - IResult<T> interface for return types (not the concrete Result<T> implementation)
  - Commands/Queries as simple DTOs
  - Single responsibility per class
- **Imports**:
  - Group by layer (Domain → Application → Infrastructure → Presentation)
  - Use path aliases to simplify imports:
    - `@SharedKernel/Domain` - Core abstractions and base classes
    - `@Contexts` - Bounded contexts
    - `@Bootstrap` - Application startup code
  - Example: `import { Entity } from '@SharedKernel/Domain/DDD/Entity';`
  - Example: `import { Result } from '@SharedKernel/Domain/Application/Result';`
  - NEVER use relative paths (../../) - always use path aliases
  - Bad: `import { Note } from '../../Domain/Note/Note';`
  - Good: `import { Note } from '@Contexts/Notes/Domain/Note/Note';`
- **Commits**: Follow conventional commit format (feat:, fix:, refactor:)

## Testing Approach

- **Domain Layer**: Pure unit tests for business rules
- **Application Layer**: Unit tests with mocked repositories/services
- **Infrastructure**: Integration tests with test doubles
- **API**: End-to-end tests for complete flows

## Example Implementation

### Domain Model

```typescript
// Domain entity with business logic
export class Note extends Entity {
  #title: string;
  #content: string;
  #active: boolean;

  private constructor(id: string, title: string, content: string, active: boolean) {
    super(id);
    this.#title = title;
    this.#content = content;
    this.#active = active;
  }

  static create(noteDto: INoteDTO): ResultValue<Note> {
    if (!noteDto.title) {
      return Result.fail(new InvalidNoteTitleError());
    }
    
    const id = uuidv4();
    return Result.ok(new Note(id, noteDto.title, noteDto.content || '', false));
  }

  activate(): ResultValue<void> {
    if (this.#active) return Result.fail(new NoteAlreadyActiveError());
    this.#active = true;
    return Result.ok();
  }

  get title(): string { return this.#title; }
  get content(): string { return this.#content; }
  get isActive(): boolean { return this.#active; }
}
```

### Command Handler

```typescript
export class CreateNoteCommandHandler extends CommandHandler<CreateNoteCommand> {
  constructor(private noteRepository: INoteRepository) {
    super();
  }

  async execute(command: CreateNoteCommand): Promise<ResultValue<string>> {
    // Create domain entity
    const noteResult = Note.create({
      title: command.payload.title,
      content: command.payload.content
    });
    if (noteResult.isFailure()) return Result.fail(noteResult.error);
    
    const note = noteResult.data;
    
    // Save entity
    await this.noteRepository.save(note);
    
    // Return ID
    return Result.ok(note.id);
  }
}
```

### Module Builder

```typescript
// Building and registering modules
const notesModule = new ModuleBuilder(Symbol('Notes'))
  .setCommand({
    event: CreateNoteCommand,
    handlers: [new CreateNoteCommandHandler(noteRepository)]
  })
  .setQuery(new GetNotesQueryHandler(noteQueries))
  .setDomainEvent({
    event: NoteCreatedEvent,
    handlers: [new NoteCreatedHandler()]
  })
  .build();
```

### Architecture Notes

- Keep domain models isolated from infrastructure
- Command/Query handlers orchestrate operations
- Domain entities contain behavior, not just data
- Use factories for complex entity creation
- Event handlers for cross-context communication
- No circular dependencies between layers
- **IMPORTANT**: Strictly separate query and repository responsibilities:
  - Repositories handle write operations and retrieval by ID (persistence)
  - Queries handle read operations (data retrieval/filtering)
  - This enforces the CQRS pattern and separation of concerns