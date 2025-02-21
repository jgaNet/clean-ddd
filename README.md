# Clean DDD Framework

## 🚀 Overview

Welcome to the **Clean DDD Framework**, an architecture-driven project that leverages **Domain-Driven Design (DDD)** and **Clean Architecture** principles for building scalable, maintainable applications. This project follows a modular, event-driven, and CQRS (Command Query Responsibility Segregation) structure.

## 🏗️ Architecture & Design Principles

### 🔍 Key Concepts

- **Domain-Driven Design (DDD):** Core business logic is isolated from infrastructure code.
- **Clean Architecture:** Dependency inversion with clear separation of concerns.
- **CQRS:** Commands and Queries are segregated for scalability and clear logic separation.
- **Event-Driven:** Modules communicate through events, supporting scalability and decoupled services.

### 📖 Understanding DDD Architecture

**Domain-Driven Design (DDD)** is a methodology that structures software around the domain (i.e., the problem space). In a DDD architecture, there are four main layers:

1. **Domain Layer** (Core Business Logic):
   - Contains entities, value objects, domain events, and aggregates.
   - Example:
     ```typescript
     export class User {
       constructor(public readonly id: string, public readonly email: string, public readonly nickname: string) {}
     }
     ```

2. **Application Layer** (Use Cases & Interactions):
   - Defines commands, queries, and event handlers.
   - Example:
     ```typescript
     import { CommandHandler } from '@Primitives/CommandHandler';
     import { CreateUserCommandEvent } from '@Contexts/UsersManager/Application/Commands/CreateUser';

     export class CreateUserCommandHandler extends CommandHandler<CreateUserCommandEvent> {
       async execute(command: CreateUserCommandEvent) {
         const { id, email, nickname } = command.payload;
         const user = new User(id, email, nickname);
         await this.userRepository.save(user);
         const event = new UserCreatedEvent({
           id: user.id,
           email: user.email,
           nickname: user.nickname
         });
         await this.eventBus.dispatch(UserCreatedEvent, event.payload);
         return Result.ok(user);
       }
     }
     ```

3. **Infrastructure Layer** (Persistence & External Dependencies):
   - Manages database operations, messaging systems, and third-party integrations.
   - Example:
     ```typescript
     import { InMemoryDataSource } from '@Shared/Infrastructure/DataSources/InMemoryDataSource';

     export class InMemoryUserRepository {
       private dataSource = new InMemoryDataSource();

       async save(user) {
         this.dataSource.collection.set(user.id, user);
       }
     }
     ```

4. **Presentation Layer** (API / UI Layer):
   - Handles HTTP requests and exposes the API for user interaction.
   - Example:
     ```typescript
     import { FastifyInstance } from 'fastify';

     export const userRoutes = (fastify: FastifyInstance) => {
       fastify.post('/users', async (req, reply) => {
         const { email, nickname } = req.body;
         // Business logic call
         reply.send({ success: true });
       });
     };
     ```

### ✅ Create User Command with Test Specification

**UserCreatedEvent:**
```typescript
import { Event } from '@Primitives/Event';

export class UserCreatedEvent extends Event<{ id: string; email: string; nickname: string }> {
  constructor(payload: { id: string; email: string; nickname: string }) {
    super(payload);
  }
}
```

**UserCreatedEventHandler:**
```typescript
import { EventHandler } from '@Primitives/EventHandler';
import { UserCreatedEvent } from './UserCreatedEvent';
import { Result } from '@Primitives/Result';

export class UserCreatedEventHandler extends EventHandler<UserCreatedEvent> {
  async execute(event: UserCreatedEvent): Promise<Result> {
    console.log(`New user created: ${event.payload.email}`);
    // Additional side-effects can be implemented here, e.g., sending a welcome email
    return Result.ok();
  }
}
```

**Test Specification (Jest):**
```typescript
import { UserCreatedEvent } from '@Contexts/UsersManager/Application/Events/UserCreatedEvent';
import { UserCreatedEventHandler } from '@Contexts/UsersManager/Application/Events/UserCreatedEventHandler';

describe('UserCreatedEventHandler', () => {
  let handler: UserCreatedEventHandler;

  beforeEach(() => {
    handler = new UserCreatedEventHandler();
  });

  it('should handle the user created event', async () => {
    const event = new UserCreatedEvent({
      id: '1',
      email: 'test@example.com',
      nickname: 'tester'
    });

    const result = await handler.execute(event);
    expect(result.isSuccess()).toBe(true);
  });
});
```

