# Testing Strategy for Clean DDD Project

## 1. Domain Layer Tests

```typescript
// User.spec.ts
describe('User Domain Entity', () => {
    it('should create a valid user', () => {
        // Arrange
        const emailResult = UserEmail.create('valid@email.com');
        const profileResult = UserProfile.create({
            firstName: 'John',
            lastName: 'Doe',
            age: 30
        });

        // Act
        const userResult = User.create({
            email: emailResult.getValue(),
            profile: profileResult.getValue()
        });

        // Assert
        expect(userResult.isSuccess()).toBeTruthy();
        const user = userResult.getValue();
        expect(user.email.value).toBe('valid@email.com');
    });

    it('should fail with invalid email', () => {
        // Arrange
        const emailResult = UserEmail.create('invalid-email');

        // Assert
        expect(emailResult.isFailure()).toBeTruthy();
        expect(emailResult.error).toBe('Invalid email format');
    });
});

// UserEmail.spec.ts
describe('UserEmail Value Object', () => {
    it('should validate correct email format', () => {
        const validEmails = [
            'test@example.com',
            'user.name@domain.co.uk',
            'user+tag@domain.com'
        ];

        validEmails.forEach(email => {
            const result = UserEmail.create(email);
            expect(result.isSuccess()).toBeTruthy();
        });
    });

    it('should reject invalid email formats', () => {
        const invalidEmails = [
            'invalid-email',
            '@nodomain.com',
            'user@.com',
            'user@domain.'
        ];

        invalidEmails.forEach(email => {
            const result = UserEmail.create(email);
            expect(result.isFailure()).toBeTruthy();
        });
    });
});
```

## 2. Application Layer Tests

```typescript
// CreateUserCommandHandler.spec.ts
describe('CreateUserCommandHandler', () => {
    let commandHandler: CreateUserCommandHandler;
    let mockUserRepository: MockUserRepository;
    let mockEventBus: MockEventBus;

    beforeEach(() => {
        mockUserRepository = new MockUserRepository();
        mockEventBus = new MockEventBus();
        commandHandler = new CreateUserCommandHandler(
            mockUserRepository,
            mockEventBus
        );
    });

    it('should successfully create a user and publish event', async () => {
        // Arrange
        const command = new CreateUserCommand({
            email: 'test@example.com',
            profile: {
                firstName: 'John',
                lastName: 'Doe',
                age: 30
            }
        });

        // Act
        const result = await commandHandler.execute(command);

        // Assert
        expect(result.isSuccess()).toBeTruthy();
        expect(mockUserRepository.saveWasCalled).toBeTruthy();
        expect(mockEventBus.publishedEvents).toHaveLength(1);
        expect(mockEventBus.publishedEvents[0]).toBeInstanceOf(UserCreatedEvent);
    });

    it('should fail with invalid data', async () => {
        // Arrange
        const command = new CreateUserCommand({
            email: 'invalid-email',
            profile: {
                firstName: 'John',
                lastName: 'Doe',
                age: 30
            }
        });

        // Act
        const result = await commandHandler.execute(command);

        // Assert
        expect(result.isFailure()).toBeTruthy();
        expect(mockUserRepository.saveWasCalled).toBeFalsy();
        expect(mockEventBus.publishedEvents).toHaveLength(0);
    });
});
```

## 3. Infrastructure Layer Tests

```typescript
// InMemoryUserRepository.spec.ts
describe('InMemoryUserRepository', () => {
    let repository: InMemoryUserRepository;

    beforeEach(() => {
        repository = new InMemoryUserRepository();
    });

    it('should save and retrieve a user', async () => {
        // Arrange
        const user = createTestUser();

        // Act
        await repository.save(user);
        const retrieved = await repository.findById(user.id);

        // Assert
        expect(retrieved).toBeDefined();
        expect(retrieved?.id).toEqual(user.id);
        expect(retrieved?.email.value).toEqual(user.email.value);
    });

    it('should return null for non-existent user', async () => {
        // Arrange
        const nonExistentId = UserId.create();

        // Act
        const result = await repository.findById(nonExistentId);

        // Assert
        expect(result).toBeNull();
    });
});
```

