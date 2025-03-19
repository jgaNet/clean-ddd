# Clean DDD Implementation Guide

This guide provides practical improvements to enhance your Clean DDD implementation. Apply these patterns incrementally as you develop new features.

> **Note**: All examples follow the project's import conventions using `@SharedKernel/Domain` and other module aliases. No relative imports should be used.

## Domain Model Enhancement

**CURRENT:** Basic entities with minimal behavior

```typescript
import { Entity } from '@SharedKernel/Domain/DDD/Entity';
import { Result, IResult } from '@SharedKernel/Domain/Application/Result';

export class Note extends Entity {
  #title: string;
  #content: string;

  static create(noteDto: INote): IResult<Note> {
    return Result.ok(new Note(noteDto._id, noteDto.title, noteDto.content));
  }

  private constructor(_id: string, title: string, content: string) {
    super(_id);
    this.#title = title;
    this.#content = content;
  }

  get title(): string {
    return this.#title;
  }
  
  get content(): string {
    return this.#content;
  }
}
```

**IMPROVED:** Rich model with business behavior and invariants

```typescript
import { Entity } from '@SharedKernel/Domain/DDD/Entity';
import { Result, IResult } from '@SharedKernel/Domain/Application/Result';
import { Event as DomainEvent } from '@SharedKernel/Domain/DDD/Event';
import { NoteCreatedEvent } from '@Contexts/Notes/Domain/Note/Events/NoteCreatedEvent';
import { NoteUpdatedEvent } from '@Contexts/Notes/Domain/Note/Events/NoteUpdatedEvent';
import { InvalidNoteTitleError, EmptyNoteContentError } from '@Contexts/Notes/Domain/Note/NoteExceptions';

export class Note extends Entity {
  #title: string;
  #content: string;
  #createdAt: Date;
  #updatedAt: Date | null = null;
  #domainEvents: DomainEvent[] = [];

  static create(noteDto: INoteDTO): IResult<Note> {
    // Validate inputs
    if (!noteDto.title || noteDto.title.trim().length === 0) {
      return Result.fail(new InvalidNoteTitleError('Note title is required'));
    }
    
    const note = new Note(
      noteDto._id, 
      noteDto.title,
      noteDto.content || '',
      noteDto.createdAt || new Date()
    );
    
    // Register domain event
    note.addDomainEvent(new NoteCreatedEvent({
      noteId: note.id,
      title: note.title
    }));
    
    return Result.ok(note);
  }

  private constructor(_id: string, title: string, content: string, createdAt: Date) {
    super(_id);
    this.#title = title;
    this.#content = content;
    this.#createdAt = createdAt;
  }

  // Business logic methods
  updateContent(newContent: string): IResult<void> {
    if (!newContent || newContent.trim().length === 0) {
      return Result.fail(new EmptyNoteContentError(this.id));
    }
    
    this.#content = newContent;
    this.#updatedAt = new Date();
    this.addDomainEvent(new NoteUpdatedEvent({ 
      noteId: this.id,
      title: this.#title,
      content: this.#content
    }));
    
    return Result.ok();
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
  get title(): string {
    return this.#title;
  }
  
  get content(): string {
    return this.#content;
  }
  
  get createdAt(): Date {
    return this.#createdAt;
  }
  
  get updatedAt(): Date | null {
    return this.#updatedAt;
  }
}
```

## Value Objects

**CURRENT:** Basic value objects with minimal validation

```typescript
import { ValueObject } from '@SharedKernel/Domain/DDD/ValueObject';

export class NoteTitle extends ValueObject<string> {
  constructor(title: string) {
    super(title);
  }
}
```

**IMPROVED:** Self-validating value objects with factory methods

