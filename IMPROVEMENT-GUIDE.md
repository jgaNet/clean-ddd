# Clean DDD Implementation Guide

This guide provides practical improvements to enhance your Clean DDD implementation. Apply these patterns incrementally as you develop new features.

> **Note**: All examples follow the project's import conventions using `@SharedKernel/Domain` and other module aliases. No relative imports should be used.

## Domain Model Enhancement

**CURRENT:** Basic entities with minimal behavior

```typescript
import { Entity } from '@SharedKernel/Domain/DDD/Entity';
import { Result, IResult } from '@SharedKernel/Domain/Application/Result';

export class User extends Entity {
  #profile: UserProfile;

  static create(userDto: IUser): IResult<User> {
    return Result.ok(new User(new UserId(userDto._id), new UserProfile(userDto.profile)));
  }

  private constructor(_id: UserId, profile: UserProfile) {
    super(_id.value);
    this.#profile = profile;
  }

  get profile(): UserProfile {
    return this.#profile;
  }
}
```

**IMPROVED:** Rich model with business behavior and invariants

```typescript
import { Entity } from '@SharedKernel/Domain/DDD/Entity';
import { Result, IResult } from '@SharedKernel/Domain/Application/Result';
import { Event as DomainEvent } from '@SharedKernel/Domain/DDD/Event';
import { UserCreatedEvent } from '@Contexts/Users/Domain/User/Events/UserCreatedEvent';
import { UserActivatedEvent } from '@Contexts/Users/Domain/User/Events/UserActivatedEvent';
import { UserLoggedInEvent } from '@Contexts/Users/Domain/User/Events/UserLoggedInEvent';
import { InvalidUserIdError, UserAlreadyActiveError } from '@Contexts/Users/Domain/User/UserExceptions';

export class User extends Entity {
  #profile: UserProfile;
  #active: boolean = false;
  #lastLogin: Date | null = null;
  #domainEvents: DomainEvent[] = [];

  static create(userDto: IUserDTO): IResult<User> {
    // Validate inputs
    if (!userDto._id) {
      return Result.fail(new InvalidUserIdError('User ID is required'));
    }
    
    // Validate profile
    const profileResult = UserProfile.create(userDto.profile);
    if (profileResult.isFailure()) {
      return Result.fail(profileResult.error);
    }

    const user = new User(
      new UserId(userDto._id), 
      profileResult.data
    );
    
    // Register domain event
    user.addDomainEvent(new UserCreatedEvent({
      userId: user.id,
      email: user.profile.email.value
    }));
    
    return Result.ok(user);
  }

  private constructor(_id: UserId, profile: UserProfile) {
    super(_id.value);
    this.#profile = profile;
  }

  // Business logic methods
  activate(): IResult<void> {
    if (this.#active) {
      return Result.fail(new UserAlreadyActiveError(this.id));
    }
    
    this.#active = true;
    this.addDomainEvent(new UserActivatedEvent({ userId: this.id }));
    return Result.ok();
  }

  recordLogin(): void {
    this.#lastLogin = new Date();
    this.addDomainEvent(new UserLoggedInEvent({ userId: this.id }));
  }

  // Domain event handling
  addDomainEvent(event: DomainEvent): void {
    this.#domainEvents.push(event);
  }

  pullDomainEvents(): DomainEvent[] {
    const events = [...this.#domainEvents];
    this.#domainEvents = [];
    return events;
  }

  // Getters
  get profile(): UserProfile {
    return this.#profile;
  }
  
  get isActive(): boolean {
    return this.#active;
  }
  
  get lastLoginDate(): Date | null {
    return this.#lastLogin;
  }
}
```

## Value Objects

**CURRENT:** Basic value objects with minimal validation

```typescript
import { ValueObject } from '@SharedKernel/Domain/DDD/ValueObject';

export class UserProfile extends ValueObject<UserProfileProps> {
  constructor(userProfileDTO: IUserProfile) {
    const email = new UserEmail(userProfileDTO.email);
    super({
      email,
      nickname: userProfileDTO.nickname || email.username,
    });
  }
}
```

**IMPROVED:** Self-validating value objects with factory methods

