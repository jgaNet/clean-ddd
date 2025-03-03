export interface IEventEmitter {
  emit(event: string, ...args: unknown[]): boolean;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  addListener(event: string, listener: (...args: any[]) => void): this;
}