```typescript
import { ValueObject } from '@SharedKernel/Domain/DDD/ValueObject';
import { Result, IResult } from '@SharedKernel/Domain/Application/Result';
import { InvalidNoteTitleError } from '@Contexts/Notes/Domain/Note/NoteExceptions';

export class NoteTitle extends ValueObject<string> {
  private constructor(title: string) {
    super(title);
  }
  
  static create(title: string): IResult<NoteTitle> {
    if (!title || title.trim().length === 0) {
      return Result.fail(new InvalidNoteTitleError('Title cannot be empty'));
    }
    
    if (title.length > 100) {
      return Result.fail(new InvalidNoteTitleError('Title must be 100 characters or less'));
    }
    
    return Result.ok(new NoteTitle(title.trim()));
  }
  
  // Add domain-specific methods
  get abbreviated(): string {
    return this.value.length > 25 
      ? `${this.value.substring(0, 22)}...` 
      : this.value;
  }
}
```

## Command Handlers

**CURRENT:** Mixing persistence and domain logic

```typescript
import { CommandHandler } from '@SharedKernel/Domain/Application/CommandHandler';
import { Result, IResult } from '@SharedKernel/Domain/Application/Result';
import { CreateNoteCommandEvent } from '@Contexts/Notes/Application/Commands/CreateNote/CreateNoteCommandEvent';
import { NoteCreatedEvent } from '@Contexts/Notes/Domain/Note/Events/NoteCreatedEvent';

export class CreateNoteCommandHandler extends CommandHandler<CreateNoteCommandEvent> {
  #noteRepository: INoteRepository;
  
  constructor({ noteRepository }: { noteRepository: INoteRepository }) {
    super();
    this.#noteRepository = noteRepository;
  }
  
  async execute({ payload }: CreateNoteCommandEvent, eventBus: EventBus): Promise<IResult<INote>> {
    try {
      const note = Note.create({
        _id: await this.#noteRepository.nextIdentity(),
        title: payload.title,
        content: payload.content
      });
      
      if (note.isFailure()) throw note;

      const noteDTO = NoteMapper.toDTO(note.data);
      await this.#noteRepository.save(noteDTO);
      eventBus.dispatch(new NoteCreatedEvent(noteDTO));

      return Result.ok(noteDTO);
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
import { CreateNoteCommandEvent } from '@Contexts/Notes/Application/Commands/CreateNote/CreateNoteCommandEvent';
import { INoteRepository } from '@Contexts/Notes/Domain/Note/Ports/INoteRepository';
import { NoteMapper } from '@Contexts/Notes/Domain/Note/NoteMapper';
import { UnitOfWork } from '@SharedKernel/Infrastructure/UnitOfWork';

export class CreateNoteCommandHandler extends CommandHandler<CreateNoteCommandEvent> {
  #noteRepository: INoteRepository;
  #unitOfWork: UnitOfWork;
  
  constructor({
    noteRepository,
    unitOfWork
  }: {
    noteRepository: INoteRepository;
    unitOfWork: UnitOfWork;
  }) {
    super();
    this.#noteRepository = noteRepository;
    this.#unitOfWork = unitOfWork;
  }

  async execute({ payload }: CreateNoteCommandEvent, eventBus: EventBus): Promise<IResult<INote>> {
    // Run in transaction
    return this.#unitOfWork.runInTransaction(async () => {
      // 1. Create domain entity with validation
      const noteResult = Note.create({
        _id: await this.#noteRepository.nextIdentity(),
        title: payload.title,
        content: payload.content
      });
      
      if (noteResult.isFailure()) {
        return Result.fail(noteResult.error);
      }
      
      const note = noteResult.data;
      
      // 2. Save entity (domain events will be dispatched by repository)
      await this.#noteRepository.save(note);
      
      // 3. Return DTO for client
      return Result.ok(NoteMapper.toDTO(note));
    });
  }
}
```

## Repository Pattern

**CURRENT:** Simple data access with DTO passing

```typescript
import { INoteRepository } from '@Contexts/Notes/Domain/Note/Ports/INoteRepository';
import { INote } from '@Contexts/Notes/Domain/Note/DTOs';
import { InMemoryDataSource } from '@SharedKernel/Infrastructure/DataSources/InMemoryDataSource';

export class InMemoryNoteRepository implements INoteRepository {
  dataSource: InMemoryDataSource<INote>;

  constructor(dataSource: InMemoryDataSource<INote>) {
    this.dataSource = dataSource;
  }

  async nextIdentity(): Promise<string> {
    return uuidv4();
  }

  async save(note: INote) {
    this.dataSource.collection.set(note._id, note);
  }
}
```

