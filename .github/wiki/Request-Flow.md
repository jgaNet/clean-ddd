# Request Flow

This document describes how requests flow through the Clean DDD Framework, from the client to the domain layer and back.

## Command Flow

Commands are used to modify state in the system. Here's how a command flows through the system:

```
Client → Controller → CommandEvent → EventBus → Operation → CommandHandler → Domain Logic → Repository
                                                                           ↓
                                                                           → Domain Event → EventHandler
```

### Step-by-Step Flow

1. **Client Request**:
   - Client sends an HTTP request to a specific endpoint
   - Request contains data needed for the operation

2. **Controller Processing**:
   - Controller receives the request
   - Validates input data and formats
   - Creates a command event with the validated data

3. **Command Dispatch**:
   - Controller dispatches the command event to the event bus
   - Event bus creates an operation to track the command
   - Event bus finds the appropriate command handler

4. **Command Handling**:
   - Command handler executes the business logic
   - Interacts with domain entities through repositories
   - Returns a Result object (success or failure)

5. **Domain Events**:
   - Command handler may emit domain events
   - Domain events reflect state changes in the system
   - Event bus dispatches these events to relevant handlers

6. **Response**:
   - Operation is updated with the result
   - Controller returns appropriate HTTP response
   - Response typically includes operation status and ID

### Example Command Flow

```typescript
// 1. Client sends HTTP POST to /users
// Request body: { "email": "user@example.com", "name": "Test User" }

// 2. Controller processes request
async createUser(req: FastifyRequest, reply: FastifyReply) {
  try {
    // 3. Command dispatch
    const operation = this.#commandEventBus.dispatch(
      new CreateUserCommandEvent({
        email: req.body.email,
        name: req.body.name,
      }),
    );
    
    // 6. Response
    reply.code(202);
    return { 
      currentOperation: OperationMapper.toJSON(operation)
    };
  } catch (e) {
    reply.code(400);
    return e;
  }
}

// 4. Command handling (in CreateUserCommandHandler)
async execute(command: CreateUserCommandEvent): Promise<ResultValue<string>> {
  const { email, name } = command.payload;
  
  // Check if user already exists
  const existingUser = await this.#userRepository.findByEmail(email);
  if (existingUser) {
    return Result.fail(new UserAlreadyExistsError(email));
  }
  
  // Create new user
  const id = generateUUID();
  const user = new User(id, email, name);
  await this.#userRepository.save(user);
  
  // 5. Domain event
  this.#eventBus.publish(new UserCreatedEvent({ id, email, name }));
  
  return Result.ok(id);
}
```

## Query Flow

Queries are used to retrieve data from the system. Here's how a query flows:

```
Client → Controller → QueryHandler → Repository → Domain Objects → DTOs → Client
```

### Step-by-Step Flow

1. **Client Request**:
   - Client sends an HTTP request to a specific endpoint
   - Request may contain parameters for filtering/pagination

2. **Controller Processing**:
   - Controller receives the request
   - Validates input parameters
   - Calls the appropriate query handler

3. **Query Handling**:
   - Query handler retrieves data from repositories
   - May join data from multiple sources
   - Applies filtering and pagination

4. **Response Formatting**:
   - Domain objects are mapped to DTOs
   - Controller returns formatted response
   - Response includes the requested data

### Example Query Flow

```typescript
// 1. Client sends HTTP GET to /users/123

// 2. Controller processes request
async getUser(req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
  try {
    // 3. Query handling
    const user = await this.#getUserQueryHandler.execute({ id: req.params.id });
    
    if (!user) {
      reply.code(404);
      return { message: 'User not found' };
    }
    
    // 4. Response formatting
    reply.code(200);
    return user; // Already a DTO from the query handler
  } catch (e) {
    reply.code(400);
    return e;
  }
}
```