```typescript
import { ValueObject } from '@SharedKernel/Domain/DDD/ValueObject';
import { Result, IResult } from '@SharedKernel/Domain/Application/Result';
import { InvalidNicknameError } from '@Contexts/Users/Domain/User/UserExceptions';

interface UserProfileProps {
  email: UserEmail;
  nickname: string;
}

export class UserProfile extends ValueObject<UserProfileProps> {
  private constructor(props: UserProfileProps) {
    super(props);
  }
  
  static create(userProfileDTO: IUserProfile): IResult<UserProfile> {
    // Validate email
    const emailResult = UserEmail.create(userProfileDTO.email);
    if (emailResult.isFailure()) {
      return Result.fail(emailResult.error);
    }
    
    // Validate nickname
    const nickname = userProfileDTO.nickname || emailResult.data.username;
    if (nickname.length < 2) {
      return Result.fail(new InvalidNicknameError('Nickname must be at least 2 characters'));
    }
    
    return Result.ok(new UserProfile({
      email: emailResult.data,
      nickname
    }));
  }

  // Getters
  get email(): UserEmail {
    return this.value.email;
  }

  get nickname(): string {
    return this.value.nickname;
  }

  // DTO conversion
  toDTO(): IUserProfile {
    return {
      email: this.value.email.value,
      nickname: this.value.nickname
    };
  }
}
```

## Command Handlers

**CURRENT:** Mixing persistence and domain logic

```typescript
import { CommandHandler } from '@SharedKernel/Domain/Application/CommandHandler';
import { Result, IResult } from '@SharedKernel/Domain/Application/Result';
import { CreateUserCommandEvent } from '@Contexts/Users/Application/Commands/CreateUser/CreateUserCommandEvent';
import { UserCreatedEvent } from '@Contexts/Users/Domain/User/Events/UserCreatedEvent';

export class CreateUserCommandHandler extends CommandHandler<CreateUserCommandEvent> {
  #userFactory: UserFactory;
  #userRepository: IUserRepository;
  
  constructor({ userRepository }: { userRepository: IUserRepository }) {
    super();
    this.#userRepository = userRepository;
    this.#userFactory = new UserFactory();
  }
  
  async execute({ payload }: CreateUserCommandEvent, eventBus: EventBus): Promise<IResult<IUser>> {
    try {
      const newUser = await this.#userFactory.new(payload);
      if (newUser.isFailure()) throw newUser;

      const newUserJSON = UserMapper.toJSON(newUser.data);
      await this.#userRepository.save(newUserJSON);
      eventBus.dispatch(new UserCreatedEvent(newUserJSON));

      return Result.ok(newUserJSON);
    } catch (e) {
      return Result.fail(e);
    }
  }
}
```

**IMPROVED:** Clean separation with transaction boundaries

```typescript
import { CommandHandler } from '@SharedKernel/Domain/Application/CommandHandler';
import { Result, IResult } from '@SharedKernel/Domain/Application/Result';
import { EventBus } from '@SharedKernel/Domain/Services/EventBus';
import { CreateUserCommandEvent } from '@Contexts/Users/Application/Commands/CreateUser/CreateUserCommandEvent';
import { IUserRepository } from '@Contexts/Users/Domain/User/Ports/IUserRepository';
import { UserMapper } from '@Contexts/Users/Domain/User/UserMapper';
import { UnitOfWork } from '@SharedKernel/Infrastructure/UnitOfWork';

export class CreateUserCommandHandler extends CommandHandler<CreateUserCommandEvent> {
  #userRepository: IUserRepository;
  #unitOfWork: UnitOfWork;
  
  constructor({
    userRepository,
    unitOfWork
  }: {
    userRepository: IUserRepository;
    unitOfWork: UnitOfWork;
  }) {
    super();
    this.#userRepository = userRepository;
    this.#unitOfWork = unitOfWork;
  }

  async execute({ payload }: CreateUserCommandEvent, eventBus: EventBus): Promise<IResult<IUser>> {
    // Run in transaction
    return this.#unitOfWork.runInTransaction(async () => {
      // 1. Create domain entity with validation
      const userResult = User.create({
        _id: await this.#userRepository.nextIdentity(),
        profile: {
          email: payload.email,
          nickname: payload.nickname
        }
      });
      
      if (userResult.isFailure()) {
        return Result.fail(userResult.error);
      }
      
      const user = userResult.data;
      
      // 2. Save entity (domain events will be dispatched by repository)
      await this.#userRepository.save(user);
      
      // 3. Return DTO for client
      return Result.ok(UserMapper.toDTO(user));
    });
  }
}
```

## Repository Pattern

**CURRENT:** Simple data access with DTO passing