**IMPROVED:** Domain-focused with event publishing

```typescript
import { Repository } from '@SharedKernel/Domain/DDD/Repository';
import { Nullable } from '@SharedKernel/Domain/Utils/Nullable';
import { EventBus } from '@SharedKernel/Domain/Services/EventBus';
import { INoteRepository } from '@Contexts/Notes/Domain/Note/Ports/INoteRepository';
import { Note } from '@Contexts/Notes/Domain/Note/Note';
import { INote } from '@Contexts/Notes/Domain/Note/DTOs';
import { NoteMapper } from '@Contexts/Notes/Domain/Note/NoteMapper';
import { InMemoryDataSource } from '@SharedKernel/Infrastructure/DataSources/InMemoryDataSource';
import { v4 as uuidv4 } from 'uuid';

export class InMemoryNoteRepository implements INoteRepository {
  dataSource: InMemoryDataSource<INote>;
  #eventBus: EventBus;

  constructor(
    dataSource: InMemoryDataSource<INote>,
    eventBus: EventBus
  ) {
    this.dataSource = dataSource;
    this.#eventBus = eventBus;
  }

  async nextIdentity(): Promise<string> {
    return uuidv4();
  }

  async save(note: Note): Promise<void> {
    // Convert domain entity to DTO
    const noteDto = NoteMapper.toDTO(note);
    
    // Store DTO in data source
    this.dataSource.collection.set(noteDto._id, noteDto);
    
    // Dispatch domain events
    const domainEvents = note.pullDomainEvents();
    for (const event of domainEvents) {
      await this.#eventBus.dispatch(event);
    }
  }

  async findById(id: string): Promise<Nullable<Note>> {
    const noteDto = this.dataSource.collection.get(id);
    if (!noteDto) return null;
    
    const noteResult = Note.create(noteDto);
    return noteResult.isSuccess() ? noteResult.data : null;
  }
}
```

## Query Service Pattern

**CURRENT:** Basic queries service implementation

```typescript
import { INoteQueries } from '@Contexts/Notes/Domain/Note/Ports/INoteQueries';
import { INote } from '@Contexts/Notes/Domain/Note/DTOs';
import { InMemoryDataSource } from '@SharedKernel/Infrastructure/DataSources/InMemoryDataSource';

export class InMemoryNoteQueries implements INoteQueries {
  dataSource: InMemoryDataSource<INote>;

  constructor(dataSource: InMemoryDataSource<INote>) {
    this.dataSource = dataSource;
  }

  async findAll(): Promise<INote[]> {
    return Array.from(this.dataSource.collection.values());
  }
}
```

**IMPROVED:** Advanced queries with pagination and filtering

