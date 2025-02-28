# Testing

The Clean DDD Framework follows a comprehensive testing strategy to ensure code quality and correctness.

## Testing Strategy

The framework employs a multi-layered testing approach:

1. **Unit Tests**: Test individual components in isolation
2. **Integration Tests**: Test interactions between components
3. **End-to-End Tests**: Test complete request flows

## Testing Tools

- **Jest**: Primary testing framework
- **Supertest**: HTTP assertion library for E2E tests
- **Mocks**: Custom mock implementations for testing

## Running Tests

```bash
# Run all tests
yarn test

# Run tests in watch mode
yarn test:watch

# Run tests with coverage
yarn test:coverage

# Run a specific test
yarn test -- -t "test name"
```

## Unit Testing

Unit tests focus on testing individual components (usually handlers) in isolation.

### Testing Command Handlers

```typescript
// src/Contexts/UsersManager/Application/Commands/CreateUser/CreateUserCommandHandler.spec.ts
describe('CreateUserCommandHandler', () => {
  let handler: CreateUserCommandHandler;
  let userRepository: InMemoryUserRepository;
  let eventBus: InMemoryEventBus;
  
  beforeEach(() => {
    userRepository = new InMemoryUserRepository();
    eventBus = new InMemoryEventBus();
    handler = new CreateUserCommandHandler(userRepository, eventBus);
  });
  
  it('should create a user successfully', async () => {
    // Arrange
    const command = new CreateUserCommandEvent({
      email: 'test@example.com',
      name: 'Test User'
    });
    
    // Act
    const result = await handler.execute(command);
    
    // Assert
    expect(result.isSuccess()).toBe(true);
    const userId = result.value;
    const user = await userRepository.find(userId);
    expect(user).not.toBeNull();
    expect(user?.email).toBe('test@example.com');
    expect(user?.name).toBe('Test User');
    expect(eventBus.events).toContainEqual(
      expect.objectContaining({
        payload: expect.objectContaining({
          id: userId,
          email: 'test@example.com',
          name: 'Test User'
        })
      })
    );
  });
  
  it('should fail when user with same email already exists', async () => {
    // Arrange
    const existingUser = new User('existing-id', 'test@example.com', 'Existing User');
    await userRepository.save(existingUser);
    
    const command = new CreateUserCommandEvent({
      email: 'test@example.com',
      name: 'Test User'
    });
    
    // Act
    const result = await handler.execute(command);
    
    // Assert
    expect(result.isFailure()).toBe(true);
    expect(result.error).toBeInstanceOf(UserAlreadyExistsError);
  });
});
```

### Testing Query Handlers

```typescript
// src/Contexts/UsersManager/Application/Queries/GetUser/GetUserQueryHandler.spec.ts
describe('GetUserQueryHandler', () => {
  let handler: GetUserQueryHandler;
  let userRepository: InMemoryUserRepository;
  
  beforeEach(() => {
    userRepository = new InMemoryUserRepository();
    handler = new GetUserQueryHandler(userRepository);
  });
  
  it('should return a user when it exists', async () => {
    // Arrange
    const user = new User('test-id', 'test@example.com', 'Test User');
    await userRepository.save(user);
    
    // Act
    const result = await handler.execute({ id: 'test-id' });
    
    // Assert
    expect(result).toEqual({
      id: 'test-id',
      email: 'test@example.com',
      name: 'Test User'
    });
  });
  
  it('should return null when user does not exist', async () => {
    // Act
    const result = await handler.execute({ id: 'non-existent-id' });
    
    // Assert
    expect(result).toBeNull();
  });
});
```

## End-to-End Testing

E2E tests verify that the entire system works together correctly, from HTTP request to database and back.

```typescript
// src/Contexts/UsersManager/Presentation/API/REST/Routes/userRoutes.e2e.spec.ts
describe('User Routes (E2E)', () => {
  let app: FastifyInstance;
  
  beforeAll(async () => {
    app = await buildTestApp();
  });
  
  afterAll(async () => {
    await app.close();
  });
  
  describe('POST /users', () => {
    it('should create a user successfully', async () => {
      const response = await request(app.server)
        .post('/users')
        .send({
          email: 'e2e-test@example.com',
          name: 'E2E Test User'
        });
      
      expect(response.statusCode).toBe(202);
      expect(response.body).toHaveProperty('currentOperation');
      expect(response.body.currentOperation).toHaveProperty('id');
      expect(response.body.currentOperation).toHaveProperty('status', 'PENDING');
      
      // Wait for operation to complete
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Verify user was created
      const getUserResponse = await request(app.server)
        .get(`/operations/${response.body.currentOperation.id}`);
      
      expect(getUserResponse.statusCode).toBe(200);
      expect(getUserResponse.body).toHaveProperty('status', 'SUCCESS');
    });
    
    it('should return 400 when email is missing', async () => {
      const response = await request(app.server)
        .post('/users')
        .send({
          name: 'Invalid User'
        });
      
      expect(response.statusCode).toBe(400);
    });
  });
});
```

## Best Practices

1. **Test behavior, not implementation**: Focus on what the code does, not how it does it
2. **Test edge cases**: Cover error cases, boundary conditions, and invalid inputs
3. **Use mocks judiciously**: Prefer in-memory implementations over mocks for repositories
4. **Isolation**: Ensure each test is independent and doesn't rely on previous tests
5. **Clean setup/teardown**: Reset state between tests to avoid interference

## Common Testing Patterns

1. **Repository testing**: Test repositories with a real database in integration tests
2. **Handler testing**: Test handlers with in-memory repositories
3. **Controller testing**: Test controllers by mocking the command/query handlers
4. **E2E testing**: Test the entire flow with real HTTP requests

## Testing Domain Logic

Domain logic should be thoroughly tested, as it contains the core business rules:

```typescript
// src/Contexts/UsersManager/Domain/User.spec.ts
describe('User', () => {
  it('should create a user with valid properties', () => {
    const user = new User('test-id', 'test@example.com', 'Test User');
    
    expect(user.id).toBe('test-id');
    expect(user.email).toBe('test@example.com');
    expect(user.name).toBe('Test User');
  });
  
  it('should throw an error when email is invalid', () => {
    expect(() => new User('test-id', 'invalid-email', 'Test User'))
      .toThrow(InvalidEmailError);
  });
  
  it('should throw an error when name is empty', () => {
    expect(() => new User('test-id', 'test@example.com', ''))
      .toThrow(InvalidNameError);
  });
  
  it('should update name successfully', () => {
    const user = new User('test-id', 'test@example.com', 'Test User');
    user.updateName('New Name');
    
    expect(user.name).toBe('New Name');
  });
});
```