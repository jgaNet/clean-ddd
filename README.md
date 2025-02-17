# Clean DDD Project Analysis

## Project Metadata
- Name: clean-ddd
- Type: TypeScript DDD Implementation
- Architecture: Clean Architecture + Domain-Driven Design
- Pattern: CQRS (Command Query Responsibility Segregation)

## Directory Structure

### Core Components
```
src/
├── @Primitives/           # Core domain primitives
├── Contexts/              # Bounded contexts
├── Shared/                # Shared infrastructure
└── application files      # Application entry points
```

### Deployment Configuration
```
deployments/
├── dev/
│   └── docker-compose.yml
├── Dockerfile
└── build.js
```

## Domain Primitives
- Entity.ts
- ValueObject.ts
- CommandHandler.ts
- QueryHandler.ts
- EventBus.ts
- Repository.ts
- Result.ts
- Application.ts
- Module.ts
- Exception.ts

## Bounded Contexts

### UsersManager Context
1. Application Layer:
   ```
   - Commands/
     └── CreateUser/
   - Queries/
     └── GetUsers/
   - Events/
     └── UserCreatedHandler/
   ```

2. Domain Layer:
   ```
   - User/
     ├── Events/
     ├── Ports/
     ├── User.ts
     ├── UserEmail.ts
     ├── UserId.ts
     └── UserProfile.ts
   ```

3. Infrastructure Layer:
   ```
   - Queries/
     ├── InMemoryUserQueries
     └── MockedUserQueries
   - Repositories/
     ├── InMemoryUserRepository
     └── MockedUserRepository
   ```

4. Presentation Layer:
   ```
   - API/REST/
     ├── Controllers/
     └── Routes/
   ```

## Infrastructure Components

### Shared Infrastructure
```
Shared/Infrastructure/
├── DataSources/
│   └── InMemoryDataSource/
├── EventBus/
│   ├── InMemoryEventBus
│   └── KafkaEventBus
└── ExceptionHandler/
    ├── AsyncExceptionHandler
    └── ThrowExceptionHandler
```

## Configuration Files
```
Root/
├── application.config.ts
├── application.swagger.ts
├── tsconfig.json
├── tsconfig.build.json
├── tsconfig.test.json
├── jest.config.js
└── package.json
```

## Key Architectural Patterns

### 1. Domain Layer Patterns
- Entities
- Value Objects
- Domain Events
- Aggregates (User)
- Repositories
- Domain Services

### 2. Application Layer Patterns
- CQRS
  - Commands
  - Queries
  - Event Handlers
- DTOs
- Application Services

### 3. Infrastructure Patterns
- Repository Implementations
- Event Bus Implementations
- Data Source Abstractions
- Exception Handling

### 4. Presentation Patterns
- REST Controllers
- Route Handlers
- API Endpoints

## Dependencies and Integration Points
1. Event Bus:
   - InMemory Implementation
   - Kafka Implementation

2. Data Storage:
   - InMemory Storage
   - Mocked Repositories

3. API Layer:
   - Fastify Framework
   - REST Endpoints

## Testing Structure
- Unit Tests (.spec.ts files)
- Mock Implementations
- Test Configuration (jest.config.js)

## Development Tools
- TypeScript
- Jest
- Docker
- Yarn
- Commitlint
- Lint-staged

## Semantic Relationships
- User -> UserProfile (Aggregate)
- UserEmail -> Value Object
- UserId -> Identity Value Object
- Commands -> Event Generation
- Events -> Event Handlers
- Queries -> Read Operations
- Repository -> Data Access
