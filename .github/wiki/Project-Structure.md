# Project Structure

The project is organized according to Clean Architecture and DDD principles, with a focus on separation of concerns.

## Directory Structure

```
src/
├── @Primitives/              # Core abstractions and base classes
├── Bootstrap/                # Application setup and configuration
├── Contexts/                 # Bounded contexts (business domains)
│   └── UsersManager/         # Example bounded context
│       ├── Application/      # Application layer (use cases)
│       │   ├── Commands/     # Command handlers
│       │   ├── Events/       # Event handlers
│       │   └── Queries/      # Query handlers
│       ├── Domain/           # Domain layer (business logic)
│       ├── Infrastructure/   # Infrastructure layer
│       └── Presentation/     # Presentation layer (API)
│
└── Shared/                   # Shared components across contexts
    ├── Application/          # Shared application services
    ├── Domain/               # Shared domain concepts
    ├── Infrastructure/       # Shared infrastructure
    └── Presentation/         # Shared presentation components
```

## Key Directories

### @Primitives

Core abstractions and base classes that form the foundation of the application:

- Base classes for events, commands, and handlers
- Result pattern implementation
- Exception handling

### Bootstrap

Application initialization and configuration:

- Server setup (Fastify)
- Module registration
- Dependency injection setup

### Contexts

Each bounded context represents a distinct business domain:

- **Domain Layer**: Entities, value objects, domain events, business rules
- **Application Layer**: Use cases (command and query handlers)
- **Infrastructure Layer**: External dependencies, repositories
- **Presentation Layer**: Controllers, routes, DTOs

### Shared

Components used across multiple bounded contexts:

- Cross-cutting concerns
- Shared domain concepts
- Common infrastructure

## Layer Responsibilities

### Domain Layer

- Contains business entities and value objects
- Defines domain events and business rules
- Declares repository interfaces
- No dependencies on other layers

### Application Layer

- Contains use cases (command and query handlers)
- Orchestrates domain objects to perform business operations
- Depends only on the domain layer

### Infrastructure Layer

- Implements repository interfaces
- Provides external service integrations
- Handles persistence, messaging, etc.
- Depends on domain and application layers

### Presentation Layer

- Handles HTTP requests and responses
- Maps between DTOs and domain objects
- Dispatches commands and queries
- Depends on application layer