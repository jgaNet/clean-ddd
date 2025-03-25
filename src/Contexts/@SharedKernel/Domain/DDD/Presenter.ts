export interface Presenter<T, R> {
  present(data: T): R;
}