## 4. Integration Tests

```typescript
// UserRegistration.integration.spec.ts
describe('User Registration Integration', () => {
    let app: Application;
    let eventBus: EventBus;
    let userRepository: IUserRepository;

    beforeEach(async () => {
        app = await createTestApplication();
        eventBus = app.get(EventBus);
        userRepository = app.get(IUserRepository);
    });

    it('should complete full registration flow', async () => {
        // Arrange
        const userData = {
            email: 'integration@test.com',
            profile: {
                firstName: 'Integration',
                lastName: 'Test',
                age: 25
            }
        };

        // Act
        const response = await request(app.getHttpServer())
            .post('/api/users')
            .send(userData);

        // Assert
        expect(response.status).toBe(201);
        
        // Verify user was saved
        const savedUser = await userRepository.findById(response.body.id);
        expect(savedUser).toBeDefined();
        
        // Verify event was published
        const publishedEvents = eventBus.getPublishedEvents();
        expect(publishedEvents).toContainEqual(
            expect.objectContaining({
                type: 'UserCreatedEvent'
            })
        );
    });
});
```

## 5. E2E Tests

```typescript
// users.e2e.spec.ts
describe('Users API (e2e)', () => {
    let app: INestApplication;

    beforeEach(async () => {
        app = await createE2ETestApplication();
    });

    afterEach(async () => {
        await app.close();
    });

    it('should create and retrieve a user', async () => {
        // Create User
        const createResponse = await request(app.getHttpServer())
            .post('/api/users')
            .send({
                email: 'e2e@test.com',
                profile: {
                    firstName: 'E2E',
                    lastName: 'Test',
                    age: 25
                }
            });

        expect(createResponse.status).toBe(201);
        const userId = createResponse.body.id;

        // Retrieve User
        const getResponse = await request(app.getHttpServer())
            .get(`/api/users/${userId}`);

        expect(getResponse.status).toBe(200);
        expect(getResponse.body).toMatchObject({
            email: 'e2e@test.com',
            profile: {
                firstName: 'E2E',
                lastName: 'Test',
                age: 25
            }
        });
    });
});
```

## Test Helpers

```typescript
// testHelpers.ts
export function createTestUser(overrides = {}) {
    const defaultProps = {
        email: 'test@example.com',
        profile: {
            firstName: 'Test',
            lastName: 'User',
            age: 30
        }
    };

    const props = { ...defaultProps, ...overrides };
    const emailResult = UserEmail.create(props.email);
    const profileResult = UserProfile.create(props.profile);
    
    return User.create({
        email: emailResult.getValue(),
        profile: profileResult.getValue()
    }).getValue();
}

export class MockUserRepository implements IUserRepository {
    private users: Map<string, User> = new Map();
    public saveWasCalled = false;

    async save(user: User): Promise<void> {
        this.saveWasCalled = true;
        this.users.set(user.id.toString(), user);
    }

    async findById(id: UserId): Promise<User | null> {
        return this.users.get(id.toString()) || null;
    }
}

export class MockEventBus implements EventBus {
    public publishedEvents: DomainEvent[] = [];

    async publish(event: DomainEvent): Promise<void> {
        this.publishedEvents.push(event);
    }
}
```

This testing suite demonstrates:
1. Unit tests for domain logic
2. Command handler tests with mocks
3. Infrastructure implementation tests
4. Integration tests for the full flow
5. E2E API tests
6. Helper functions and mock implementations

Key testing principles:
- Each layer is tested in isolation
- Mocks are used for dependencies
- Both happy path and error cases are covered
- Integration tests verify layer interactions
- E2E tests verify the complete flow
