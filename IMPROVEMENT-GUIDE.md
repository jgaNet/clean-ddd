# Clean DDD Implementation Guide

This guide provides practical improvements to enhance your Clean DDD implementation. Apply these patterns incrementally as you develop new features.

## Domain Model Enhancement

**CURRENT:** Basic entities with minimal behavior

```typescript
export class User extends Entity {
  #profile: UserProfile;

  static create(userDto: IUser): ResultValue<User> {
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
export class User extends AggregateRoot {
  #profile: UserProfile;
  #active: boolean = false;
  #lastLogin: Date | null = null;

  static create(userDto: IUserDTO): ResultValue<User> {
    // Validate inputs
    if (!userDto._id) return Result.fail(new InvalidUserIdError());
    
    // Validate profile
    const profileResult = UserProfile.create(userDto.profile);
    if (profileResult.isFailure()) return Result.fail(profileResult.error);

    const user = new User(
      new UserId(userDto._id), 
      profileResult.data
    );
    
    // Register domain event
    user.registerDomainEvent(new UserCreatedEvent({
      id: user.id,
      email: user.profile.email.value
    }));
    
    return Result.ok(user);
  }

  activate(): ResultValue<void> {
    if (this.#active) {
      return Result.fail(new UserAlreadyActiveError(this.id));
    }
    
    this.#active = true;
    this.registerDomainEvent(new UserActivatedEvent({ userId: this.id }));
    return Result.ok();
  }

  recordLogin(): void {
    this.#lastLogin = new Date();
    this.registerDomainEvent(new UserLoggedInEvent({ userId: this.id }));
  }

  get isActive(): boolean {
    return this.#active;
  }
}
```

## Value Objects

**CURRENT:** Basic value objects with minimal validation

```typescript
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
export class UserProfile extends ValueObject<UserProfileProps> {
  private constructor(props: UserProfileProps) {
    super(props);
  }
  
  static create(userProfileDTO: IUserProfile): ResultValue<UserProfile> {
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
export class CreateUserCommandHandler extends CommandHandler<CreateUserCommandEvent> {
  async execute({ payload }: CreateUserCommandEvent): Promise<ResultValue<IUser>> {
    try {
      const newUser = await this.#userFactory.new(payload);
      if (newUser.isFailure()) throw newUser;

      const newUserJSON = UserMapper.toJSON(newUser.data);
      await this.#userRepository.save(newUserJSON);
      this.#eventBus.dispatch(new UserCreatedEvent(newUserJSON));

      return Result.ok(newUserJSON);
    } catch (e) {
      return Result.fail(e);
    }
  }
}
```

**IMPROVED:** Clean separation with transaction boundaries

```typescript
export class CreateUserCommandHandler extends CommandHandler<CreateUserCommandEvent> {
  constructor(
    private readonly userFactory: UserFactory,
    private readonly userRepository: IUserRepository,
    private readonly unitOfWork: UnitOfWork
  ) {
    super();
  }

  async execute({ payload }: CreateUserCommandEvent): Promise<ResultValue<IUser>> {
    // Run in transaction
    return this.unitOfWork.runInTransaction(async () => {
      // 1. Create domain entity
      const userResult = await this.userFactory.create(payload);
      if (userResult.isFailure()) {
        return Result.fail(userResult.error);
      }
      const user = userResult.data;
      
      // 2. Save and publish events (handled by repository)
      await this.userRepository.save(user);
      
      // 3. Return DTO for client
      return Result.ok(UserMapper.toDTO(user));
    });
  }
}
```

## Repository Pattern

**CURRENT:** Simple data access with DTO passing

```typescript
export class InMemoryUserRepository implements IUserRepository {
  async save(user: IUser) {
    this.dataSource.collection.set(user._id, user);
  }
}
```

**IMPROVED:** Domain-focused with event publishing

