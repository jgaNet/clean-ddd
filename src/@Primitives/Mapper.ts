/* eslint-disable  @typescript-eslint/no-explicit-any */
export interface Mapper<T, K extends Record<any, any>> {
  toJson(entity: T): K;
  toEntity(json: K): T;
}
