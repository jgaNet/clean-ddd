# Core Components

The Clean DDD Framework is built around several core components that provide the foundation for the application architecture.

## Event System

### Event

Base class for all events in the system:

```typescript
export abstract class Event<T = unknown> {
  constructor(public readonly payload: T) {}
}
```

### EventHandler

Abstract base class for handling events:

```typescript
export abstract class EventHandler<E extends Event> {
  abstract execute(event: E): Promise<void>;
}
```

### EventBus

Interface for event publishing and subscription:

```typescript
export interface IEventBus {
  publish(event: Event): void;
  subscribe<E extends Event>(
    eventClass: Class<E>,
    handler: EventHandler<E>
  ): void;
}
```

## Command System

### CommandEvent

Special type of event that represents an intention to perform an action:

```typescript
export class CreateUserCommandEvent extends Event<{
  email: string;
  name: string;
}> {
  constructor(payload: { email: string; name: string }) {
    super(payload);
  }
}
```

### CommandHandler

Processes commands and produces results:

```typescript
export abstract class CommandHandler<E extends Event> {
  abstract execute(command: E): Promise<ResultValue<unknown>>;
}
```

## Query System

### QueryHandler

Retrieves data without side effects:

```typescript
export abstract class QueryHandler<P, R> {
  abstract execute(params: P): Promise<R>;
}
```

## Result Pattern

### Result

Represents the outcome of an operation:

```typescript
export class Result<T> {
  private constructor(
    private readonly _isSuccess: boolean,
    private readonly _value?: T,
    private readonly _error?: Error
  ) {}

  static ok<T>(value?: T): Result<T> {
    return new Result<T>(true, value);
  }

  static fail<T>(error: Error): Result<T> {
    return new Result<T>(false, undefined, error);
  }
  
  isSuccess(): boolean {
    return this._isSuccess;
  }
  
  isFailure(): boolean {
    return !this._isSuccess;
  }
  
  get value(): T {
    if (!this._isSuccess) {
      throw new Error("Cannot get value from failure result");
    }
    return this._value as T;
  }
  
  get error(): Error {
    if (this._isSuccess) {
      throw new Error("Cannot get error from success result");
    }
    return this._error as Error;
  }
}
```

## Operation Tracking

### Operation

Tracks the lifecycle of a command or event:

```typescript
export class Operation<T = unknown> {
  id: string;
  command: Event;
  status: OperationStatus;
  result?: ResultValue<T>;
  error?: Error;
  createdAt: Date;
  updatedAt: Date;
  finishedAt?: Date;
  
  constructor(command: Event) {
    this.id = generateUUID();
    this.command = command;
    this.status = OperationStatus.PENDING;
    this.createdAt = new Date();
    this.updatedAt = new Date();
  }
  
  markAsSent(): void {
    this.status = OperationStatus.SENT;
    this.updatedAt = new Date();
  }
  
  markAsSuccess(result?: ResultValue<T>): void {
    this.status = OperationStatus.SUCCESS;
    this.result = result;
    this.updatedAt = new Date();
    this.finishedAt = new Date();
  }
  
  markAsError(error: Error): void {
    this.status = OperationStatus.ERROR;
    this.error = error;
    this.updatedAt = new Date();
    this.finishedAt = new Date();
  }
}
```

### OperationStatus

Enum representing the possible states of an operation:

```typescript
export enum OperationStatus {
  PENDING = 'PENDING',
  SENT = 'SENT',
  SUCCESS = 'SUCCESS',
  ERROR = 'ERROR'
}
```

## Repository Pattern

Interface defining the contract for persistence:

```typescript
export interface IUserRepository {
  find(id: string): Promise<User | null>;
  findByEmail(email: string): Promise<User | null>;
  save(user: User): Promise<void>;
  delete(id: string): Promise<void>;
}
```