```typescript
export class InMemoryUserRepository implements IUserRepository {
  constructor(
    private readonly dataSource: InMemoryDataSource<IUser>,
    private readonly eventDispatcher: DomainEventDispatcher
  ) {}

  async save(user: User): Promise<void> {
    // Convert domain entity to DTO
    const userDto = UserMapper.toDTO(user);
    
    // Store DTO in data source
    this.dataSource.collection.set(userDto._id, userDto);
    
    // Dispatch domain events
    user.pullDomainEvents().forEach(event => {
      this.eventDispatcher.dispatch(event);
    });
  }

  async findById(id: string): Promise<Nullable<User>> {
    const userDto = this.dataSource.collection.get(id);
    if (!userDto) return null;
    
    const userResult = User.create(userDto);
    return userResult.isSuccess() ? userResult.data : null;
  }
}
```

## Event System

**CURRENT:** Simple event handler

```typescript
export class UserCreatedHandler extends EventHandler<UserCreatedEvent> {
  async execute(event: UserCreatedEvent): Promise<ResultValue> {
    console.log(event.name, event.payload);
    return Result.ok();
  }
}
```

**IMPROVED:** Domain-specific handling with services

```typescript
export class UserCreatedHandler extends EventHandler<UserCreatedEvent> {
  constructor(
    private readonly notificationService: INotificationService,
    private readonly logger: ILogger
  ) {
    super();
  }

  async execute(event: UserCreatedEvent): Promise<ResultValue> {
    try {
      // Log the event
      this.logger.info('User created', { 
        userId: event.payload._id,
        email: event.payload.profile.email
      });
      
      // Send welcome email
      await this.notificationService.sendWelcomeEmail({
        to: event.payload.profile.email,
        nickname: event.payload.profile.nickname
      });
      
      return Result.ok();
    } catch (error) {
      this.logger.error('Failed to process UserCreatedEvent', error);
      return Result.fail(error);
    }
  }
}
```

## Module System

**CURRENT:** Simple module setup

```typescript
export const usersModule = new ModuleBuilder(Symbol('Users'))
  .setCommand({
    event: CreateUserCommand,
    handlers: [createUserHandler]
  })
  .setQuery(getUsersQueryHandler)
  .build();
```

**IMPROVED:** Comprehensive module with dependencies

```typescript
const createUserRepository = () => {
  return new InMemoryUserRepository(
    new InMemoryDataSource<IUser>(), 
    eventBus
  );
};

export const usersModule = new ModuleBuilder(Symbol('Users'))
  // Commands
  .setCommand({
    event: CreateUserCommand,
    handlers: [
      new CreateUserCommandHandler({
        userFactory: new UserFactory(),
        userRepository: createUserRepository(),
        unitOfWork: new InMemoryUnitOfWork()
      })
    ]
  })
  // Queries
  .setQuery(
    new GetUsersQueryHandler({ 
      userQueries: new InMemoryUserQueries(new InMemoryDataSource<IUser>())
    })
  )
  // Domain Events
  .setDomainEvent({
    event: UserCreatedEvent,
    handlers: [
      new UserCreatedHandler({
        notificationService: new EmailNotificationService(),
        logger: new ConsoleLogger()
      })
    ]
  })
  // Integration Events
  .setIntegrationEvent({
    event: UserActivatedEvent,
    handlers: [
      new UpdateOperationStatusHandler({
        operationRepository: new InMemoryOperationRepository()
      })
    ]
  })
  // Services
  .setService('userMapper', new UserMapper())
  .build();
```

## Anti-Corruption Layers

**EXAMPLE:** Protecting domain from external systems

```typescript
export class KeycloakAuthAdapter implements IAuthProvider {
  constructor(private keycloakClient: KeycloakClient) {}

  async verifyToken(token: string): Promise<ResultValue<UserIdentity>> {
    try {
      // Translate between external system and our domain
      const keycloakUser = await this.keycloakClient.verifyToken(token);
      
      // Map external concepts to domain concepts
      return Result.ok({
        id: keycloakUser.sub,
        email: keycloakUser.email,
        roles: keycloakUser.realm_access.roles.map(this.mapExternalRoleToDomainRole)
      });
    } catch (error) {
      return Result.fail(new AuthenticationFailedError(error.message));
    }
  }
  
  private mapExternalRoleToDomainRole(externalRole: string): UserRole {
    const roleMap = {
      'realm-admin': UserRole.ADMIN,
      'user': UserRole.USER
    };
    
    return roleMap[externalRole] || UserRole.GUEST;
  }
}
```

Implement these patterns incrementally as your application grows to achieve a cleaner, more maintainable codebase.