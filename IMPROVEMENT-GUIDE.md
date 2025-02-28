# Clean DDD Architecture Improvement Guide

This guide provides a comprehensive set of recommendations to enhance your Clean DDD implementation, bringing it closer to a "perfect" implementation of Clean Architecture and Domain-Driven Design principles.

## Table of Contents

1. [Domain Model Improvements](#1-domain-model-improvements)
2. [Aggregate Design](#2-aggregate-design)
3. [Value Objects](#3-value-objects)
4. [Domain Services](#4-domain-services)
5. [Command Handlers](#5-command-handlers)
6. [Repository Pattern](#6-repository-pattern)
7. [Event System](#7-event-system)
8. [Bounded Context Separation](#8-bounded-context-separation)
9. [Anti-Corruption Layers](#9-anti-corruption-layers)
10. [Consistency Boundaries](#10-consistency-boundaries)
11. [Ubiquitous Language](#11-ubiquitous-language)
12. [Context Mapping](#12-context-mapping)

## 1. Domain Model Improvements

Your domain models are currently too anemic, focusing mostly on data rather than behavior.

### Current Implementation:

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

### Recommended Implementation:

```typescript
export class User extends AggregateRoot {
  #profile: UserProfile;
  #createdAt: Date;
  #updatedAt: Date;
  #active: boolean = false;

  static create(userDto: IUser): ResultValue<User> {
    // Validate inputs before creation
    if (!userDto._id) {
      return Result.fail(new InvalidUserIdError());
    }
    
    // Validate profile
    const profileResult = UserProfile.create(userDto.profile);
    if (profileResult.isFailure()) {
      return Result.fail(profileResult.error);
    }

    const user = new User(
      new UserId(userDto._id), 
      profileResult.data,
      userDto.createdAt ? new Date(userDto.createdAt) : new Date(),
      userDto.updatedAt ? new Date(userDto.updatedAt) : new Date()
    );
    
    // Register domain event
    user.registerDomainEvent(new UserCreatedEvent({
      id: user.id,
      email: user.profile.email.value,
      nickname: user.profile.nickname
    }));
    
    return Result.ok(user);
  }

  private constructor(_id: UserId, profile: UserProfile, createdAt: Date, updatedAt: Date) {
    super(_id.value);
    this.#profile = profile;
    this.#createdAt = createdAt;
    this.#updatedAt = updatedAt;
  }

  get profile(): UserProfile {
    return this.#profile;
  }
  
  get createdAt(): Date {
    return this.#createdAt;
  }
  
  get updatedAt(): Date {
    return this.#updatedAt;
  }
  
  get isActive(): boolean {
    return this.#active;
  }
  
  updateProfile(newProfile: UserProfile): ResultValue<void> {
    // Domain validation logic
    this.#profile = newProfile;
    this.#updatedAt = new Date();
    
    // Register domain event
    this.registerDomainEvent(new UserProfileUpdatedEvent({
      userId: this.id,
      profile: this.#profile.toDTO()
    }));
    
    return Result.ok();
  }
  
  activate(): ResultValue<void> {
    if (this.#active) {
      return Result.fail(new UserAlreadyActiveException(this.id));
    }
    
    this.#active = true;
    this.registerDomainEvent(new UserActivatedEvent({ userId: this.id }));
    
    return Result.ok();
  }

  deactivate(): ResultValue<void> {
    if (!this.#active) {
      return Result.fail(new UserNotActiveException(this.id));
    }
    
    this.#active = false;
    this.registerDomainEvent(new UserDeactivatedEvent({ userId: this.id }));
    
    return Result.ok();
  }
}
```

### Benefits:

- Richer domain model with behavior
- Lifecycle tracking (createdAt, updatedAt)
- Business rules enforced in domain entities
- Domain events generated from meaningful state changes
- Clear business methods (activate, deactivate, updateProfile)

## 2. Aggregate Design

Your codebase lacks clear aggregate boundaries and explicit aggregate roots.

### Recommended Implementation:

```typescript
// src/@Primitives/AggregateRoot.ts
export abstract class AggregateRoot extends Entity {
  #domainEvents: DomainEvent<unknown>[] = [];
  
  protected registerDomainEvent(domainEvent: DomainEvent<unknown>): void {
    this.#domainEvents.push(domainEvent);
  }
  
  public pullDomainEvents(): DomainEvent<unknown>[] {
    const domainEvents = [...this.#domainEvents];
    this.#domainEvents = [];
    return domainEvents;
  }
}

// Complex aggregate example with child entities
export class OrderAggregate extends AggregateRoot {
  #orderItems: OrderItem[] = [];
  #status: OrderStatus;
  #customerId: CustomerId;
  #shippingAddress: Address;
  
  // Only the aggregate root can create/modify OrderItems
  addItem(product: Product, quantity: number): ResultValue<void> {
    if (this.#status !== OrderStatus.DRAFT) {
      return Result.fail(new OrderNotModifiableError());
    }
    
    const orderItem = OrderItem.create(this.id, product.id, quantity, product.price);
    this.#orderItems.push(orderItem);
    
    this.registerDomainEvent(new OrderItemAddedEvent({
      orderId: this.id,
      productId: product.id,
      quantity
    }));
    
    return Result.ok();
  }
  
  removeItem(productId: string): ResultValue<void> {
    if (this.#status !== OrderStatus.DRAFT) {
      return Result.fail(new OrderNotModifiableError());
    }
    
    const index = this.#orderItems.findIndex(item => item.productId === productId);
    if (index === -1) {
      return Result.fail(new OrderItemNotFoundError(productId));
    }
    
    this.#orderItems.splice(index, 1);
    this.registerDomainEvent(new OrderItemRemovedEvent({
      orderId: this.id,
      productId
    }));
    
    return Result.ok();
  }
  
  place(): ResultValue<void> {
    // Business validation logic
    if (this.#orderItems.length === 0) {
      return Result.fail(new EmptyOrderError());
    }
    
    if (this.#status !== OrderStatus.DRAFT) {
      return Result.fail(new InvalidOrderStateTransitionError(
        this.#status, 
        OrderStatus.PLACED
      ));
    }
    
    this.#status = OrderStatus.PLACED;
    this.registerDomainEvent(new OrderPlacedEvent({ orderId: this.id }));
    
    return Result.ok();
  }
  
  // Other business methods...
}
```

### Benefits:

- Clear aggregate boundaries with a single entry point (aggregate root)
- Domain events tracking within aggregates
- Business rules enforced by the aggregate root
- Invariants protected across the entire aggregate
- Proper transactional boundary

## 3. Value Objects

Your value objects can be improved with better validation, equality comparison, and serialization.

### Current Implementation:

```typescript
export class UserProfile extends ValueObject<UserProfileProps> {
  constructor(userProfileDTO: IUserProfile) {
    const email = new UserEmail(userProfileDTO.email);
    super({
      email,
      nickname: userProfileDTO.nickname || email.username,
    });
  }

  get nickname(): string {
    return this.value.nickname;
  }

  get email(): UserEmail {
    return this.value.email;
  }
}
```

### Recommended Implementation:

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
    if (!nickname || nickname.length < 3) {
      return Result.fail(new InvalidNicknameError('Nickname must be at least 3 characters'));
    }
    
    return Result.ok(new UserProfile({
      email: emailResult.data,
      nickname
    }));
  }

  get nickname(): string {
    return this.value.nickname;
  }

  get email(): UserEmail {
    return this.value.email;
  }
  
  toDTO(): IUserProfile {
    return {
      email: this.email.value,
      nickname: this.nickname
    };
  }
  
  equals(other: UserProfile): boolean {
    return this.email.equals(other.email) && 
           this.nickname === other.nickname;
  }
}
```

### Benefits:

- Factory method for creation with validation
- Proper error handling for invalid inputs
- Immutability (private constructor)
- Equality comparison for value objects
- Serialization method for persistence/transfer
- Self-validation of business rules

## 4. Domain Services

Add domain services for operations that don't naturally fit within entities.

### Recommended Implementation:

```typescript
// src/Contexts/UsersManager/Domain/Services/UserAuthenticationService.ts
export class UserAuthenticationService {
  constructor(
    private readonly userRepository: IUserRepository,
    private readonly passwordHashingService: IPasswordHashingService
  ) {}

  async authenticateUser(email: string, password: string): Promise<ResultValue<User>> {
    const userResult = await this.userRepository.findByEmail(email);
    
    if (userResult.isFailure()) {
      return Result.fail(new UserAuthenticationFailedException('Invalid credentials'));
    }
    
    const user = userResult.getValue();
    const validPassword = await this.passwordHashingService.verify(
      password, 
      user.passwordHash
    );
    
    if (!validPassword) {
      return Result.fail(new UserAuthenticationFailedException('Invalid credentials'));
    }
    
    if (!user.isActive) {
      return Result.fail(new InactiveUserException(user.id));
    }
    
    return Result.ok(user);
  }
}

// Usage in application layer
export class LoginUserCommandHandler extends CommandHandler<LoginUserCommandEvent> {
  constructor(
    private readonly authService: UserAuthenticationService,
    private readonly tokenService: TokenService
  ) {
    super();
  }
  
  async execute(command: LoginUserCommandEvent): Promise<ResultValue<string>> {
    const { email, password } = command.payload;
    
    const userResult = await this.authService.authenticateUser(email, password);
    if (userResult.isFailure()) {
      return Result.fail(userResult.error);
    }
    
    const user = userResult.getValue();
    const token = await this.tokenService.generateToken(user);
    
    return Result.ok(token);
  }
}
```

### Benefits:

- Complex domain operations that don't belong to entities are encapsulated
- Business logic remains in the domain layer
- Stateless operations clearly separated
- Coordination between multiple aggregates handled safely
- Domain knowledge captured in explicit services

## 5. Command Handlers

Improve command handlers with Unit of Work pattern and better separation of concerns.

### Current Implementation:

```typescript
export class CreateUserCommandHandler extends CommandHandler<CreateUserCommandEvent> {
  #userFactory: UserFactory;
  #userRepository: IUserRepository;
  #eventBus: EventBus;

  constructor({
    userRepository,
    userQueries,
    eventBus,
  }: {
    userRepository: IUserRepository;
    userQueries: IUserQueries;
    eventBus: EventBus;
  }) {
    super();
    this.#userFactory = new UserFactory({ userRepository, userQueries });
    this.#userRepository = userRepository;
    this.#eventBus = eventBus;
  }

  async execute({ payload }: CreateUserCommandEvent): Promise<ResultValue<IUser>> {
    try {
      const newUser = await this.#userFactory.new(payload);

      if (newUser.isFailure()) {
        throw newUser;
      }

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

### Recommended Implementation:

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
    // Use transaction for consistency
    return this.unitOfWork.runInTransaction(async () => {
      // 1. Create the user through factory
      const userResult = await this.userFactory.create(payload);
      if (userResult.isFailure()) {
        return Result.fail(userResult.error);
      }
      const user = userResult.data;
      
      // 2. Save the user
      await this.userRepository.save(user);
      
      // 3. Return the user DTO (not the domain entity)
      return Result.ok(UserMapper.toDTO(user));
    });
  }
}
```

### Benefits:

- Transactional boundaries explicitly defined
- Simplified constructor with explicit dependencies
- No direct event dispatching (handled by repository/UoW)
- Cleaner error handling
- Clear separation between domain entities and DTOs
- No unsafe type casting

## 6. Repository Pattern

Enhance repositories to work with domain entities and handle event dispatching.

### Current Implementation:

```typescript
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

### Recommended Implementation:

```typescript
export class InMemoryUserRepository implements IUserRepository {
  constructor(
    private readonly dataSource: InMemoryDataSource<IUser>,
    private readonly eventDispatcher: DomainEventDispatcher
  ) {}

  async nextIdentity(): Promise<string> {
    return uuidv4();
  }

  async findById(id: string): Promise<Nullable<User>> {
    const userDto = this.dataSource.collection.get(id);
    if (!userDto) return null;
    
    const userResult = User.create(userDto);
    return userResult.isSuccess() ? userResult.data : null;
  }

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
}

// For a real database implementation
export class PostgresUserRepository implements IUserRepository {
  constructor(
    private readonly dbConnection: DbConnection,
    private readonly eventDispatcher: DomainEventDispatcher
  ) {}

  async save(user: User): Promise<ResultValue<void>> {
    const transaction = await this.dbConnection.startTransaction();
    
    try {
      // Save aggregate root
      await transaction.query(
        'INSERT INTO users (id, active, created_at, updated_at) VALUES ($1, $2, $3, $4) ON CONFLICT (id) DO UPDATE SET active = $2, updated_at = $4',
        [user.id, user.isActive, user.createdAt, new Date()]
      );
      
      // Save profile value object in same transaction
      await transaction.query(
        'INSERT INTO user_profiles (user_id, email, nickname) VALUES ($1, $2, $3) ON CONFLICT (user_id) DO UPDATE SET email = $2, nickname = $3',
        [user.id, user.profile.email.value, user.profile.nickname]
      );
      
      // Commit transaction to ensure aggregate consistency
      await transaction.commit();
      
      // Dispatch domain events after successful transaction
      user.pullDomainEvents().forEach(event => {
        this.eventDispatcher.dispatch(event);
      });
      
      return Result.ok();
    } catch (error) {
      // Rollback on any error to maintain consistency
      await transaction.rollback();
      return Result.fail(new UserPersistenceException(error.message));
    }
  }
}
```

### Benefits:

- Repositories work with domain entities, not DTOs
- Event dispatching as part of the repository's responsibility
- Proper transactional boundaries around aggregates
- Clear separation between domain model and persistence
- Error handling with meaningful domain exceptions

## 7. Event System

Improve the event system with better tracking and handling of domain events.

### Current Implementation:

```typescript
export class Event<PayloadDTO> {
  #payload: PayloadDTO;

  constructor(payload: PayloadDTO) {
    this.#payload = payload;
  }

  get payload(): PayloadDTO {
    return this.#payload;
  }

  get name(): string {
    return this.constructor.name;
  }
}

export class UserCreatedHandler extends EventHandler<UserCreatedEvent> {
  async execute(event: UserCreatedEvent): Promise<ResultValue> {
    // eslint-disable-next-line no-console
    console.log(event.name, event.payload);

    return Result.ok();
  }
}
```

### Recommended Implementation:

```typescript
// Event handler with meaningful implementation
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
      this.logger.error('Failed to process UserCreatedEvent', { 
        error,
        userId: event.payload._id
      });
      return Result.fail(error);
    }
  }
}

// Integration event handling between contexts
export class NotificationIntegrationService {
  constructor(private readonly eventBus: EventBus) {}

  async userCreated(user: User): Promise<void> {
    // Translate domain event to integration event
    const integrationEvent = new UserRegisteredIntegrationEvent({
      userId: user.id,
      email: user.profile.email.value,
      registrationDate: new Date(),
      requiresVerification: true
    });
    
    await this.eventBus.dispatch(integrationEvent);
  }
}
```

### Benefits:

- Meaningful event handling with actual business logic
- Proper dependency injection in handlers
- Structured logging for event traceability
- Error handling within event handlers
- Clear distinction between domain and integration events

## 8. Bounded Context Separation

Improve the separation of bounded contexts and create dedicated contexts for cross-cutting concerns.

### Current Implementation:
- Operation tracking in Shared module
- Shared infrastructure between contexts

### Recommended Implementation:

```
/src
  /Contexts
    /UsersManager            # User management bounded context
    /OperationsManager       # Dedicated context for operations
    /Notifications           # Dedicated context for notifications
    /Authorization           # Authentication and authorization context
  /SharedKernel              # Truly shared abstractions (instead of /Shared)
    /Result                  # Common result pattern
    /DomainEvent             # Base domain event
    /ValueObject             # Base value object
```

### Benefits:

- Clear boundaries between business domains
- Each context has its own ubiquitous language
- Reduced dependencies between contexts
- Explicit integration points between contexts
- Better separation of concerns

## 9. Anti-Corruption Layers

Add explicit translation layers between bounded contexts and for external systems.

### Recommended Implementation:

```typescript
// src/Contexts/UsersManager/Infrastructure/ExternalServices/Auth/KeycloakAuthProvider.ts
export class KeycloakAuthProvider implements IAuthProvider {
  constructor(private keycloakClient: KeycloakClient) {}

  async verifyToken(token: string): Promise<ResultValue<UserIdentity>> {
    try {
      // Translate between external system (Keycloak) and our domain
      const keycloakUser = await this.keycloakClient.verifyToken(token);
      
      // Map external concepts to our domain concepts
      return Result.ok({
        id: keycloakUser.sub,
        email: keycloakUser.email,
        roles: keycloakUser.realm_access.roles.map(this.mapKeycloakRoleToDomainRole),
        isVerified: keycloakUser.email_verified
      });
    } catch (error) {
      return Result.fail(new AuthenticationFailedException(error.message));
    }
  }
  
  private mapKeycloakRoleToDomainRole(keycloakRole: string): UserRole {
    const roleMap = {
      'realm-admin': UserRole.ADMIN,
      'user': UserRole.USER,
      // other mappings
    };
    
    return roleMap[keycloakRole] || UserRole.USER;
  }
}

// Between bounded contexts
export class NotificationAdapter {
  constructor(private readonly notificationService: NotificationService) {}

  async sendUserWelcomeNotification(user: User): Promise<ResultValue<void>> {
    // Translate from User context to Notification context
    return this.notificationService.sendWelcomeEmail({
      recipientId: user.id,
      emailAddress: user.profile.email.value,
      name: user.profile.nickname,
      language: 'en' // Default language
    });
  }
}
```

### Benefits:

- Protects domain model from external systems
- Translates between different bounded contexts
- Isolates changes in external systems
- Prevents corruption of the domain model
- Explicit mapping between different concept models

## 10. Consistency Boundaries

Implement proper transaction boundaries around aggregates with the Unit of Work pattern.

### Recommended Implementation:

```typescript
// src/SharedKernel/Infrastructure/UnitOfWork.ts
export interface UnitOfWork {
  startTransaction(): Promise<void>;
  commitTransaction(): Promise<void>;
  rollbackTransaction(): Promise<void>;
  runInTransaction<T>(callback: () => Promise<T>): Promise<T>;
}

// Implementation for SQL database
export class PostgresUnitOfWork implements UnitOfWork {
  constructor(private readonly dbConnection: DbConnection) {}

  async startTransaction(): Promise<void> {
    await this.dbConnection.query('BEGIN');
  }

  async commitTransaction(): Promise<void> {
    await this.dbConnection.query('COMMIT');
  }

  async rollbackTransaction(): Promise<void> {
    await this.dbConnection.query('ROLLBACK');
  }

  async runInTransaction<T>(callback: () => Promise<T>): Promise<T> {
    await this.startTransaction();
    try {
      const result = await callback();
      await this.commitTransaction();
      return result;
    } catch (error) {
      await this.rollbackTransaction();
      throw error;
    }
  }
}

// Usage in command handler
export class PlaceOrderCommandHandler extends CommandHandler<PlaceOrderCommandEvent> {
  constructor(
    private readonly orderRepository: IOrderRepository,
    private readonly unitOfWork: UnitOfWork
  ) {
    super();
  }

  async execute(command: PlaceOrderCommandEvent): Promise<ResultValue<string>> {
    return this.unitOfWork.runInTransaction(async () => {
      // All operations within the transaction
      const order = await this.orderRepository.findById(command.payload.orderId);
      if (!order) {
        return Result.fail(new OrderNotFoundError(command.payload.orderId));
      }
      
      const result = order.place();
      if (result.isFailure()) {
        return Result.fail(result.error);
      }
      
      await this.orderRepository.save(order);
      return Result.ok(order.id);
    });
  }
}
```

### Benefits:

- Explicit transaction boundaries around aggregates
- Consistent state transitions in aggregates
- Atomic operations for related changes
- Proper rollback on errors
- Simplified error handling in command handlers

## 11. Ubiquitous Language

Enforce consistent domain language throughout the codebase.

### Current Implementation:
- Some generic terms (Operation, Result)
- Inconsistent naming conventions

### Recommended Implementation:

```typescript
// Create glossary for each bounded context
// src/Contexts/UsersManager/README.md

/**
 * # UsersManager Bounded Context Glossary
 * 
 * - User: A person with an account in the system
 * - UserProfile: Personal information about a user
 * - UserStatus: Current state of a user (Active, Inactive, Suspended, etc.)
 * - UserRegistration: Process of creating a new user account
 * - UserAuthentication: Process of verifying a user's identity
 */

// Rename generic concepts to domain-specific terms
// Instead of "Operation" (too generic)
export class CommandExecution {
  id: string;
  commandType: string;
  status: CommandExecutionStatus;
  result?: any;
  initiatedBy: string;
  startedAt: Date;
  completedAt?: Date;
  // ...
}

// Use consistent, domain-specific naming for API endpoints
// users.controller.ts
@Controller('user-accounts')  // More specific than generic "users"
export class UserAccountsController {
  @Post('registrations')      // More specific than generic "create"
  async registerNewAccount(@Body() data: RegisterAccountRequest): Promise<RegisterAccountResponse> {
    // ...
  }
  
  @Post('authentications')    // More specific than generic "login"
  async authenticateUser(@Body() data: AuthenticationRequest): Promise<AuthenticationResponse> {
    // ...
  }
}
```

### Benefits:

- Consistent terminology throughout the codebase
- Clearer communication between team members
- Domain concepts directly reflected in code
- Reduced translation between business and technical language
- More specific, domain-driven API designs

## 12. Context Mapping

Define explicit relationships between bounded contexts.

### Recommended Implementation:

```typescript
// Create a context map document
// src/ContextMap.md

/**
 * # Context Map
 * 
 * This document defines the relationships between bounded contexts in our system.
 * 
 * ## Context Relationships:
 * 
 * 1. UsersManager ⟷ Authorization (Partnership)
 *    - UsersManager provides user profiles and management
 *    - Authorization handles authentication and access control
 *    - Shared Kernel: UserIdentity concept
 * 
 * 2. UsersManager → Notifications (Customer/Supplier)
 *    - UsersManager (Customer) consumes notification services
 *    - Notifications (Supplier) provides email/SMS capabilities
 *    - Integration via NotificationAdapter and events
 * 
 * 3. All Contexts → OperationsManager (Conformist)
 *    - All contexts conform to the OperationsManager's tracking model
 *    - Standardized interface for operation tracking
 */

// Implement context registry
export class ContextRegistry {
  private contexts: Map<string, BoundedContext> = new Map();
  
  registerContext(name: string, context: BoundedContext): void {
    this.contexts.set(name, context);
  }
  
  getContext(name: string): BoundedContext {
    return this.contexts.get(name);
  }
}

// Conformist interface example
export interface OperationTrackable {
  trackOperation<T>(
    operationType: string,
    context: string,
    execution: () => Promise<ResultValue<T>>
  ): Promise<ResultValue<T>>;
}

// Partnership integration example
export class UserAuthorizationIntegrator {
  constructor(
    private readonly userRepository: IUserRepository,
    private readonly authorizationService: IAuthorizationService
  ) {}
  
  async syncUserRoles(userId: string): Promise<ResultValue<void>> {
    const userResult = await this.userRepository.findById(userId);
    if (userResult.isFailure()) {
      return Result.fail(userResult.error);
    }
    
    const user = userResult.data;
    await this.authorizationService.updateUserRoles(
      userId, 
      this.mapUserTypesToRoles(user.type)
    );
    
    return Result.ok();
  }
  
  private mapUserTypesToRoles(userType: UserType): Role[] {
    // Translation between contexts
    const roleMap = {
      [UserType.ADMIN]: [Role.SYSTEM_ADMIN],
      [UserType.CUSTOMER]: [Role.USER, Role.CUSTOMER],
      [UserType.STAFF]: [Role.USER, Role.STAFF]
    };
    
    return roleMap[userType] || [Role.USER];
  }
}
```

### Benefits:

- Explicit documentation of context relationships
- Clear integration patterns between contexts
- Reduced coupling between bounded contexts
- Well-defined translation layers
- Better understanding of system architecture