```typescript
import { IUserRepository } from '@Contexts/Users/Domain/User/Ports/IUserRepository';
import { IUser } from '@Contexts/Users/Domain/User/DTOs';
import { InMemoryDataSource } from '@SharedKernel/Infrastructure/DataSources/InMemoryDataSource';

export class InMemoryUserRepository implements IUserRepository {
  dataSource: InMemoryDataSource<IUser>;

  constructor(dataSource: InMemoryDataSource<IUser>) {
    this.dataSource = dataSource;
  }

  async nextIdentity(): Promise<string> {
    return uuidv4();
  }

  async save(user: IUser) {
    this.dataSource.collection.set(user._id, user);
  }
}
```

**IMPROVED:** Domain-focused with event publishing

```typescript
import { Repository } from '@SharedKernel/Domain/DDD/Repository';
import { Nullable } from '@SharedKernel/Domain/Utils/Nullable';
import { EventBus } from '@SharedKernel/Domain/Services/EventBus';
import { IUserRepository } from '@Contexts/Users/Domain/User/Ports/IUserRepository';
import { User } from '@Contexts/Users/Domain/User/User';
import { IUser } from '@Contexts/Users/Domain/User/DTOs';
import { UserMapper } from '@Contexts/Users/Domain/User/UserMapper';
import { InMemoryDataSource } from '@SharedKernel/Infrastructure/DataSources/InMemoryDataSource';
import { v4 as uuidv4 } from 'uuid';

export class InMemoryUserRepository implements IUserRepository {
  dataSource: InMemoryDataSource<IUser>;
  #eventBus: EventBus;

  constructor(
    dataSource: InMemoryDataSource<IUser>,
    eventBus: EventBus
  ) {
    this.dataSource = dataSource;
    this.#eventBus = eventBus;
  }

  async nextIdentity(): Promise<string> {
    return uuidv4();
  }

  async save(user: User): Promise<void> {
    // Convert domain entity to DTO
    const userDto = UserMapper.toDTO(user);
    
    // Store DTO in data source
    this.dataSource.collection.set(userDto._id, userDto);
    
    // Dispatch domain events
    const domainEvents = user.pullDomainEvents();
    for (const event of domainEvents) {
      await this.#eventBus.dispatch(event);
    }
  }

  async findById(id: string): Promise<Nullable<User>> {
    const userDto = this.dataSource.collection.get(id);
    if (!userDto) return null;
    
    const userResult = User.create(userDto);
    return userResult.isSuccess() ? userResult.data : null;
  }
}
```

## Query Service Pattern

**CURRENT:** Basic queries service implementation

```typescript
import { IUserQueries } from '@Contexts/Users/Domain/User/Ports/IUserQueries';
import { IUser } from '@Contexts/Users/Domain/User/DTOs';
import { InMemoryDataSource } from '@SharedKernel/Infrastructure/DataSources/InMemoryDataSource';

export class InMemoryUserQueries implements IUserQueries {
  dataSource: InMemoryDataSource<IUser>;

  constructor(dataSource: InMemoryDataSource<IUser>) {
    this.dataSource = dataSource;
  }

  async findAll(): Promise<IUser[]> {
    return Array.from(this.dataSource.collection.values());
  }
}
```

**IMPROVED:** Advanced queries with pagination and filtering

```typescript
import { QueriesService } from '@SharedKernel/Domain/DDD/QueriesService';
import { IUserQueries } from '@Contexts/Users/Domain/User/Ports/IUserQueries';
import { IUser } from '@Contexts/Users/Domain/User/DTOs';
import { InMemoryDataSource } from '@SharedKernel/Infrastructure/DataSources/InMemoryDataSource';

interface FindAllOptions {
  limit?: number;
  offset?: number;
  filters?: {
    isActive?: boolean;
    email?: string;
  };
  sort?: {
    field: keyof IUser['profile'];
    direction: 'asc' | 'desc';
  };
}

export class InMemoryUserQueries implements IUserQueries {
  dataSource: InMemoryDataSource<IUser>;

  constructor(dataSource: InMemoryDataSource<IUser>) {
    this.dataSource = dataSource;
  }

  async findAll(options: FindAllOptions = {}): Promise<IUser[]> {
    const {
      limit = 100,
      offset = 0,
      filters = {},
      sort
    } = options;

    let users = Array.from(this.dataSource.collection.values());
    
    // Apply filters
    if (filters.isActive !== undefined) {
      users = users.filter(user => user.isActive === filters.isActive);
    }
    
    if (filters.email) {
      users = users.filter(user => 
        user.profile.email.toLowerCase().includes(filters.email!.toLowerCase())
      );
    }
    
    // Apply sorting
    if (sort) {
      users.sort((a, b) => {
        const aValue = a.profile[sort.field];
        const bValue = b.profile[sort.field];
        
        if (sort.direction === 'asc') {
          return aValue > bValue ? 1 : -1;
        } else {
          return aValue < bValue ? 1 : -1;
        }
      });
    }
    
    // Apply pagination
    return users.slice(offset, offset + limit);
  }
  
  async findById(id: string): Promise<IUser | null> {
    return this.dataSource.collection.get(id) || null;
  }
  
  async count(filters: FindAllOptions['filters'] = {}): Promise<number> {
    let count = this.dataSource.collection.size;
    
    // Apply filters to count
    if (Object.keys(filters).length > 0) {
      const filteredUsers = await this.findAll({ filters });
      count = filteredUsers.length;
    }
    
    return count;
  }
}
```

