import { Presenter } from '../DDD/Presenter';

export class PresenterFactory {
  private presenters: Map<string, Map<string, Presenter<unknown, unknown>>> = new Map();

  register({
    name,
    presenters,
  }: {
    name: string;
    presenters: {
      format: string;
      presenter: Presenter<unknown, unknown>;
    }[];
  }): PresenterFactory {
    if (!this.presenters.has(name)) {
      this.presenters.set(name, new Map());
    }

    const methodPresenters = this.presenters.get(name);
    if (!methodPresenters) {
      throw new Error('Presenter not found');
    }

    presenters.forEach(({ format, presenter }) => {
      const presenterKey = `${name}:${format}`;
      methodPresenters?.set(presenterKey, presenter);
    });

    return this;
  }

  get<T, R>({ name, format }: { name: string; format: string }): Presenter<T, R> | undefined {
    const methodPresenters = this.presenters.get(name);
    if (!methodPresenters) return undefined;

    const presenterKey = `${name}:${format}`;
    return methodPresenters.get(presenterKey) as Presenter<T, R> | undefined;
  }
}