```typescript
import { QueriesService } from '@SharedKernel/Domain/DDD/QueriesService';
import { INoteQueries } from '@Contexts/Notes/Domain/Note/Ports/INoteQueries';
import { INote } from '@Contexts/Notes/Domain/Note/DTOs';
import { InMemoryDataSource } from '@SharedKernel/Infrastructure/DataSources/InMemoryDataSource';

interface FindAllOptions {
  limit?: number;
  offset?: number;
  filters?: {
    titleContains?: string;
    contentContains?: string;
    createdAfter?: Date;
  };
  sort?: {
    field: 'title' | 'createdAt' | 'updatedAt';
    direction: 'asc' | 'desc';
  };
}

export class InMemoryNoteQueries implements INoteQueries {
  dataSource: InMemoryDataSource<INote>;

  constructor(dataSource: InMemoryDataSource<INote>) {
    this.dataSource = dataSource;
  }

  async findAll(options: FindAllOptions = {}): Promise<INote[]> {
    const {
      limit = 100,
      offset = 0,
      filters = {},
      sort
    } = options;

    let notes = Array.from(this.dataSource.collection.values());
    
    // Apply filters
    if (filters.titleContains) {
      notes = notes.filter(note => 
        note.title.toLowerCase().includes(filters.titleContains!.toLowerCase())
      );
    }
    
    if (filters.contentContains) {
      notes = notes.filter(note => 
        note.content.toLowerCase().includes(filters.contentContains!.toLowerCase())
      );
    }
    
    if (filters.createdAfter) {
      notes = notes.filter(note => 
        new Date(note.createdAt) > filters.createdAfter!
      );
    }
    
    // Apply sorting
    if (sort) {
      notes.sort((a, b) => {
        let aValue = a[sort.field];
        let bValue = b[sort.field];
        
        // Handle dates
        if (sort.field === 'createdAt' || sort.field === 'updatedAt') {
          aValue = new Date(aValue).getTime();
          bValue = new Date(bValue).getTime();
        }
        
        if (sort.direction === 'asc') {
          return aValue > bValue ? 1 : -1;
        } else {
          return aValue < bValue ? 1 : -1;
        }
      });
    }
    
    // Apply pagination
    return notes.slice(offset, offset + limit);
  }
  
  async findById(id: string): Promise<INote | null> {
    return this.dataSource.collection.get(id) || null;
  }
  
  async count(filters: FindAllOptions['filters'] = {}): Promise<number> {
    let count = this.dataSource.collection.size;
    
    // Apply filters to count
    if (Object.keys(filters).length > 0) {
      const filteredNotes = await this.findAll({ filters });
      count = filteredNotes.length;
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
import { NoteCreatedEvent } from '@Contexts/Notes/Domain/Note/Events/NoteCreatedEvent';

export class NoteCreatedHandler extends EventHandler<NoteCreatedEvent> {
  async execute(event: NoteCreatedEvent): Promise<IResult<void>> {
    console.log(event.payload);
    return Result.ok();
  }
}
```

**IMPROVED:** Domain-specific handling with services

```typescript
import { EventHandler } from '@SharedKernel/Domain/Application/EventHandler';
import { Result, IResult } from '@SharedKernel/Domain/Application/Result';
import { NoteCreatedEvent } from '@Contexts/Notes/Domain/Note/Events/NoteCreatedEvent';
import { INotificationService } from '@SharedKernel/Domain/Ports/INotificationService';
import { ILogger } from '@SharedKernel/Domain/Ports/ILogger';

export class NoteCreatedHandler extends EventHandler<NoteCreatedEvent> {
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

  async execute(event: NoteCreatedEvent): Promise<IResult<void>> {
    try {
      // Log the event
      this.#logger.info('Note created', { 
        noteId: event.payload.noteId,
        title: event.payload.title
      });
      
      // Send notification
      await this.#notificationService.sendNotification({
        subject: 'New Note Created',
        message: `A new note titled "${event.payload.title}" was created`
      });
      
      return Result.ok();
    } catch (error) {
      this.#logger.error('Failed to process NoteCreatedEvent', error);
      return Result.fail(error);
    }
  }
}
```

## Module System

**CURRENT:** Simple module setup

```typescript
import { ModuleBuilder } from '@SharedKernel/Domain/Application/Module';
import { CreateNoteCommandEvent } from '@Contexts/Notes/Application/Commands/CreateNote/CreateNoteCommandEvent';
import { GetNotesQueryHandler } from '@Contexts/Notes/Application/Queries/GetNotes/GetNotesQueryHandler';

export const notesModule = new ModuleBuilder(Symbol('Notes'))
  .setCommand({
    event: CreateNoteCommandEvent,
    handlers: [createNoteCommandHandler]
  })
  .setQuery(getNotesQueryHandler)
  .build();
```

**IMPROVED:** Comprehensive module with dependencies