## Event System

**CURRENT:** Simple event handler

```typescript
import { EventHandler } from '@SharedKernel/Domain/Application/EventHandler';
import { Result, IResult } from '@SharedKernel/Domain/Application/Result';
import { UserCreatedEvent } from '@Contexts/Users/Domain/User/Events/UserCreatedEvent';

export class UserCreatedHandler extends EventHandler<UserCreatedEvent> {
  async execute(event: UserCreatedEvent): Promise<IResult<void>> {
    console.log(event.payload);
    return Result.ok();
  }
}
```

**IMPROVED:** Domain-specific handling with services

```typescript
import { EventHandler } from '@SharedKernel/Domain/Application/EventHandler';
import { Result, IResult } from '@SharedKernel/Domain/Application/Result';
import { UserCreatedEvent } from '@Contexts/Users/Domain/User/Events/UserCreatedEvent';
import { INotificationService } from '@SharedKernel/Domain/Ports/INotificationService';
import { ILogger } from '@SharedKernel/Domain/Ports/ILogger';

export class UserCreatedHandler extends EventHandler<UserCreatedEvent> {
  #notificationService: INotificationService;
  #logger: ILogger;

  constructor({ 
    notificationService, 
    logger 
  }: { 
    notificationService: INotificationService; 
    logger: ILogger 
  }) {
    super();
    this.#notificationService = notificationService;
    this.#logger = logger;
  }

  async execute(event: UserCreatedEvent): Promise<IResult<void>> {
    try {
      // Log the event
      this.#logger.info('User created', { 
        userId: event.payload.userId,
        email: event.payload.email
      });
      
      // Send welcome email
      await this.#notificationService.sendWelcomeEmail({
        to: event.payload.email,
        userId: event.payload.userId
      });
      
      return Result.ok();
    } catch (error) {
      this.#logger.error('Failed to process UserCreatedEvent', error);
      return Result.fail(error);
    }
  }
}
```

## Module System

**CURRENT:** Simple module setup

```typescript
import { ModuleBuilder } from '@SharedKernel/Domain/Application/Module';
import { CreateUserCommandEvent } from '@Contexts/Users/Application/Commands/CreateUser/CreateUserCommandEvent';
import { GetUsersQueryHandler } from '@Contexts/Users/Application/Queries/GetUsers/GetUsersQueryHandler';

export const usersModule = new ModuleBuilder(Symbol('Users'))
  .setCommand({
    event: CreateUserCommandEvent,
    handlers: [createUserCommandHandler]
  })
  .setQuery(getUsersQueryHandler)
  .build();
```

**IMPROVED:** Comprehensive module with dependencies

