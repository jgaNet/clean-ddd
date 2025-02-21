# Clean DDD Project Example Walkthrough

## Real-World Example: User Registration Flow

Let's walk through how creating a new user works in this system.

### 1. User Registration Scenario
```typescript
// Example user registration data
const userData = {
    email: "john.doe@example.com",
    profile: {
        firstName: "John",
        lastName: "Doe",
        age: 30
    }
};
```

### 2. Flow Breakdown

#### Step 1: REST API Request
```typescript
// REST API Endpoint (Presentation Layer)
// Route: POST /api/users
@POST('/users')
async createUser(req: FastifyRequest) {
    const command = new CreateUserCommand({
        email: req.body.email,
        profile: req.body.profile
 
    return await this.commandBus.execute(command);
}
```

#### Step 2: Command Handling (Application Layer)
```typescript
// CreateUserCommand
class CreateUserCommand {
    constructor(public readonly data: {
        email: string;
        profile: UserProfileDTO;
    }) {}
}

// CreateUserCommandHandler
class CreateUserCommandHandler implements CommandHandler<CreateUserCommand> {
    async execute(command: CreateUserCommand) {
        // 1. Create domain objects
        const userEmail = UserEmail.create(command.data.email);
        const userProfile = UserProfile.create(command.data.profile);
        
        // 2. Use factory to create user
        const user = UserFactory.create({
            email: userEmail,
            profile: userProfile
        });

        // 3. Save user
        await this.userRepository.save(user);

        // 4. Publish domain event
        await this.eventBus.publish(new UserCreatedEvent(user));

        return Result.ok(user);
    }
}
```

#### Step 3: Domain Logic (Domain Layer)
```typescript
// User Entity
class User extends Entity {
    private constructor(
        private email: UserEmail,
        private profile: UserProfile,
        private id?: UserId
    ) {
        super(id);
    }

    public static create(props: {
        email: UserEmail;
        profile: UserProfile;
        id?: UserId;
    }): Result<User> {
        // Domain validation rules
        if (!props.email || !props.profile) {
            return Result.fail('Invalid user data');
        }

        return Result.ok(new User(props.email, props.profile, props.id));
    }
}

// Value Objects
class UserEmail extends ValueObject<{ value: string }> {
    public static create(email: string): Result<UserEmail> {
        if (!email.includes('@')) {
            return Result.fail('Invalid email format');
        }
        return Result.ok(new UserEmail({ value: email }));
    }
}
```

#### Step 4: Event Handling
```typescript
// Domain Event
class UserCreatedEvent implements DomainEvent {
    constructor(public readonly user: User) {}
}

// Event Handler
class UserCreatedHandler implements EventHandler<UserCreatedEvent> {
    async handle(event: UserCreatedEvent) {
        // Send welcome email
        await this.emailService.sendWelcomeEmail(event.user.email);
        
        // Update analytics
        await this.analyticsService.trackNewUser(event.user);
    }
}
```

#### Step 5: Data Storage (Infrastructure Layer)
```typescript
// Repository Implementation
class InMemoryUserRepository implements IUserRepository {
    private users: Map<string, User> = new Map();

    async save(user: User): Promise<void> {
        this.users.set(user.id.toString(), user);
    }

    async findById(id: UserId): Promise<User | null> {
        return this.users.get(id.toString()) || null;
    }
}
```

### 3. Query Example (CQRS Pattern)
```typescript
// Getting user information
class GetUserQuery {
    constructor(public readonly id: string) {}
}

class GetUserQueryHandler implements QueryHandler<GetUserQuery> {
    async execute(query: GetUserQuery) {
        const user = await this.userQueries.getUserById(query.id);
        return UserMapper.toDTO(user);
    }
}
```

### 4. Complete Flow Example

```typescript
// Usage Example
async function registrationFlow() {
    // 1. Receive HTTP Request
    const userData = {
        email: "john.doe@example.com",
        profile: {
            firstName: "John",
            lastName: "Doe",
            age: 30
        }
    };

    // 2. Create and Execute Command
    const command = new CreateUserCommand(userData);
    const result = await commandBus.execute(command);

    if (result.isSuccess()) {
        // 3. User Created Successfully
        const user = result.getValue();
        
        // 4. Event is automatically published and handled
        // - Welcome email sent
        // - Analytics updated
        
        // 5. Query user data
        const query = new GetUserQuery(user.id);
        const userDTO = await queryBus.execute(query);
        
        return userDTO;
    }
}
```

## Key Benefits of This Architecture

1. **Separation of Concerns**
   - Presentation layer handles HTTP
   - Application layer orchestrates use cases
   - Domain layer contains business rules
   - Infrastructure layer handles technical details

2. **Business Logic Protection**
   - Domain rules are encapsulated in entities and value objects
   - Business invariants are always maintained

3. **Scalability**
   - CQRS allows separate scaling of read and write operations
   - Event-driven architecture enables loose coupling

4. **Testability**
   - Each layer can be tested in isolation
   - Mock implementations available for testing
   - Domain logic can be tested without infrastructure

5. **Maintainability**
   - Clear boundaries between layers
   - Dependencies point inward
   - Business logic is isolated from technical concerns
```

This example demonstrates:
1. How the different layers interact
2. The flow of data through the system
3. How domain rules are enforced
4. How events are handled
5. The separation of read and write operations

The architecture ensures:
- Business rules are protected
- Code is maintainable and testable
- System is scalable
- Concerns are properly separated