**GetUsersQueryHandler:**
```typescript
import { QueryHandler } from '@Primitives/QueryHandler';
import { InMemoryUserRepository } from '@Contexts/UsersManager/Infrastructure/Repositories/InMemoryUserRepository';
import { Result } from '@Primitives/Result';

export class GetUsersQueryHandler extends QueryHandler<void, Result> {
  constructor(private userRepository: InMemoryUserRepository) {
    super();
  }

  async execute(): Promise<Result> {
    const users = Array.from(this.userRepository.collection.values());
    return Result.ok(users);
  }
}
```


**GetUsersQueryHandler:**
```typescript
import { QueryHandler } from '@Primitives/QueryHandler';
import { InMemoryUserRepository } from '@Contexts/UsersManager/Infrastructure/Repositories/InMemoryUserRepository';
import { Result } from '@Primitives/Result';

export class GetUsersQueryHandler extends QueryHandler<void, Result> {
  constructor(private userRepository: InMemoryUserRepository) {
    super();
  }

  async execute(): Promise<Result> {
    const users = Array.from(this.userRepository.collection.values());
    return Result.ok(users);
  }
}
```

**Test Specification (Jest):**
```typescript
import { GetUsersQueryHandler } from '@Contexts/UsersManager/Application/Queries/GetUsersQueryHandler';
import { InMemoryUserRepository } from '@Contexts/UsersManager/Infrastructure/Repositories/InMemoryUserRepository';
import { CreateUserCommandHandler } from '@Contexts/UsersManager/Application/Commands/CreateUser/CreateUserCommandHandler';
import { CreateUserCommandEvent } from '@Contexts/UsersManager/Application/Commands/CreateUser';

describe('GetUsersQueryHandler', () => {
  let repository: InMemoryUserRepository;
  let createUserHandler: CreateUserCommandHandler;
  let getUsersQueryHandler: GetUsersQueryHandler;

  beforeEach(() => {
    repository = new InMemoryUserRepository();
    createUserHandler = new CreateUserCommandHandler(repository);
    getUsersQueryHandler = new GetUsersQueryHandler(repository);
  });

  it('should return an empty list if no users exist', async () => {
    const result = await getUsersQueryHandler.execute();
    expect(result.isSuccess()).toBe(true);
    expect(result.data).toEqual([]);
  });

  it('should return a list of users', async () => {
    await createUserHandler.execute(
      new CreateUserCommandEvent({
        id: '1',
        email: 'user1@example.com',
        nickname: 'user1'
      })
    );

    await createUserHandler.execute(
      new CreateUserCommandEvent({
        id: '2',
        email: 'user2@example.com',
        nickname: 'user2'
      })
    );

    const result = await getUsersQueryHandler.execute();
    expect(result.isSuccess()).toBe(true);
    expect(result.data.length).toBe(2);
    expect(result.data).toEqual([
      {
        id: '1',
        email: 'user1@example.com',
        nickname: 'user1'
      },
      {
        id: '2',
        email: 'user2@example.com',
        nickname: 'user2'
      }
    ]);
  });
});
```


**CreateUserCommandHandler:**
```typescript
import { CommandHandler } from '@Primitives/CommandHandler';
import { CreateUserCommandEvent } from '@Contexts/UsersManager/Application/Commands/CreateUser';
import { User } from '@Contexts/UsersManager/Domain/User/User';
import { InMemoryUserRepository } from '@Contexts/UsersManager/Infrastructure/Repositories/InMemoryUserRepository';
import { Result } from '@Primitives/Result';

export class CreateUserCommandHandler extends CommandHandler<CreateUserCommandEvent> {
  constructor(private userRepository: InMemoryUserRepository) {
    super();
  }

  async execute(command: CreateUserCommandEvent): Promise<Result> {
    const user = new User(command.payload.id, command.payload.email, command.payload.nickname);
    await this.userRepository.save(user);
    return Result.ok(user);
  }
}
```

**Test Specification (Jest):**
```typescript
import { CreateUserCommandHandler } from '@Contexts/UsersManager/Application/Commands/CreateUser/CreateUserCommandHandler';
import { CreateUserCommandEvent } from '@Contexts/UsersManager/Application/Commands/CreateUser';
import { InMemoryUserRepository } from '@Contexts/UsersManager/Infrastructure/Repositories/InMemoryUserRepository';

describe('CreateUserCommandHandler', () => {
  let handler: CreateUserCommandHandler;
  let repository: InMemoryUserRepository;

  beforeEach(() => {
    repository = new InMemoryUserRepository();
    handler = new CreateUserCommandHandler(repository);
  });

  it('should successfully create a user', async () => {
    const command = new CreateUserCommandEvent({
      id: '1',
      email: 'test@example.com',
      nickname: 'tester'
    });

    const result = await handler.execute(command);
    expect(result.isSuccess()).toBe(true);
    expect(repository.collection.get('1')).toEqual({
      id: '1',
      email: 'test@example.com',
      nickname: 'tester'
    });
  });
});
```

