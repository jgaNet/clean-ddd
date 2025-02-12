/* eslint-disable  @typescript-eslint/no-explicit-any */
export interface Mapper<T, K extends Record<any, any>> {
  toJSON(entity: T): K;
  toEntity(json: K): T;
}
