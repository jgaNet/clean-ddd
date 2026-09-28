/**
 * Application: registers modules and starts them against one event bus.
 *
 * The concrete class adds the transport. See Bootstrap/Fastify/application.ts, which sets
 * the bus, registers the modules and routes, then listens:
 *
 * ```typescript
 * await app.setEventBus(trackedEventBus).registerModule(localNotesModule).run();
 * ```
 */

import { EventBus } from '@SharedKernel/Application/EventBus';
import { Module } from '@SharedKernel/Application/Module';

export abstract class Application {
  #modules = new Map<string, Module>();
  #eventBus?: EventBus;

  /** Begin serving: start the HTTP server, message consumers, etc. */
  abstract start(): Promise<void>;

  getEventBus(): EventBus {
    if (!this.#eventBus) {
      throw new Error('You have to call setEventBus before starting the application');
    }
    return this.#eventBus;
  }

  async run(): Promise<void> {
    this.startModules();
    await this.start();
  }

  setEventBus(eventBus: EventBus) {
    this.#eventBus = eventBus;
    return this;
  }

  registerModule(module: Module) {
    if (!this.#eventBus) {
      throw new Error('You have to call setEventBus before registering modules');
    }
    this.#modules.set(module.name, module);
    return this;
  }

  startModules() {
    this.#modules.forEach(module => module.start(this.#eventBus));
  }

  getModule(name: string): Module {
    const module = this.#modules.get(name);
    if (!module) {
      throw new Error(`Module ${name} not found`);
    }
    return module;
  }
}