```typescript
import { ModuleBuilder } from '@SharedKernel/Domain/Application/Module';
import { CreateNoteCommandEvent } from '@Contexts/Notes/Application/Commands/CreateNote/CreateNoteCommandEvent';
import { CreateNoteCommandHandler } from '@Contexts/Notes/Application/Commands/CreateNote/CreateNoteCommandHandler';
import { GetNotesQueryHandler } from '@Contexts/Notes/Application/Queries/GetNotes/GetNotesQueryHandler';
import { NoteCreatedEvent } from '@Contexts/Notes/Domain/Note/Events/NoteCreatedEvent';
import { NoteCreatedHandler } from '@Contexts/Notes/Application/Events/NoteCreatedHandler';
import { InMemoryNoteRepository } from '@Contexts/Notes/Infrastructure/Repositories/InMemoryNoteRepository';
import { InMemoryNoteQueries } from '@Contexts/Notes/Infrastructure/Queries/InMemoryNoteQueries';
import { InMemoryDataSource } from '@SharedKernel/Infrastructure/DataSources/InMemoryDataSource';
import { ConsoleLogger } from '@SharedKernel/Infrastructure/Logging/ConsoleLogger';
import { NotificationService } from '@SharedKernel/Infrastructure/Notifications/NotificationService';
import { InMemoryUnitOfWork } from '@SharedKernel/Infrastructure/UnitOfWork/InMemoryUnitOfWork';

// Create shared infrastructure
const noteDataSource = new InMemoryDataSource<INote>();
const logger = new ConsoleLogger();
const eventBus = new InMemoryEventBus();
const unitOfWork = new InMemoryUnitOfWork();
const notificationService = new NotificationService();

// Create repositories and queries
const noteRepository = new InMemoryNoteRepository(noteDataSource, eventBus);
const noteQueries = new InMemoryNoteQueries(noteDataSource);

// Build module with proper dependency injection
export const notesModule = new ModuleBuilder<NotesModule>(Symbol('notes'))
  // Commands
  .setCommand({
    event: CreateNoteCommandEvent,
    handlers: [
      new CreateNoteCommandHandler({
        noteRepository,
        unitOfWork
      })
    ]
  })
  // Queries
  .setQuery({
    name: 'getNotes',
    handler: new GetNotesQueryHandler({
      noteQueries
    })
  })
  // Domain Events
  .setDomainEvent({
    event: NoteCreatedEvent,
    handlers: [
      new NoteCreatedHandler({
        notificationService,
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
import { IStorageProvider } from '@SharedKernel/Domain/Ports/IStorageProvider';
import { NoteAttachment } from '@Contexts/Notes/Domain/Note/NoteAttachment';
import { StorageError } from '@SharedKernel/Domain/Errors/StorageErrors';

// External system client (from a third-party library)
interface S3Client {
  uploadFile(params: {
    Bucket: string;
    Key: string;
    Body: Buffer;
    ContentType: string;
  }): Promise<{
    Location: string;
    ETag: string;
    VersionId?: string;
  }>;
}

// Adapter to protect our domain from external system details
export class S3StorageAdapter implements IStorageProvider {
  #s3Client: S3Client;
  #bucketName: string;
  
  constructor(s3Client: S3Client, bucketName: string) {
    this.#s3Client = s3Client;
    this.#bucketName = bucketName;
  }

  async saveAttachment(attachment: NoteAttachment): Promise<IResult<string>> {
    try {
      // Translate between domain concepts and external system
      const uploadResult = await this.#s3Client.uploadFile({
        Bucket: this.#bucketName,
        Key: `notes/${attachment.noteId}/${attachment.filename}`,
        Body: attachment.content,
        ContentType: attachment.mimeType
      });
      
      // Return only what the domain needs
      return Result.ok(uploadResult.Location);
    } catch (error) {
      return Result.fail(new StorageError(
        error instanceof Error ? error.message : 'Unknown storage error'
      ));
    }
  }
}
```

## Implementing SOLID Principles

The improvements shown in this guide follow SOLID principles:

1. **Single Responsibility Principle**: Each class has one reason to change (Entities manage state, Repositories handle persistence, etc.)
2. **Open/Closed Principle**: Code is open for extension but closed for modification (using abstract base classes and interfaces)
3. **Liskov Substitution Principle**: Different implementations of interfaces can be substituted (InMemoryRepository can be replaced with MongoRepository)
4. **Interface Segregation Principle**: Clients only depend on interfaces they use (Repository vs. QueriesService)
5. **Dependency Inversion Principle**: High-level modules depend on abstractions (CommandHandlers depend on INoteRepository, not concrete implementations)

Implement these patterns incrementally as your application grows to achieve a cleaner, more maintainable codebase.