```typescript
import { ModuleBuilder } from '@SharedKernel/Domain/Application/Module';
import { CreateUserCommandEvent } from '@Contexts/Users/Application/Commands/CreateUser/CreateUserCommandEvent';
import { CreateUserCommandHandler } from '@Contexts/Users/Application/Commands/CreateUser/CreateUserCommandHandler';
import { GetUsersQueryHandler } from '@Contexts/Users/Application/Queries/GetUsers/GetUsersQueryHandler';
import { UserCreatedEvent } from '@Contexts/Users/Domain/User/Events/UserCreatedEvent';
import { UserCreatedHandler } from '@Contexts/Users/Application/Events/UserCreatedHandler';
import { UserActivatedEvent } from '@Contexts/Users/Domain/User/Events/UserActivatedEvent';
import { UpdateUserStatusHandler } from '@Contexts/Users/Application/Events/UpdateUserStatusHandler';
import { InMemoryUserRepository } from '@Contexts/Users/Infrastructure/Repositories/InMemoryUserRepository';
import { InMemoryUserQueries } from '@Contexts/Users/Infrastructure/Queries/InMemoryUserQueries';
import { InMemoryDataSource } from '@SharedKernel/Infrastructure/DataSources/InMemoryDataSource';
import { ConsoleLogger } from '@SharedKernel/Infrastructure/Logging/ConsoleLogger';
import { EmailNotificationService } from '@SharedKernel/Infrastructure/Notifications/EmailNotificationService';
import { InMemoryUnitOfWork } from '@SharedKernel/Infrastructure/Persistence/InMemoryUnitOfWork';
import { UserMapper } from '@Contexts/Users/Domain/User/UserMapper';

// Create shared infrastructure
const userDataSource = new InMemoryDataSource<IUser>();
const logger = new ConsoleLogger();
const eventBus = new InMemoryEventBus();
const unitOfWork = new InMemoryUnitOfWork();
const notificationService = new EmailNotificationService();

// Create repositories and queries
const userRepository = new InMemoryUserRepository(userDataSource, eventBus);
const userQueries = new InMemoryUserQueries(userDataSource);

// Build module with proper dependency injection
export const usersModule = new ModuleBuilder<UsersModule>(Symbol('users'))
  // Commands
  .setCommand({
    event: CreateUserCommandEvent,
    handlers: [
      new CreateUserCommandHandler({
        userRepository,
        unitOfWork
      })
    ]
  })
  // Queries
  .setQuery({
    name: 'getUsers',
    handler: new GetUsersQueryHandler({
      userQueries
    })
  })
  // Domain Events
  .setDomainEvent({
    event: UserCreatedEvent,
    handlers: [
      new UserCreatedHandler({
        notificationService,
        logger
      })
    ]
  })
  // Integration Events
  .setIntegrationEvent({
    event: UserActivatedEvent,
    handlers: [
      new UpdateUserStatusHandler({
        userRepository,
        logger
      })
    ]
  })
  .build();
```

## Anti-Corruption Layers

**EXAMPLE:** Protecting domain from external systems

```typescript
import { Result, IResult } from '@SharedKernel/Domain/Application/Result';
import { IAuthProvider } from '@SharedKernel/Domain/Ports/IAuthProvider';
import { UserIdentity, UserRole } from '@Contexts/Users/Domain/User/UserIdentity';
import { AuthenticationFailedError } from '@SharedKernel/Domain/Errors/AuthenticationErrors';

// External system client (from a third-party library)
interface KeycloakClient {
  verifyToken(token: string): Promise<{
    sub: string;
    email: string;
    realm_access: {
      roles: string[];
    };
  }>;
}

// Adapter to protect our domain from external system details
export class KeycloakAuthAdapter implements IAuthProvider {
  #keycloakClient: KeycloakClient;
  
  constructor(keycloakClient: KeycloakClient) {
    this.#keycloakClient = keycloakClient;
  }

  async verifyToken(token: string): Promise<IResult<UserIdentity>> {
    try {
      // Translate between external system and our domain
      const keycloakUser = await this.#keycloakClient.verifyToken(token);
      
      // Map external concepts to domain concepts
      return Result.ok({
        id: keycloakUser.sub,
        email: keycloakUser.email,
        roles: keycloakUser.realm_access.roles.map(this.mapExternalRoleToDomainRole)
      });
    } catch (error) {
      return Result.fail(new AuthenticationFailedError(
        error instanceof Error ? error.message : 'Unknown authentication error'
      ));
    }
  }
  
  private mapExternalRoleToDomainRole(externalRole: string): UserRole {
    const roleMap: Record<string, UserRole> = {
      'realm-admin': UserRole.ADMIN,
      'user': UserRole.USER
    };
    
    return roleMap[externalRole] || UserRole.GUEST;
  }
}
```

## Implementing SOLID Principles

The improvements shown in this guide follow SOLID principles:

1. **Single Responsibility Principle**: Each class has one reason to change (Entities manage state, Repositories handle persistence, etc.)
2. **Open/Closed Principle**: Code is open for extension but closed for modification (using abstract base classes and interfaces)
3. **Liskov Substitution Principle**: Different implementations of interfaces can be substituted (InMemoryRepository can be replaced with MongoRepository)
4. **Interface Segregation Principle**: Clients only depend on interfaces they use (Repository vs. QueriesService)
5. **Dependency Inversion Principle**: High-level modules depend on abstractions (CommandHandlers depend on IUserRepository, not concrete implementations)

Implement these patterns incrementally as your application grows to achieve a cleaner, more maintainable codebase.
