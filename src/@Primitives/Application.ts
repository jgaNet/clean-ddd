/**
 * Application Base Class (Abstract)
 *
 * This is a foundational class for building modular applications following
 * Domain-Driven Design (DDD) and Clean Architecture principles.
 *
 * Architecture Overview:
 * - Modular: Each functionality is encapsulated in independent modules
 * - Event-Driven: Uses event-based communication between modules
 * - CQRS Ready: Supports Command Query Responsibility Segregation
 *
 * Module System:
 * - Each module (GenericModule) contains:
 *   - Commands: Write operations (state modifications)
 *   - Queries: Read operations
 *   - Domain Events: Internal business events
 *   - Integration Events: Cross-module communication
 *
 * Lifecycle Methods:
 * 1. constructor(modules) - Initialize with required modules
 * 2. setup() - Configure application (abstract)
 * 3. startModules() - Initialize all modules
 * 4. start() - Begin application execution (abstract)
 * 5. run() - Orchestrates the complete lifecycle
 *
 * Example Implementation:
 * ```typescript
 * class MyApplication extends Application {
 *   constructor() {
 *     super({ modules: [userModule, orderModule] });
 *   }
 *
 *   async setup() {
 *     // Configure databases, middleware, etc.
 *   }
 *
 *   async start() {
 *     // Start HTTP server, message consumers, etc.
 *   }
 * }
 * ```
 *
 * Related Components:
 * - @see GenericModule - Base module class
 * - @see CommandHandler - For processing commands
 * - @see EventHandler - For handling events
 * - @see Result - For standardized operation results
 */

import { GenericModule, EventBus } from '@Primitives';

export abstract class Application {
  #modules: Map<symbol, GenericModule> = new Map();
  #eventBus: EventBus | undefined;

  abstract start(): Promise<void>;

  async run(): Promise<void> {
    // this.setup();
    this.startModules();
    await this.start();
  }

  setEventBus(eventBus: EventBus) {
    this.#eventBus = eventBus;
    return this;
  }

  registerModule(module: GenericModule) {
    if (!this.#eventBus) {
      throw new Error('You have to call setEventBus before registering modules');
    }

    module.setEventBus(this.#eventBus);
    this.#modules.set(module.getName(), module);

    return this;
  }

  startModules() {
    this.#modules.forEach(module => module.start());
  }

  getModule<T extends GenericModule>(name: symbol): T {
    const moduleInstance = this.#modules.get(name);
    if (!moduleInstance) {
      throw new Error(`Module ${name.toString()} not found`);
    }

    return moduleInstance as T;
  }
}
