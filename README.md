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
├── @Primitives/        # Core abstractions (Entity, ValueObject, Module, etc.)
├── Bootstrap/          # Application startup and configuration
├── Contexts/           # Bounded contexts (business domains)
│   ├── Tracker/        # Operation tracking context
│   └── Users/          # User management context
└── SharedKernel/       # Shared infrastructure components
```

## Building Blocks

### Application Class

```typescript
// Example usage of Application primitive
class MyCleanApp extends Application {
  constructor() {
    super();
    this.setEventBus(new InMemoryEventEmitter())
      .registerModule(usersModule)
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
const usersModule = new ModuleBuilder(Symbol('Users'))
  .setCommand({
    event: CreateUserCommand,
    handlers: [new CreateUserCommandHandler({
      userRepository,
      eventBus
    })]
  })
  .setQuery(new GetUsersQueryHandler({
    userQueries
  }))
  .setDomainEvent({
    event: UserCreatedEvent,
    handlers: [new UserCreatedHandler()]
  })
  .build();

// Using the module
const createUserCmd = new CreateUserCommand({
  email: "user@example.com",
  profile: { nickname: "johndoe" }
});

// Execute command
const result = await usersModule.getCommand(CreateUserCommand).execute(createUserCmd);
```

### Domain Model

```typescript
// Entity example
export class User extends Entity {
  #profile: UserProfile;

  private constructor(id: UserId, profile: UserProfile) {
    super(id.value);
    this.#profile = profile;
  }

  static create(userDto: IUser): ResultValue<User> {
    // Domain validation rules
    return Result.ok(new User(
      new UserId(userDto._id),
      new UserProfile(userDto.profile)
    ));
  }

  get profile(): UserProfile {
    return this.#profile;
  }
}

// Value Object example
export class UserEmail extends ValueObject<string> {
  private constructor(email: string) {
    super(email);
  }

  static create(email: string): ResultValue<UserEmail> {
    if (!email.includes('@')) {
      return Result.fail(new InvalidEmailError(email));
    }
    return Result.ok(new UserEmail(email));
  }

  get username(): string {
    return this.value.split('@')[0];
  }
}
```

### Command Handlers

```typescript
export class CreateUserCommandHandler extends CommandHandler<CreateUserCommandEvent> {
  #userFactory: UserFactory;
  #userRepository: IUserRepository;

  constructor({ userRepository, userQueries }) {
    super();
    this.#userFactory = new UserFactory({ userRepository, userQueries });
    this.#userRepository = userRepository;
  }

  async execute({ payload }: CreateUserCommandEvent): Promise<ResultValue<IUser>> {
    // Create the user through factory
    const newUser = await this.#userFactory.new(payload);
    if (newUser.isFailure()) return newUser;

    // Save the user
    const newUserJSON = UserMapper.toJSON(newUser.data);
    await this.#userRepository.save(newUserJSON);

    return Result.ok(newUserJSON);
  }
}
```

### Query Handlers

```typescript
export class GetUsersQueryHandler extends QueryHandler<IUserQueries, void, ResultValue<IUser[]>> {
  #userQueries: IUserQueries;

  constructor({ userQueries }: { userQueries: IUserQueries }) {
    super();
    this.#userQueries = userQueries;
  }

  async execute(): Promise<ResultValue<IUser[]>> {
    try {
      const users = await this.#userQueries.getAll();
      return Result.ok(users);
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

# Type checking
yarn typecheck

# Testing
yarn test:watch
yarn test:cov
```

## License

MIT