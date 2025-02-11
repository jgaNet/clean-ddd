import { GenericModule } from '@Primitives/Module';

export abstract class Application {
  #modules: GenericModule[];

  abstract setup(): void;
  abstract start(): Promise<void>;

  startModules() {
    this.#modules.forEach(module => module.start());
  }

  constructor({ modules }: { modules: GenericModule[] }) {
    this.#modules = modules;
  }

  run(): void {
    this.setup();
    this.startModules();
    this.start();
  }
}