## 📁 Project Structure

```
jganet-clean-ddd/
│
├── src/                      # Main source code directory
│   ├── @Primitives/           # Core abstractions (Entity, Event, CommandHandler, etc.)
│   ├── Bootstrap/             # Application setup and Fastify configurations
│   ├── Contexts/              # Bounded contexts (e.g., UsersManager)
│   ├── Shared/                # Shared infrastructure and common utilities
│
├── deployments/              # Deployment configurations (Docker, build scripts)
├── .github/                  # GitHub workflows and CI/CD
├── .husky/                   # Git hooks for linting and pre-commit checks
├── package.json              # Project dependencies and scripts
├── tsconfig.json             # TypeScript configuration
└── README.md                  # Project documentation (this file)
```

### 📦 Key Directories and Files

```
jganet-clean-ddd/
│
├── src/                      # Main source code directory
│   ├── @Primitives/           # Core abstractions (Entity, Event, CommandHandler, etc.)
│   ├── Bootstrap/             # Application setup and Fastify configurations
│   ├── Contexts/              # Bounded contexts (e.g., UsersManager)
│   │   └── UsersManager/
│   │       ├── Application/   # Use cases and interactions
│   │       │   ├── Commands/
│   │       │   │   ├── CreateUser/
│   │       │   │   │   ├── CreateUserCommandEvent.ts  # Command definition
│   │       │   │   │   ├── CreateUserCommandHandler.ts # Command handler logic
│   │       │   │   │   └── CreateUserCommandHandler.spec.ts # Command test specification
│   │       │   └── Queries/
│   │       │       ├── GetUsers/
│   │       │       │   ├── GetUsersQueryHandler.ts     # Query handler for retrieving users
│   │       │       │   └── GetUsersQueryHandler.spec.ts # Test specification for the query
│   │       ├── Domain/        # Business logic layer (Entities, Value Objects)
│   │       │   └── User/
│   │       │       ├── User.ts        # User entity
│   │       │       ├── UserId.ts      # User value object for ID
│   │       │       └── UserProfile.ts # User profile value object
│   │       ├── Infrastructure/ # Persistence and repositories
│   │       │   └── Repositories/
│   │       │       └── InMemoryUserRepository.ts # In-memory repository for testing
│   │       └── Presentation/  # API Layer
│   │           └── API/
│   │               └── REST/
│   │                   ├── Controllers/
│   │                   │   └── UserController.ts # User controller
│   │                   └── Routes/
│   │                       └── userRoutes.ts     # User API routes
│   ├── Shared/                # Shared infrastructure and common utilities
│
├── deployments/              # Deployment configurations (Docker, build scripts)
├── .github/                  # GitHub workflows and CI/CD
├── .husky/                   # Git hooks for linting and pre-commit checks
├── package.json              # Project dependencies and scripts
├── tsconfig.json             # TypeScript configuration
└── README.md                  # Project documentation (this file)
```

**Key New Files:**

- `CreateUserCommandEvent.ts`: Defines the command for creating a new user.
- `CreateUserCommandHandler.ts`: Implements the command handler logic.
- `CreateUserCommandHandler.spec.ts`: Contains unit tests for the handler.
- `GetUsersQueryHandler.ts`: Implements the query handler for retrieving users.
- `GetUsersQueryHandler.spec.ts`: Contains unit tests for the query handler.
- `InMemoryUserRepository.ts`: Simulates persistence using an in-memory data source (useful for testing).
- `UserController.ts`: API controller for handling user-related HTTP requests.
- `userRoutes.ts`: Fastify routes to expose user-related API endpoints.

## ✅ Code Quality & Best Practices

- **Linting:** Use ESLint for code quality checks (`npm run lint`).
- **Formatting:** Prettier is set up for code formatting (`npm run format`).
- **Testing:** Jest for unit testing (`npm run test`).
- **CI/CD:** Automated workflows via GitHub Actions.

## 📚 Documentation & References

- [Domain-Driven Design Reference](https://domainlanguage.com/ddd/)
- [Clean Architecture Principles](https://8thlight.com/blog/uncle-bob/2012/08/13/the-clean-architecture.html)
- [CQRS Explained](https://martinfowler.com/bliki/CQRS.html)

## 💡 Contributing

1. Fork the repo
2. Create a feature branch (`git checkout -b feat/awesome-feature`)
3. Commit changes (`npm run commit`)
4. Push to the branch and open a Pull Request

## 📄 License

This project is licensed under the MIT License.

---

Happy coding! 🚀
