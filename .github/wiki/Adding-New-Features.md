# Adding New Features

This guide outlines the process for adding new features to the Clean DDD Framework.

## Step-by-Step Guide

### 1. Identify the Bounded Context

Determine which existing context the feature belongs to, or create a new one if needed.

- If the feature is related to user management, add it to `UsersManager`
- If the feature is shared across contexts, add it to `Shared`
- If it's a completely new domain, create a new bounded context

Example: For a "Delete User" feature, use the existing `UsersManager` context.

### 2. Define Domain Model

Update or create the necessary domain entities, value objects, and events.

Example for "Delete User":
- No new entities needed (User entity already exists)
- Define a domain event to signal user deletion:

```typescript
// src/Contexts/UsersManager/Domain/Events/UserDeletedEvent.ts
export class UserDeletedEvent extends Event<{ id: string }> {
  constructor(payload: { id: string }) {
    super(payload);
  }
}
```

### 3. Implement Use Cases

Create the necessary command and query handlers.

Example for "Delete User":

```typescript
// src/Contexts/UsersManager/Application/Commands/DeleteUser/DeleteUserCommandEvent.ts
export class DeleteUserCommandEvent extends Event<{ id: string }> {
  constructor(payload: { id: string }) {
    super(payload);
  }
}

// src/Contexts/UsersManager/Application/Commands/DeleteUser/DeleteUserCommandHandler.ts
export class DeleteUserCommandHandler extends CommandHandler<DeleteUserCommandEvent> {
  #userRepository: IUserRepository;
  #eventBus: IEventBus;

  constructor(userRepository: IUserRepository, eventBus: IEventBus) {
    super();
    this.#userRepository = userRepository;
    this.#eventBus = eventBus;
  }

  async execute(command: DeleteUserCommandEvent): Promise<ResultValue<void>> {
    const { id } = command.payload;
    
    // Check if user exists
    const user = await this.#userRepository.find(id);
    if (!user) {
      return Result.fail(new UserNotFoundError(id));
    }
    
    // Delete user
    await this.#userRepository.delete(id);
    
    // Publish domain event
    this.#eventBus.publish(new UserDeletedEvent({ id }));
    
    return Result.ok();
  }
}
```

### 4. Add Infrastructure Components

Implement any necessary infrastructure components (repositories, services, etc.).

Example for "Delete User":
- Update the user repository if needed (likely already has a delete method)

### 5. Create API Endpoints

Define routes and implement controller methods for the new feature.

Example for "Delete User":

```typescript
// src/Contexts/UsersManager/Presentation/API/REST/Routes/userRoutes.ts
// Add a new route
fastify.delete<{ Params: { id: string } }>(
  '/:id',
  {
    schema: {
      params: {
        type: 'object',
        properties: {
          id: { type: 'string' }
        },
        required: ['id']
      },
      response: {
        202: {
          type: 'object',
          properties: {
            currentOperation: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                status: { type: 'string' }
              }
            }
          }
        }
      }
    }
  },
  userController.deleteUser.bind(userController)
);

// src/Contexts/UsersManager/Presentation/API/REST/Controllers/FastifyUserController.ts
// Add a new controller method
async deleteUser(req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
  try {
    const operation = this.#commandEventBus.dispatch(
      new DeleteUserCommandEvent({ id: req.params.id })
    );
    
    reply.code(202);
    return { currentOperation: OperationMapper.toJSON(operation) };
  } catch (e) {
    reply.code(400);
    return e;
  }
}
```

### 6. Register Components

Register the new components in the appropriate module.

Example for "Delete User":

```typescript
// src/Contexts/UsersManager/UsersManagerModule.ts
export const usersManagerModule = new UsersManagerModule({
  // ... existing handlers
  commandHandlers: [
    // ... existing command handlers
    { 
      event: DeleteUserCommandEvent, 
      handler: new DeleteUserCommandHandler(
        userRepository, 
        eventBus
      )
    }
  ],
  eventHandlers: [
    // ... existing event handlers
    // Add any event handlers for UserDeletedEvent if needed
  ]
});
```

## Implementing Cross-Cutting Features

For features that span multiple bounded contexts:

1. Define shared components in the `Shared` directory
2. Use domain events to communicate between contexts
3. Ensure each context maintains its independence

## Testing New Features

1. Write unit tests for command and query handlers
2. Write end-to-end tests for API endpoints
3. Test both success and failure scenarios

Example test for "Delete User":

```typescript
// src/Contexts/UsersManager/Application/Commands/DeleteUser/DeleteUserCommandHandler.spec.ts
describe('DeleteUserCommandHandler', () => {
  let handler: DeleteUserCommandHandler;
  let userRepository: InMemoryUserRepository;
  let eventBus: InMemoryEventBus;
  
  beforeEach(() => {
    userRepository = new InMemoryUserRepository();
    eventBus = new InMemoryEventBus();
    handler = new DeleteUserCommandHandler(userRepository, eventBus);
  });
  
  it('should delete a user when it exists', async () => {
    // Arrange
    const user = new User('test-id', 'test@example.com', 'Test User');
    await userRepository.save(user);
    
    // Act
    const command = new DeleteUserCommandEvent({ id: 'test-id' });
    const result = await handler.execute(command);
    
    // Assert
    expect(result.isSuccess()).toBe(true);
    expect(await userRepository.find('test-id')).toBeNull();
    expect(eventBus.events).toContainEqual(expect.any(UserDeletedEvent));
  });
  
  it('should fail when user does not exist', async () => {
    // Act
    const command = new DeleteUserCommandEvent({ id: 'non-existent-id' });
    const result = await handler.execute(command);
    
    // Assert
    expect(result.isFailure()).toBe(true);
    expect(result.error).toBeInstanceOf(UserNotFoundError);
  });
});
```